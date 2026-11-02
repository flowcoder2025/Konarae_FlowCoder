#!/usr/bin/env bash
# Cutover step: point the OCI workers at the OCI database, or roll that back.
#
#   switch-workers.sh                  # dry run (default): preflight + plan, workers untouched
#   switch-workers.sh --apply          # switch (or resume an interrupted switch)
#   switch-workers.sh --rollback       # undo a switch, complete or partial, from the state file
#   ... --containers "a b c"           # default: flowmate-crawler flowmate-embedding flowmate-parser
#
# Single source of truth for the worker env: ~/flowmate/.env.production (FLOWMATE_WORKERS_ENV_FILE).
# --apply backs it up (600) as .env.production.pre-cutover-<ts>, rewrites DATABASE_URL/DIRECT_URL to
# postgresql://flowmate_app:<pw>@flowmate-db:5432/flowmate (file mode 600, every other line
# byte-identical, verified without printing values) and recreates each worker with
#   env  = .env.production (docker --env-file semantics) + keys only the running container has
#          (e.g. PORT, NODE_OPTIONS passed with -e); keys whose running value differs from the
#          file are listed (names only) and the file wins
#   rest = the running container's config (image id, ports, restart policy, memory, cpus, pids,
#          read-only, init, shm, log, caps, labels, dns, hosts, ulimits, tmpfs, cmd, stop signal)
#   plus --network flowmate --cap-drop NET_RAW.
# The new container is first `docker create`d as <name>-oci-candidate-<ts> and its Config/HostConfig
# are diffed against the running one; anything but the expected differences (name/id/network/
# NET_RAW/env) aborts BEFORE a worker is stopped. A throwaway psql container on network flowmate
# must log in as flowmate_app first (password via env, never argv).
#
# Crash safety: the state file ($STATE_DIR/switch.state, 600, atomic tmp+mv) is written before any
# worker or the env file is touched and updated after every step (per-container phase:
# planned -> restart_disabled -> stopped -> renamed -> new_named -> started -> ready). A signal
# (INT/TERM/HUP) or an error records `interrupted=`. --apply resumes forward, --rollback restores
# the originals from any phase (the original keeps its name, restart policy and env; the started
# new container is kept stopped as <name>-oci-rolledback-<ts>; a never-started candidate is removed;
# .env.production is restored from the backup and checked by sha256). A failure during --apply rolls
# everything back and renames the state to switch.state.failed-<ts>.
# Original containers are kept stopped as <name>-pre-oci-<ts>. Never prints environment values.
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 PYTHONUTF8=1 PYTHONIOENCODING=utf-8
set -Eeuo pipefail
umask 077
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=common.sh
. "$SCRIPT_DIR/common.sh"

STATE_DIR=${FLOWMATE_WORKERS_STATE_DIR:-$FLOWMATE_DB_HOME/workers}
STATE=$STATE_DIR/switch.state
ENV_SRC=${FLOWMATE_WORKERS_ENV_FILE:-/home/ubuntu/flowmate/.env.production}
READY_TIMEOUT=${FLOWMATE_WORKERS_READY_TIMEOUT:-180}
SETTLE=${FLOWMATE_WORKERS_SETTLE_SECONDS:-15}   # no healthcheck: must stay up this long without restarts
TEST_MODE=${FLOWMATE_TEST_MODE:-0}
PHASES=(planned restart_disabled stopped renamed new_named started ready)

mode=dry-run
containers=(flowmate-crawler flowmate-embedding flowmate-parser)
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) mode=apply; shift ;;
    --rollback) mode=rollback; shift ;;
    --dry-run) mode=dry-run; shift ;;
    --containers) [ $# -ge 2 ] || die "--containers needs a value"; read -r -a containers <<<"$2"; shift 2 ;;
    *) echo "usage: $0 [--dry-run|--apply|--rollback] [--containers \"name ...\"]" >&2; exit 2 ;;
  esac
done
command -v jq >/dev/null || die "jq missing"
install -d -m 700 "$STATE_DIR"
exec 7>"$STATE_DIR/.lock"
flock -n 7 || die "another switch-workers.sh is running"
WORK=$(mktemp -d)

# ---------------------------------------------------------------- state file
state_get() { [ -f "$STATE" ] && sed -n "s/^$(printf '%s' "$1" | sed 's/[.[\*^$/]/\\&/g')=//p" "$STATE" | tail -n 1 || true; }
state_set() { # KEY VALUE [KEY VALUE ...] -- atomic rewrite
  local tmp="$STATE.tmp.$$" k v
  { [ -f "$STATE" ] && cat "$STATE"; true; } >"$tmp"
  while [ $# -ge 2 ]; do
    k=$1 v=$2
    shift 2
    awk -v k="$k" -F= 'BEGIN{OFS="="} { key=$1 } key != k' "$tmp" >"$tmp.2"
    printf '%s=%s\n' "$k" "$v" >>"$tmp.2"
    mv -f "$tmp.2" "$tmp"
  done
  chmod 600 "$tmp"
  mv -f "$tmp" "$STATE"
}
phase_idx() { local i; for i in "${!PHASES[@]}"; do [ "${PHASES[$i]}" = "$1" ] && { echo "$i"; return; }; done; echo -1; }
cphase_set() { # NAME PHASE (+ test hooks)
  state_set "c.$1.phase" "$2"
  if [ "$TEST_MODE" = 1 ]; then
    [ "${FLOWMATE_WORKERS_CRASH_AFTER:-}" = "$1:$2" ] && kill -KILL $$
    [ "${FLOWMATE_WORKERS_SIGNAL_AFTER:-}" = "$1:$2" ] && kill -HUP $$
  fi
  return 0
}

signaled=0
on_signal() {
  local sig=$1
  signaled=1
  if [ -f "$STATE" ]; then state_set interrupted "$sig at $(date -u +%Y-%m-%dT%H:%M:%SZ)"; fi
  log "INTERRUPTED by $sig: state kept in $STATE; run '$0 --apply' to resume or '$0 --rollback' to undo"
  rm -rf -- "$WORK"
  exit 130
}
on_exit() {
  local rc=$?
  trap - ERR
  if [ "$rc" != 0 ] && [ "$signaled" = 0 ] && [ -f "$STATE" ] && [ "$(state_get phase)" != complete ]; then
    state_set interrupted "exit $rc at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    log "stopped with exit $rc; state kept in $STATE ($0 --apply resumes, --rollback undoes)"
  fi
  rm -rf -- "$WORK"
}
trap 'on_signal HUP' HUP
trap 'on_signal INT' INT
trap 'on_signal TERM' TERM
trap on_exit EXIT

# ---------------------------------------------------------------- helpers
wait_ready() { # NAME_OR_ID -- running (and healthy if it has a healthcheck); fail fast on crash loops
  local c=$1 st rc health started st2 rc2 started2
  for _ in $(seq 1 "$READY_TIMEOUT"); do
    read -r st rc health started < <(docker inspect -f '{{.State.Status}} {{.RestartCount}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} {{.State.StartedAt}}' "$c" 2>/dev/null || echo "missing 0 none -")
    case "$st" in
      running)
        [ "$health" = healthy ] && return 0
        [ "$health" = unhealthy ] && { log "$c is unhealthy"; return 1; }
        if [ "$health" = none ]; then
          # No healthcheck: "running" can be the first milliseconds of a crash loop. It must
          # stay up for $SETTLE s with the same start time and no restarts.
          sleep "$SETTLE"
          read -r st2 rc2 started2 < <(docker inspect -f '{{.State.Status}} {{.RestartCount}} {{.State.StartedAt}}' "$c" 2>/dev/null || echo "missing 0 -")
          [ "$st2" = running ] && [ "$rc2" = "$rc" ] && [ "$started2" = "$started" ] && return 0
          log "$c did not stay up (state=$st2 restarts=$rc2)"
          return 1
        fi ;;
      restarting | exited | dead | missing) if [ "$st" != restarting ] || [ "$rc" -gt 0 ]; then log "$c is $st (restarts: $rc)"; return 1; fi ;;
    esac
    sleep 1
  done
  log "$c not ready after ${READY_TIMEOUT}s (state=$st health=$health)"
  return 1
}

# Parse an env file with docker --env-file semantics (no unquoting), emit KEY=VALUE lines.
env_file_lines() {
  local line
  while IFS= read -r line || [ -n "$line" ]; do
    line=${line#"${line%%[![:space:]]*}"}
    [ -z "$line" ] || [ "${line:0:1}" = "#" ] && continue
    [[ $line == *=* ]] || die "$ENV_SRC: line without '=' (docker would read it from the environment): ${line%%=*}"
    printf '%s\n' "$line"
  done <"$1"
}
url_target() { sed -E 's|^"?[a-z]+://[^@]*@([^/?"]+)/([^?"]*).*|\1/\2|'; }   # host:port/db, never the password

new_db_url() { printf 'postgresql://flowmate_app:%s@flowmate-db:5432/flowmate' "$(secret_get FLOWMATE_APP_PASSWORD)"; }

# Rewrite DATABASE_URL / DIRECT_URL in a copy of FILE; output on stdout.
env_rewritten() {
  local url line
  url=$(new_db_url)
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      DATABASE_URL=* | DIRECT_URL=*) printf '%s=%s\n' "${line%%=*}" "$url" ;;
      *) printf '%s\n' "$line" ;;
    esac
  done <"$1"
}

db_preflight() {
  if [ "$TEST_MODE" = 1 ] && [ "${FLOWMATE_WORKERS_SKIP_DB_PREFLIGHT:-0}" = 1 ]; then log "DB preflight skipped (test mode)"; return 0; fi
  docker network inspect flowmate >/dev/null 2>&1 || die "network flowmate missing"
  local img out
  img=$(docker inspect -f '{{.Config.Image}}' "$DB_CONTAINER") || die "$DB_CONTAINER not found"
  out=$(PGPASSWORD=$(secret_get FLOWMATE_APP_PASSWORD) timeout 60 docker run --rm --network flowmate -e PGPASSWORD "$img" \
    psql -X -At "host=flowmate-db port=5432 user=flowmate_app dbname=flowmate connect_timeout=10" -c "SELECT 'preflight-ok'" 2>&1 | tail -n 1) || true
  [ "$out" = preflight-ok ] || die "DB preflight failed: flowmate_app cannot log in to flowmate-db:5432 from network flowmate (${out:0:160})"
  log "DB preflight ok: flowmate_app@flowmate-db:5432 SELECT 1 from network flowmate"
}

# Build `docker create` args for NAME from the running container. Sets ARGS, CMD, IMAGE_ID.
build_args() {
  local name=$1 cand=$2 envfile=$3 j ij line hip hport cport val
  j=$(docker inspect "$name") || die "container $name not found"
  IMAGE_ID=$(jq -r '.[0].Image' <<<"$j")
  ij=$(docker image inspect "$IMAGE_ID") || die "$name: running image $IMAGE_ID not found locally"
  # Create from the same ref as before when it still resolves to the running image (keeps
  # `docker ps` readable), otherwise from the image id (a rebuilt tag must not sneak in).
  IMAGE_REF=$(jq -r '.[0].Config.Image' <<<"$j")
  [ "$(docker image inspect -f '{{.Id}}' "$IMAGE_REF" 2>/dev/null || true)" = "$IMAGE_ID" ] || IMAGE_REF=$IMAGE_ID
  ARGS=(--name "$cand" --network flowmate --env-file "$envfile")
  ARGS+=(--restart "$(jq -r '.[0].HostConfig.RestartPolicy | if .Name == "on-failure" and .MaximumRetryCount > 0 then "on-failure:\(.MaximumRetryCount)" elif (.Name // "") == "" then "no" else .Name end' <<<"$j")")
  while IFS='|' read -r hip hport cport; do
    [ -n "$cport" ] || continue
    if [ -n "$hip" ]; then ARGS+=(-p "$hip:$hport:$cport"); else ARGS+=(-p "$hport:$cport"); fi
  done < <(jq -r '.[0].HostConfig.PortBindings // {} | to_entries[] | .key as $p | .value[] | "\(.HostIp)|\(.HostPort)|\($p)"' <<<"$j")
  num_arg() { val=$(jq -r "$1 // 0" <<<"$j"); [ "$val" = 0 ] || [ "$val" = null ] || ARGS+=("$2" "$val"); }
  num_arg '.[0].HostConfig.Memory' --memory
  num_arg '.[0].HostConfig.MemorySwap' --memory-swap
  num_arg '.[0].HostConfig.MemoryReservation' --memory-reservation
  num_arg '.[0].HostConfig.CpuQuota' --cpu-quota
  num_arg '.[0].HostConfig.CpuPeriod' --cpu-period
  num_arg '.[0].HostConfig.CpuShares' --cpu-shares
  num_arg '.[0].HostConfig.PidsLimit' --pids-limit
  val=$(jq -r '.[0].HostConfig.NanoCpus // 0' <<<"$j"); [ "$val" = 0 ] || ARGS+=(--cpus "$(awk -v n="$val" 'BEGIN { printf "%.3f", n / 1e9 }')")
  val=$(jq -r '.[0].HostConfig.ShmSize' <<<"$j"); [ "$val" = 67108864 ] || ARGS+=(--shm-size "$val")
  [ "$(jq -r '.[0].HostConfig.ReadonlyRootfs' <<<"$j")" = true ] && ARGS+=(--read-only)
  [ "$(jq -r '.[0].HostConfig.Init // false' <<<"$j")" = true ] && ARGS+=(--init)
  [ "$(jq -r '.[0].HostConfig.Privileged' <<<"$j")" = true ] && ARGS+=(--privileged)
  ARGS+=(--log-driver "$(jq -r '.[0].HostConfig.LogConfig.Type' <<<"$j")")
  while IFS= read -r line; do [ -n "$line" ] && ARGS+=(--log-opt "$line"); done < <(jq -r '.[0].HostConfig.LogConfig.Config // {} | to_entries[] | "\(.key)=\(.value)"' <<<"$j")
  while IFS= read -r line; do [ -n "$line" ] && ARGS+=(--cap-add "$line"); done < <(jq -r '.[0].HostConfig.CapAdd[]?' <<<"$j")
  while IFS= read -r line; do [ -n "$line" ] && [ "$line" != NET_RAW ] && ARGS+=(--cap-drop "$line"); done < <(jq -r '.[0].HostConfig.CapDrop[]?' <<<"$j")
  ARGS+=(--cap-drop NET_RAW)
  while IFS= read -r line; do [ -n "$line" ] && ARGS+=(--security-opt "$line"); done < <(jq -r '.[0].HostConfig.SecurityOpt[]?' <<<"$j")
  while IFS= read -r line; do [ -n "$line" ] && ARGS+=(--dns "$line"); done < <(jq -r '.[0].HostConfig.Dns[]?' <<<"$j")
  while IFS= read -r line; do [ -n "$line" ] && ARGS+=(--dns-search "$line"); done < <(jq -r '.[0].HostConfig.DnsSearch[]?' <<<"$j")
  while IFS= read -r line; do [ -n "$line" ] && ARGS+=(--dns-option "$line"); done < <(jq -r '.[0].HostConfig.DnsOptions[]?' <<<"$j")
  while IFS= read -r line; do [ -n "$line" ] && ARGS+=(--add-host "$line"); done < <(jq -r '.[0].HostConfig.ExtraHosts[]?' <<<"$j")
  while IFS= read -r line; do [ -n "$line" ] && ARGS+=(--ulimit "$line"); done < <(jq -r '.[0].HostConfig.Ulimits[]? | "\(.Name)=\(.Soft):\(.Hard)"' <<<"$j")
  while IFS= read -r line; do [ -n "$line" ] && ARGS+=(--tmpfs "$line"); done < <(jq -r '.[0].HostConfig.Tmpfs // {} | to_entries[] | if .value == "" then .key else "\(.key):\(.value)" end' <<<"$j")
  # labels that are not inherited from the image
  while IFS= read -r line; do [ -n "$line" ] && ARGS+=(--label "$line"); done < <(jq -r --argjson i "$ij" '(.[0].Config.Labels // {}) as $c | ($i[0].Config.Labels // {}) as $il | $c | to_entries[] | select($il[.key] != .value) | "\(.key)=\(.value)"' <<<"$j")
  val=$(jq -r '.[0].Config.StopSignal // ""' <<<"$j"); [ -z "$val" ] || [ "$val" = "$(jq -r '.[0].Config.StopSignal // ""' <<<"$ij")" ] || ARGS+=(--stop-signal "$val")
  val=$(jq -r '.[0].Config.StopTimeout // ""' <<<"$j"); [ -z "$val" ] || ARGS+=(--stop-timeout "$val")
  val=$(jq -r '.[0].Config.User // ""' <<<"$j"); [ "$val" = "$(jq -r '.[0].Config.User // ""' <<<"$ij")" ] || ARGS+=(--user "$val")
  val=$(jq -r '.[0].Config.WorkingDir // ""' <<<"$j"); [ "$val" = "$(jq -r '.[0].Config.WorkingDir // ""' <<<"$ij")" ] || ARGS+=(--workdir "$val")
  CMD=()
  if [ "$(jq -c '.[0].Config.Cmd' <<<"$j")" != "$(jq -c '.[0].Config.Cmd' <<<"$ij")" ]; then
    mapfile -t CMD < <(jq -r '.[0].Config.Cmd[]?' <<<"$j")
  fi
  printf '%s\n' "$j" >"$WORK/$name.old.json"
}

# Merged env for NAME: env file + keys only the running container has. Writes ENVFILE (600).
build_env() {
  local name=$1 out=$2 j ij key
  j=$(cat "$WORK/$name.old.json")
  ij=$(docker image inspect "$(jq -r '.[0].Image' <<<"$j")")
  env_file_lines "$WORK/env.new" >"$out"
  chmod 600 "$out"
  local file_keys running_only differs
  file_keys=$(cut -d= -f1 "$out" | sort -u)
  running_only=$(comm -23 <(jq -r '.[0].Config.Env[]?' <<<"$j" | sort) <(jq -r '.[0].Config.Env[]?' <<<"$ij" | sort) |
    while IFS= read -r line; do key=${line%%=*}; grep -qxF -- "$key" <<<"$file_keys" || printf '%s\n' "$line"; done)
  [ -z "$running_only" ] || printf '%s\n' "$running_only" >>"$out"
  differs=$(comm -12 <(jq -r '.[0].Config.Env[]?' <<<"$j" | cut -d= -f1 | sort -u) <(printf '%s\n' "$file_keys") |
    while IFS= read -r key; do
      case "$key" in DATABASE_URL | DIRECT_URL) continue ;; esac
      [ "$(jq -r --arg k "$key" '.[0].Config.Env[]? | select(startswith($k + "=")) | sub("^[^=]*="; "")' <<<"$j")" = "$(sed -n "s/^${key}=//p" "$out" | tail -n 1)" ] || printf '%s ' "$key"
    done)
  RUNNING_ONLY_KEYS=$(printf '%s\n' "$running_only" | cut -d= -f1 | grep . | tr '\n' ' ' || true)
  DIFF_KEYS=$differs
}

# Compare old vs candidate inspect; print differing paths (no values). Return 1 on unexpected diffs.
# Ignored: identity/volatile fields, NetworkMode, NET_RAW in CapDrop, Env (built from
# .env.production on purpose), and MaskedPaths/ReadonlyPaths (daemon defaults that grew with newer
# Docker releases; they can only be changed via SecurityOpt, which is compared).
config_diff() {
  local name=$1 cand=$2 norm
  # shellcheck disable=SC2016  # jq program
  norm='.[0] | {Image, Config: (.Config | del(.Hostname, .Env, .Image, .AttachStdin, .AttachStdout, .AttachStderr)),
         HostConfig: (.HostConfig | del(.NetworkMode, .ConsoleSize, .ContainerIDFile, .MaskedPaths, .ReadonlyPaths)
           | .CapDrop = (((.CapDrop // []) - ["NET_RAW", "CAP_NET_RAW"]) | if length == 0 then null else . end))}
       | [paths(scalars) as $p | "\($p | map(tostring) | join("."))=\(getpath($p) | tostring)"] | sort | .[]'
  docker inspect "$cand" >"$WORK/$name.cand.json"
  jq -r "$norm" "$WORK/$name.old.json" >"$WORK/$name.old.flat"
  jq -r "$norm" "$WORK/$name.cand.json" >"$WORK/$name.cand.flat"
  if ! diff -q "$WORK/$name.old.flat" "$WORK/$name.cand.flat" >/dev/null; then
    log "$name: the recreated container would differ from the running one in:"
    diff "$WORK/$name.old.flat" "$WORK/$name.cand.flat" | sed -nE 's/^[<>] ([^=]*)=.*/  \1/p' | sort -u >&2
    return 1
  fi
}

# ---------------------------------------------------------------- env file (single source)
env_verify_edited() { # FILE BACKUP -- DB keys point at flowmate-db, every other line identical
  local f=$1 b=$2 k t
  for k in DATABASE_URL DIRECT_URL; do
    grep -q "^$k=" "$b" || continue
    t=$(sed -n "s/^$k=//p" "$f" | tail -n 1 | url_target)
    [ "$t" = flowmate-db:5432/flowmate ] || { log "$ENV_SRC: $k points to $t after the edit"; return 1; }
  done
  diff -q <(grep -vE '^(DATABASE_URL|DIRECT_URL)=' "$f") <(grep -vE '^(DATABASE_URL|DIRECT_URL)=' "$b") >/dev/null ||
    { log "$ENV_SRC: lines other than DATABASE_URL/DIRECT_URL changed"; return 1; }
  [ "$(stat -c %a "$f")" = 600 ] || { log "$ENV_SRC: mode is not 600"; return 1; }
}
env_switch() {
  local ts backup
  ts=$(state_get ts)
  backup=$(state_get env_backup)
  if [ "$(state_get env_phase)" = planned ]; then
    cp -p -- "$ENV_SRC" "$backup.tmp" && chmod 600 "$backup.tmp" && mv -f -- "$backup.tmp" "$backup" || return 1
    [ "$(sha256sum <"$backup" | cut -d' ' -f1)" = "$(state_get env_sha_before)" ] ||
      { log "env backup does not match the original (changed since planning?)"; return 1; }
    state_set env_phase backed_up
    log "backed up $ENV_SRC -> $backup (600)"
  fi
  if [ "$(state_get env_phase)" = backed_up ]; then
    { env_rewritten "$backup" >"$ENV_SRC.tmp.$ts" && chmod 600 "$ENV_SRC.tmp.$ts" && mv -f -- "$ENV_SRC.tmp.$ts" "$ENV_SRC"; } || return 1
    state_set env_phase edited
    env_verify_edited "$ENV_SRC" "$backup" || return 1
    log "$ENV_SRC: DATABASE_URL/DIRECT_URL -> flowmate-db:5432/flowmate (other lines unchanged, mode 600)"
  fi
}
env_restore() {
  local backup
  backup=$(state_get env_backup)
  case "$(state_get env_phase)" in
    backed_up | edited)
      cp -p -- "$backup" "$ENV_SRC.tmp.restore"
      mv -f -- "$ENV_SRC.tmp.restore" "$ENV_SRC"
      [ "$(sha256sum <"$ENV_SRC" | cut -d' ' -f1)" = "$(state_get env_sha_before)" ] || die "restored $ENV_SRC does not match its pre-cutover sha256"
      state_set env_phase restored
      log "$ENV_SRC restored from $backup (sha256 verified)" ;;
  esac
}

# ---------------------------------------------------------------- per-container transitions
apply_container() {
  local name=$1 orig cand prev ph
  orig=$(state_get "c.$name.orig_id"); cand=$(state_get "c.$name.cand_id"); prev=$(state_get "c.$name.prev")
  # Called in a condition context (errexit is off here): every step checks its own status.
  docker container inspect "$cand" >/dev/null 2>&1 || { log "$name: candidate container is gone"; return 1; }
  ph=$(phase_idx "$(state_get "c.$name.phase")")
  if [ "$ph" -lt "$(phase_idx restart_disabled)" ]; then docker update --restart no "$orig" >/dev/null || return 1; cphase_set "$name" restart_disabled; fi
  if [ "$ph" -lt "$(phase_idx stopped)" ]; then docker stop -t 30 "$orig" >/dev/null || return 1; cphase_set "$name" stopped; fi
  if [ "$ph" -lt "$(phase_idx renamed)" ]; then
    [ "$(docker inspect -f '{{.Name}}' "$orig")" = "/$prev" ] || docker rename "$orig" "$prev" || return 1
    cphase_set "$name" renamed
  fi
  if [ "$ph" -lt "$(phase_idx new_named)" ]; then
    [ "$(docker inspect -f '{{.Name}}' "$cand")" = "/$name" ] || docker rename "$cand" "$name" || return 1
    cphase_set "$name" new_named
  fi
  if [ "$ph" -lt "$(phase_idx started)" ]; then docker start "$cand" >/dev/null || return 1; cphase_set "$name" started; fi
  if [ "$ph" -lt "$(phase_idx ready)" ]; then
    wait_ready "$cand" || return 1
    cphase_set "$name" ready
    log "$name: switched (network flowmate, NET_RAW dropped, DB -> flowmate-db); original kept as $prev"
  fi
}
rollback_container() {
  local name=$1 orig cand restart ts ph
  orig=$(state_get "c.$name.orig_id"); cand=$(state_get "c.$name.cand_id")
  restart=$(state_get "c.$name.orig_restart"); ts=$(state_get ts)
  ph=$(phase_idx "$(state_get "c.$name.phase")")
  if [ -n "$cand" ] && docker container inspect "$cand" >/dev/null 2>&1; then
    if [ "$ph" -ge "$(phase_idx started)" ]; then
      docker update --restart no "$cand" >/dev/null
      docker stop -t 30 "$cand" >/dev/null
      [ "$(docker inspect -f '{{.Name}}' "$cand")" = "/$name-oci-rolledback-$ts" ] || docker rename "$cand" "$name-oci-rolledback-$ts"
      log "$name: new container kept stopped as $name-oci-rolledback-$ts"
    else
      docker rm -f "$cand" >/dev/null   # created, never started: holds nothing
    fi
  fi
  docker container inspect "$orig" >/dev/null 2>&1 || die "$name: original container $orig not found"
  [ "$(docker inspect -f '{{.Name}}' "$orig")" = "/$name" ] || docker rename "$orig" "$name"
  docker update --restart "$restart" "$orig" >/dev/null
  [ "$(docker inspect -f '{{.State.Running}}' "$orig")" = true ] || docker start "$orig" >/dev/null
  wait_ready "$orig" || die "$name: original container did not become ready again"
  state_set "c.$name.phase" rolled_back
  log "$name: original restored (restart=$restart, original env and network)"
}
rollback_all() {
  local i c
  state_set phase rolling_back
  for ((i = ${#containers[@]} - 1; i >= 0; i--)); do
    c=${containers[$i]}
    [ -n "$(state_get "c.$c.orig_id")" ] || continue
    [ "$(state_get "c.$c.phase")" = rolled_back ] || rollback_container "$c"
  done
  env_restore
  state_set phase rolled_back
}

# ---------------------------------------------------------------- main
case "$mode" in
  dry-run | apply)
    if [ "$mode" = apply ] && [ -f "$STATE" ]; then
      [ "$(state_get phase)" = complete ] && { log "already switched ($STATE); use --rollback to undo"; exit 0; }
      read -r -a containers <<<"$(state_get containers)"
      log "resuming an interrupted switch from $STATE (phase $(state_get phase), $(state_get interrupted))"
      state_set interrupted ""
    else
      [ ! -f "$STATE" ] || die "$STATE exists (phase $(state_get phase)); use --apply to resume or --rollback"
      [ -r "$ENV_SRC" ] || die "cannot read $ENV_SRC"
      grep -q '^DATABASE_URL=' "$ENV_SRC" || die "$ENV_SRC has no DATABASE_URL line"
      env_file_lines "$ENV_SRC" >/dev/null
      db_preflight
      env_rewritten "$ENV_SRC" >"$WORK/env.new"
      ts=$(date -u +%Y%m%dT%H%M%SZ)
      created=()
      st_pairs=(ts "$ts" containers "${containers[*]}" phase planned env_phase planned
        env_backup "$ENV_SRC.pre-cutover-$ts" env_sha_before "$(sha256sum <"$ENV_SRC" | cut -d' ' -f1)")
      cleanup_candidates() { local c; for c in "${created[@]}"; do docker rm -f "$c" >/dev/null 2>&1 || true; done; }
      for c in "${containers[@]}"; do
        [ "$(docker inspect -f '{{.HostConfig.NetworkMode}}' "$c" 2>/dev/null || echo missing)" != flowmate ] || die "$c is already on network flowmate"
        envdir=$STATE_DIR; [ "$mode" = dry-run ] && envdir=$WORK
        build_args "$c" "$c-oci-candidate-$ts" "$envdir/$c.env"
        build_env "$c" "$envdir/$c.env"
        if ! docker create "${ARGS[@]}" "$IMAGE_REF" "${CMD[@]}" >/dev/null; then cleanup_candidates; die "$c: docker create failed"; fi
        created+=("$c-oci-candidate-$ts")
        if ! config_diff "$c" "$c-oci-candidate-$ts"; then cleanup_candidates; die "$c: not reproducible; nothing was stopped"; fi
        printf '== %s\n   image: %s (running image id %s; created from %s)\n   env:   from %s; running-only keys kept: %s; differ from running (file wins): %s\n   config diff vs running: none besides name, network flowmate, NET_RAW, env\n' \
          "$c" "$(jq -r '.[0].Config.Image' "$WORK/$c.old.json")" "${IMAGE_ID:7:12}" "$([ "$IMAGE_REF" = "$IMAGE_ID" ] && echo "the image id" || echo "the same ref")" "$ENV_SRC" "${RUNNING_ONLY_KEYS:-<none>}" "${DIFF_KEYS:-<none>}"
        st_pairs+=("c.$c.orig_id" "$(jq -r '.[0].Id' "$WORK/$c.old.json")"
          "c.$c.orig_restart" "$(jq -r '.[0].HostConfig.RestartPolicy | if .Name == "on-failure" and .MaximumRetryCount > 0 then "on-failure:\(.MaximumRetryCount)" elif (.Name // "") == "" then "no" else .Name end' "$WORK/$c.old.json")"
          "c.$c.prev" "$c-pre-oci-$ts" "c.$c.cand_id" "$(docker inspect -f '{{.Id}}' "$c-oci-candidate-$ts")" "c.$c.phase" planned)
      done
      # Recovery metadata is persisted BEFORE any worker or the env file is touched.
      [ "$mode" = dry-run ] || state_set "${st_pairs[@]}"
      if [ "$mode" = dry-run ]; then
        cleanup_candidates
        log "dry run: preflight ok, candidates created, diffed and removed; workers and $ENV_SRC untouched"
        exit 0
      fi
    fi
    db_preflight
    state_set phase switching
    failed=0
    if ! env_switch; then failed=1; fi
    for c in "${containers[@]}"; do
      [ "$failed" = 1 ] && break
      [ "$(state_get "c.$c.phase")" = ready ] && continue
      if ! apply_container "$c"; then failed=1; fi
    done
    if [ "$failed" = 1 ]; then
      log "switch failed -> rolling back everything"
      rollback_all
      mv -f -- "$STATE" "$STATE.failed-$(state_get ts)"
      die "switch failed and was rolled back (state: $STATE.failed-*)"
    fi
    state_set phase complete
    log "all workers switched; .env.production points at flowmate-db; undo with: $0 --rollback"
    ;;
  rollback)
    [ -f "$STATE" ] || die "no $STATE: nothing to roll back"
    read -r -a containers <<<"$(state_get containers)"
    rollback_all
    mv -f -- "$STATE" "$STATE.rolledback-$(state_get ts)"
    log "rolled back; originals running, $ENV_SRC restored"
    ;;
esac
