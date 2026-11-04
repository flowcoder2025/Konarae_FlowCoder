#!/usr/bin/env bash
# Cutover step: point the OCI workers at the OCI database, or roll that back.
#
#   switch-workers.sh                  # dry run (default): preflight + plan, workers untouched
#   switch-workers.sh --apply          # switch, or resume an interrupted switch
#   switch-workers.sh --rollback       # undo a switch (complete or partial) from the state file
#   switch-workers.sh --done           # after verification: retire the state (ends --rollback)
#   ... --containers "a b c"           # default: flowmate-crawler flowmate-embedding flowmate-parser
#
# Single source of truth for the worker env: ~/flowmate/.env.production (FLOWMATE_WORKERS_ENV_FILE).
# --apply backs it up (600) as .env.production.pre-cutover-<ts> and sets DATABASE_URL and DIRECT_URL
# (exactly one definition each, added if absent; keys parsed the way docker --env-file does, i.e.
# after leading whitespace) to postgresql://flowmate_app:<pw>@flowmate-db:5432/flowmate. The file
# becomes 600; every other line is verified byte-identical; values are never printed. Each worker
# is recreated with
#   env  = .env.production + keys only the running container has (e.g. PORT, NODE_OPTIONS given
#          with -e); keys whose running value differs from the file are listed and the file wins
#   rest = the running container's config (image, ports, restart, memory, cpus, pids, read-only,
#          init, shm, log, caps, labels, dns, hosts, ulimits, tmpfs, cmd, stop signal)
#   plus --network flowmate --cap-drop NET_RAW.
# Fail-closed checks before ANY worker or the env file is touched: flowmate_app logs in from a
# throwaway container on network flowmate; containers with mounts (incl. anonymous VOLUMEs) are
# refused; a worker already on network flowmate is refused only if its running DATABASE_URL is
# already on flowmate-db (the manual rollback path leaves them on flowmate with the Supabase env,
# and those are switched normally); each new container is `docker create`d as <name>-oci-candidate-<ts>, its Config/
# HostConfig diffed against the running one (only name, network, NET_RAW, env may differ) and its
# Config.Env must hold exactly one DATABASE_URL and one DIRECT_URL, both on flowmate-db.
#
# State: $STATE_DIR/switch.state (600, atomic tmp+mv), written before the first mutation and after
# every step. Global phase (the recovery direction): planned -> switching -> complete, or
# rolling_back -> rolled_back. Per container: planned -> restart_disabled -> stopped -> renamed ->
# new_named -> started -> ready (-> rolled_back). Signals and errors are recorded as `interrupted=`.
#   --apply    resumes only from planned/switching; any rollback phase -> use --rollback.
#   --rollback first validates EVERY container (original exists; the name resolves to the original
#              or the candidate; .env.production unchanged since the switch, backup intact) and
#              refuses with zero mutations otherwise, printing the manual path. Valid only until
#              --done or the first `deploy.sh restart`, whichever comes first.
#   complete   requires `docker container inspect -f '{{.Id}} {{.State.Running}}' <name>` == "<candidate> true".
#   rollback   records per-container sub-steps (c.<name>.rb: start [-> cand_removing] -> cand_parked -> orig_named ->
#              orig_restart_set -> orig_started -> finished) and reconciles by the recorded container ids,
#              so a rollback killed between its two renames resumes.
#   deploy.sh  dry run and --apply refuse unless $DEPLOY_SH (the script the manual recovery path and
#              later redeploys use) carries the guard marker `flowmate-deploy-guard:` (runbook step 0b).
# A failure during --apply rolls everything back and keeps switch.state.failed-<ts>.
# Originals are kept stopped as <name>-pre-oci-<ts>; remove them only after --done.
# Merged env files and inspect dumps live in $STATE_DIR/work.<pid> (700) and are deleted on exit.
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
DB_KEYS=(DATABASE_URL DIRECT_URL)
DB_TARGET=flowmate-db:5432/flowmate
DEPLOY_SH=${FLOWMATE_DEPLOY_SH:-/home/ubuntu/flowmate/deploy/oci/deploy.sh}
DEPLOY_GUARD_MARKER='flowmate-deploy-guard: v1'

mode=dry-run
containers=(flowmate-crawler flowmate-embedding flowmate-parser)
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) mode=apply; shift ;;
    --rollback) mode=rollback; shift ;;
    --done) mode=retire; shift ;;
    --dry-run) mode=dry-run; shift ;;
    --containers) [ $# -ge 2 ] || die "--containers needs a value"; read -r -a containers <<<"$2"; shift 2 ;;
    *) echo "usage: $0 [--dry-run|--apply|--rollback|--done] [--containers \"name ...\"]" >&2; exit 2 ;;
  esac
done
command -v jq >/dev/null || die "jq missing"
install -d -m 700 "$STATE_DIR"
exec 7>"$STATE_DIR/.lock"
flock -n 7 || die "another switch-workers.sh is running"
# We hold the lock: any work dir left behind (e.g. a SIGKILLed run) is stale and may hold env copies.
find "$STATE_DIR" -maxdepth 1 -type d -name 'work.*' -exec rm -rf -- {} + 2>/dev/null || true
WORK="$STATE_DIR/work.$$"
install -d -m 700 "$WORK"
created=()   # candidates created by THIS run that are not yet recorded in a state file
mutating=0   # set once workers/env may have been changed; refusals before that leave the state untouched

# ---------------------------------------------------------------- state file
state_get() { [ -f "$STATE" ] && sed -n "s/^$(printf '%s' "$1" | sed 's/[.[\*^$/]/\\&/g')=//p" "$STATE" | tail -n 1 || true; }
state_set() { # KEY VALUE [KEY VALUE ...] -- atomic rewrite
  local tmp="$STATE.tmp.$$" k v
  { [ -f "$STATE" ] && cat "$STATE"; true; } >"$tmp"
  while [ $# -ge 2 ]; do
    k=$1 v=$2
    shift 2
    awk -v k="$k" -F= '{ key=$1 } key != k' "$tmp" >"$tmp.2"
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
  if [ -f "$STATE" ] && [ "$mutating" = 1 ]; then state_set interrupted "$sig at $(date -u +%Y-%m-%dT%H:%M:%SZ)"; fi
  log "INTERRUPTED by $sig: state kept in $STATE; '$0 --apply' resumes a switch, '$0 --rollback' undoes it"
  exit 130
}
on_exit() {
  local rc=$? c
  trap - ERR
  set +e
  if [ ! -f "$STATE" ]; then
    # Nothing recorded yet: candidates of this run would otherwise be orphaned.
    for c in "${created[@]}"; do docker rm -f "$c" >/dev/null 2>&1; done
  elif [ "$rc" != 0 ] && [ "$signaled" = 0 ] && [ "$mutating" = 1 ]; then
    case "$(state_get phase)" in
      complete) ;;
      *) state_set interrupted "exit $rc at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
         log "stopped with exit $rc; state kept in $STATE (phase $(state_get phase))" ;;
    esac
  fi
  rm -rf -- "$WORK"
}
trap 'on_signal HUP' HUP
trap 'on_signal INT' INT
trap 'on_signal TERM' TERM
trap on_exit EXIT

# ---------------------------------------------------------------- helpers
# di FALLBACK FORMAT OBJ: docker container inspect -f, or FALLBACK if no such CONTAINER exists.
# Always `docker container inspect`: the generic docker-inspect of flowmate-crawler falls back to the
# IMAGE of that name when no container has it (all worker names are image tags on OCI). Also,
# docker prints an empty line for a missing object, so `... || echo x` is not enough.
di() { local out; if out=$(docker container inspect -f "$2" "$3" 2>/dev/null); then printf '%s\n' "$out"; else printf '%s\n' "$1"; fi; }
wait_ready() { # NAME_OR_ID -- running (and healthy if it has a healthcheck); fail fast on crash loops
  local c=$1 st rc health started st2 rc2 started2
  for _ in $(seq 1 "$READY_TIMEOUT"); do
    read -r st rc health started < <(di "missing 0 none -" '{{.State.Status}} {{.RestartCount}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} {{.State.StartedAt}}' "$c")
    case "$st" in
      running)
        [ "$health" = healthy ] && return 0
        [ "$health" = unhealthy ] && { log "$c is unhealthy"; return 1; }
        if [ "$health" = none ]; then
          # No healthcheck: "running" can be the first milliseconds of a crash loop. It must
          # stay up for $SETTLE s with the same start time and no restarts.
          sleep "$SETTLE"
          read -r st2 rc2 started2 < <(di "missing 0 -" '{{.State.Status}} {{.RestartCount}} {{.State.StartedAt}}' "$c")
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

# ---------------------------------------------------------------- env files (docker --env-file semantics)
# docker: strip leading whitespace; skip empty and '#' lines; KEY=VALUE split at the first '=';
# the value is taken verbatim (no unquoting); a key with whitespace is an error; a line without
# '=' imports the variable from the caller's environment (refused here: not reproducible).
env_key() { # LINE -> docker key ("" for comments/blank lines)
  local line=${1#"${1%%[![:space:]]*}"}
  [ -z "$line" ] || [ "${line:0:1}" = "#" ] && return 0
  printf '%s' "${line%%=*}"
}
env_file_lines() { # FILE -> KEY=VALUE lines as docker reads them; dies on what docker rejects
  local line key
  while IFS= read -r line || [ -n "$line" ]; do
    line=${line#"${line%%[![:space:]]*}"}
    [ -z "$line" ] || [ "${line:0:1}" = "#" ] && continue
    [[ $line == *=* ]] || die "$1: a line without '=' (docker would read it from the environment)"
    key=${line%%=*}
    [ -n "$key" ] && [[ ! $key =~ [[:space:]] ]] || die "$1: invalid variable name on a KEY=VALUE line"
    printf '%s\n' "$line"
  done <"$1"
}
url_target() { sed -E 's|^"?[a-z]+://[^@]*@([^/?"]+)/([^?"]*).*|\1/\2|'; }   # host:port/db, never the password
db_key_count() { # FILE KEY -> number of docker-visible definitions
  env_file_lines "$1" | awk -F= -v k="$2" '$1 == k { n++ } END { print n + 0 }'
}
new_db_url() { printf 'postgresql://flowmate_app:%s@flowmate-db:5432/flowmate' "$(secret_get FLOWMATE_APP_PASSWORD)"; }

# Rewrite FILE: exactly one DATABASE_URL and one DIRECT_URL, both the worker URL; stdout.
env_rewritten() {
  local src=$1 url line key k seen_db=0 seen_direct=0
  for k in "${DB_KEYS[@]}"; do
    [ "$(db_key_count "$src" "$k")" -le 1 ] || die "$src defines $k more than once (docker would use the last one); fix the file first"
  done
  url=$(new_db_url)
  while IFS= read -r line || [ -n "$line" ]; do
    key=$(env_key "$line")
    case "$key" in
      DATABASE_URL) printf 'DATABASE_URL=%s\n' "$url"; seen_db=1 ;;
      DIRECT_URL) printf 'DIRECT_URL=%s\n' "$url"; seen_direct=1 ;;
      *) printf '%s\n' "$line" ;;
    esac
  done <"$src"
  [ "$seen_db" = 1 ] || printf 'DATABASE_URL=%s\n' "$url"
  [ "$seen_direct" = 1 ] || printf 'DIRECT_URL=%s\n' "$url"
}
non_db_lines() { # FILE -> raw lines whose docker key is not a DB key
  local line
  while IFS= read -r line || [ -n "$line" ]; do
    case "$(env_key "$line")" in DATABASE_URL | DIRECT_URL) ;; *) printf '%s\n' "$line" ;; esac
  done <"$1"
}
env_check_db() { # LABEL then KEY=VALUE lines on stdin: exactly one of each DB key, on flowmate-db
  local label=$1 lines k n t
  lines=$(cat)
  for k in "${DB_KEYS[@]}"; do
    n=$(grep -c "^$k=" <<<"$lines" || true)
    [ "$n" = 1 ] || { log "$label: $n definitions of $k (expected exactly 1)"; return 1; }
    t=$(sed -n "s/^$k=//p" <<<"$lines" | url_target)
    [ "$t" = "$DB_TARGET" ] || { log "$label: $k does not point at $DB_TARGET"; return 1; }
  done
}

# Host of a postgres URL on a strict parse only, else "unparseable" (the same parse as deploy.sh's
# db_url_host); never echoes any part of the value.
db_url_host() {
  local v=$1 re='^postgres(ql)?://[^@/[:space:]]+@([A-Za-z0-9.-]+)(:[0-9]{1,5})?/[A-Za-z0-9_.-]+([?][^[:space:]]*)?$'
  v=${v#\"}
  v=${v%\"}
  if [[ $v =~ $re ]]; then printf '%s' "${BASH_REMATCH[2]}"; else printf 'unparseable'; fi
}
# A worker already on network flowmate is refused only when it is already switched (its running
# DATABASE_URL is on flowmate-db). The manual rollback path (deploy.sh restart with
# FLOWMATE_ALLOW_NON_OCI_DB=1) leaves workers on network flowmate with the Supabase env; those are
# switched like a worker on the default bridge. Fails closed on zero/duplicate/unparseable values.
network_precheck() { # NAME
  local name=$1 lines n host
  [ "$(di missing '{{.HostConfig.NetworkMode}}' "$name")" = flowmate ] || return 0
  lines=$(docker container inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$name") || die "$name: cannot read its env"
  n=$(grep -c '^DATABASE_URL=' <<<"$lines" || true)
  [ "$n" = 1 ] || die "$name is on network flowmate with $n DATABASE_URL definitions in its running env (expected exactly 1); refusing, nothing was changed"
  host=$(db_url_host "$(sed -n 's/^DATABASE_URL=//p' <<<"$lines")")
  case "$host" in
    unparseable) die "$name is on network flowmate and its running DATABASE_URL cannot be parsed (value not shown); refusing, nothing was changed" ;;
    "${DB_TARGET%%:*}") die "$name is already switched: on network flowmate and its running DATABASE_URL already targets ${DB_TARGET%%:*}; nothing to do (a recorded switch is finished with --done or undone with --rollback)" ;;
  esac
  log "$name is on network flowmate with a non-OCI DB (manual-rollback state); switching it"
}

deploy_preflight() { # the deploy.sh that redeploys and the manual recovery path use must be the guarded one
  if [ ! -r "$DEPLOY_SH" ] || ! grep -qF "$DEPLOY_GUARD_MARKER" "$DEPLOY_SH"; then
    die "$DEPLOY_SH is not the guarded deploy.sh (marker '$DEPLOY_GUARD_MARKER' missing): install it first (README cutover step 0b)"
  fi
  # A merge/stash conflict can leave a file that still carries the marker but is not a usable script.
  if grep -qE '^(<<<<<<<|>>>>>>>)' "$DEPLOY_SH"; then
    die "$DEPLOY_SH contains git conflict markers: reinstall the guarded deploy.sh (README cutover step 0b)"
  fi
  if ! bash -n "$DEPLOY_SH" 2>/dev/null; then
    die "$DEPLOY_SH does not parse (bash -n failed): reinstall the guarded deploy.sh (README cutover step 0b)"
  fi
  log "deploy.sh preflight ok: $DEPLOY_SH carries '$DEPLOY_GUARD_MARKER' and parses"
}
db_preflight() {
  if [ "$TEST_MODE" = 1 ] && [ "${FLOWMATE_WORKERS_SKIP_DB_PREFLIGHT:-0}" = 1 ]; then log "DB preflight skipped (test mode)"; return 0; fi
  docker network inspect flowmate >/dev/null 2>&1 || die "network flowmate missing"
  local img out
  img=$(docker container inspect -f '{{.Config.Image}}' "$DB_CONTAINER") || die "$DB_CONTAINER not found"
  out=$(PGPASSWORD=$(secret_get FLOWMATE_APP_PASSWORD) timeout 60 docker run --rm --network flowmate -e PGPASSWORD "$img" \
    psql -X -At "host=flowmate-db port=5432 user=flowmate_app dbname=flowmate connect_timeout=10" -c "SELECT 'preflight-ok'" 2>&1 | tail -n 1) || true
  [ "$out" = preflight-ok ] || die "DB preflight failed: flowmate_app cannot log in to flowmate-db:5432 from network flowmate (${out:0:160})"
  log "DB preflight ok: flowmate_app@flowmate-db:5432 SELECT 1 from network flowmate"
}

# Build `docker create` args for NAME from the running container. Sets ARGS, CMD, IMAGE_ID.
build_args() {
  local name=$1 cand=$2 envfile=$3 j ij line hip hport cport val
  j=$(docker container inspect "$name") || die "container $name not found"
  # Fail closed on mounts (bind, named or anonymous volumes from an image VOLUME): their data would
  # not follow a recreated container. The live workers have none (checked 2026-11-03).
  [ "$(jq -r '.[0].Mounts | length' <<<"$j")" = 0 ] ||
    die "$name has mounts ($(jq -r '[.[0].Mounts[] | .Type] | join(",")' <<<"$j")): not supported, nothing was changed"
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


# Merged env for NAME: rewritten env file + keys only the running container has -> $WORK/NAME.env.
build_env() {
  local name=$1 out=$2 j ij line key file_keys running_only
  j=$(cat "$WORK/$name.old.json")
  ij=$(docker image inspect "$(jq -r '.[0].Image' <<<"$j")")
  env_file_lines "$WORK/env.new" >"$out"
  chmod 600 "$out"
  file_keys=$(cut -d= -f1 "$out" | sort -u)
  running_only=$(comm -23 <(jq -r '.[0].Config.Env[]?' <<<"$j" | sort) <(jq -r '.[0].Config.Env[]?' <<<"$ij" | sort) |
    while IFS= read -r line; do key=${line%%=*}; grep -qxF -- "$key" <<<"$file_keys" || printf '%s\n' "$line"; done)
  [ -z "$running_only" ] || printf '%s\n' "$running_only" >>"$out"
  RUNNING_ONLY_KEYS=$(printf '%s\n' "$running_only" | cut -d= -f1 | grep . | tr '\n' ' ' || true)
  DIFF_KEYS=$(comm -12 <(jq -r '.[0].Config.Env[]?' <<<"$j" | cut -d= -f1 | sort -u) <(printf '%s\n' "$file_keys") |
    while IFS= read -r key; do
      case "$key" in DATABASE_URL | DIRECT_URL) continue ;; esac
      [ "$(jq -r --arg k "$key" '.[0].Config.Env[]? | select(startswith($k + "=")) | sub("^[^=]*="; "")' <<<"$j")" = "$(sed -n "s/^${key}=//p" "$out" | tail -n 1)" ] || printf '%s ' "$key"
    done)
}

# ---------------------------------------------------------------- .env.production (single source)
env_verify_edited() { # FILE BACKUP
  env_file_lines "$1" | env_check_db "$1" || return 1
  diff -q <(non_db_lines "$1") <(non_db_lines "$2") >/dev/null || { log "$1: lines other than DATABASE_URL/DIRECT_URL changed"; return 1; }
  [ "$(stat -c %a "$1")" = 600 ] || { log "$1: mode is not 600"; return 1; }
}
env_switch() {
  local ts backup
  ts=$(state_get ts)
  backup=$(state_get env_backup)
  if [ "$(state_get env_phase)" = planned ]; then
    [ "$(sha256sum <"$ENV_SRC" | cut -d' ' -f1)" = "$(state_get env_sha_before)" ] ||
      { log "$ENV_SRC changed since planning"; return 1; }
    { cp -p -- "$ENV_SRC" "$backup.tmp" && chmod 600 "$backup.tmp" && mv -f -- "$backup.tmp" "$backup"; } || return 1
    [ "$(sha256sum <"$backup" | cut -d' ' -f1)" = "$(state_get env_sha_before)" ] || { log "env backup does not match the original"; return 1; }
    state_set env_phase backed_up
    log "backed up $ENV_SRC -> $backup (600)"
  fi
  if [ "$(state_get env_phase)" = backed_up ]; then
    { env_rewritten "$backup" >"$ENV_SRC.tmp.$ts" && chmod 600 "$ENV_SRC.tmp.$ts" && mv -f -- "$ENV_SRC.tmp.$ts" "$ENV_SRC"; } || return 1
    state_set env_phase edited env_sha_after "$(sha256sum <"$ENV_SRC" | cut -d' ' -f1)"
    env_verify_edited "$ENV_SRC" "$backup" || return 1
    log "$ENV_SRC: DATABASE_URL/DIRECT_URL -> $DB_TARGET (exactly one each; other lines unchanged; mode 600)"
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
  # Called in a condition context (errexit is off here): every step checks its own status.
  local name=$1 orig cand prev ph
  orig=$(state_get "c.$name.orig_id"); cand=$(state_get "c.$name.cand_id"); prev=$(state_get "c.$name.prev")
  docker container inspect "$cand" >/dev/null 2>&1 || { log "$name: candidate container is gone"; return 1; }
  ph=$(phase_idx "$(state_get "c.$name.phase")")
  if [ "$ph" -lt "$(phase_idx restart_disabled)" ]; then docker update --restart no "$orig" >/dev/null || return 1; cphase_set "$name" restart_disabled; fi
  if [ "$ph" -lt "$(phase_idx stopped)" ]; then docker stop -t 30 "$orig" >/dev/null || return 1; cphase_set "$name" stopped; fi
  if [ "$ph" -lt "$(phase_idx renamed)" ]; then
    [ "$(docker container inspect -f '{{.Name}}' "$orig")" = "/$prev" ] || docker rename "$orig" "$prev" || return 1
    cphase_set "$name" renamed
  fi
  if [ "$ph" -lt "$(phase_idx new_named)" ]; then
    [ "$(docker container inspect -f '{{.Name}}' "$cand")" = "/$name" ] || docker rename "$cand" "$name" || return 1
    cphase_set "$name" new_named
  fi
  if [ "$ph" -lt "$(phase_idx started)" ]; then docker start "$cand" >/dev/null || return 1; cphase_set "$name" started; fi
  if [ "$ph" -lt "$(phase_idx ready)" ]; then
    wait_ready "$cand" || return 1
    cphase_set "$name" ready
    log "$name: switched (network flowmate, NET_RAW dropped, DB -> flowmate-db); original kept as $prev"
  fi
}
test_crash_point() { # LABEL -- test mode only: SIGKILL ourselves here (no trap runs)
  if [ "$TEST_MODE" = 1 ] && [ "${FLOWMATE_WORKERS_CRASH_AFTER:-}" = "$1" ]; then kill -KILL $$; fi
  return 0
}
rb_set() { # NAME SUBSTEP
  state_set "c.$1.rb" "$2"
  test_crash_point "$1:rb:$2"
}
rollback_container() { # idempotent, driven by the recorded container ids and the rb sub-step
  local name=$1 orig cand restart ts park started
  orig=$(state_get "c.$name.orig_id"); cand=$(state_get "c.$name.cand_id")
  restart=$(state_get "c.$name.orig_restart"); ts=$(state_get ts)
  park="$name-oci-rolledback-$ts"
  [ -n "$(state_get "c.$name.rb")" ] || rb_set "$name" start
  if [ -n "$cand" ] && docker container inspect "$cand" >/dev/null 2>&1; then
    started=$(di "" '{{.State.StartedAt}}' "$cand")
    if [ "${started:0:4}" != 0001 ]; then
      # It ran: keep it, stopped and out of the way.
      docker update --restart no "$cand" >/dev/null
      docker stop -t 30 "$cand" >/dev/null
      [ "$(di "" '{{.Name}}' "$cand")" = "/$park" ] || docker rename "$cand" "$park"
      log "$name: new container kept stopped as $park"
    else
      # Created, never started: holds nothing. Record the step first: if we die right after the
      # rm, the name resolves to nothing and the candidate is gone; rb=cand_removing tells the
      # preflight that this is our own half-done rollback (safe to resume: the original is
      # renamed back next), not an outside change.
      rb_set "$name" cand_removing
      docker rm -f "$cand" >/dev/null
      test_crash_point "$name:rb:cand_removed"
    fi
  fi
  rb_set "$name" cand_parked
  [ "$(di "" '{{.Name}}' "$orig")" = "/$name" ] || docker rename "$orig" "$name"
  rb_set "$name" orig_named
  docker update --restart "$restart" "$orig" >/dev/null
  rb_set "$name" orig_restart_set
  [ "$(di false '{{.State.Running}}' "$orig")" = true ] || docker start "$orig" >/dev/null
  wait_ready "$orig" || die "$name: original container did not become ready again"
  rb_set "$name" orig_started
  state_set "c.$name.phase" rolled_back "c.$name.rb" finished
  log "$name: original restored (restart=$restart, original env and network)"
}

manual_path() {
  local b
  b=$(state_get env_backup)
  cat >&2 <<EOF
Manual recovery (the automatic rollback is no longer safe):
  1. restore the worker env:  cp -p $b $ENV_SRC   (check: sha256sum $ENV_SRC == $(state_get env_sha_before | cut -c1-12)...)
  2. recreate the workers on that env:
       FLOWMATE_ALLOW_NON_OCI_DB=1 CRAWLER_IMAGE=<ref> EMBEDDING_IMAGE=<ref> PARSER_IMAGE=<ref> $DEPLOY_SH restart
     (refs: docker container inspect -f '{{.Config.Image}}' <name>-pre-oci-$(state_get ts))
  3. retire the state: mv $STATE $STATE.manual-$(state_get ts)
EOF
}
# Every precondition of --rollback, for every container, BEFORE anything is touched.
rollback_preflight() {
  local c orig cand ph cur rb cand_ok problems=() b
  for c in "${containers[@]}"; do
    orig=$(state_get "c.$c.orig_id"); cand=$(state_get "c.$c.cand_id"); ph=$(state_get "c.$c.phase")
    [ -n "$orig" ] || continue   # not part of this run's plan
    case "$ph" in planned | restart_disabled | stopped | renamed | new_named | started | ready | rolled_back) ;;
      *) problems+=("$c: unknown phase '$ph'"); continue ;; esac
    docker container inspect "$orig" >/dev/null 2>&1 || { problems+=("$c: original container ${orig:0:12} no longer exists"); continue; }
    cur=$(di none '{{.Id}}' "$c")
    rb=$(state_get "c.$c.rb")
    cand_ok=0
    { [ -n "$cand" ] && docker container inspect "$cand" >/dev/null 2>&1; } && cand_ok=1
    if [ "$cur" = "$orig" ] || { [ -n "$cand" ] && [ "$cur" = "$cand" ]; }; then :
    elif [ "$cur" = none ] && [ "$ph" = renamed ]; then :          # between the two renames of --apply
    elif [ "$cur" = none ] && [ -n "$rb" ] && { [ "$cand_ok" = 1 ] || [ "$rb" != start ]; }; then :
      # between the two renames of an interrupted --rollback: the candidate has been parked
      # (or removed, rb >= cand_parked) and the original still has to get its name back
    elif [ "$cur" = none ]; then problems+=("$c: no container named $c (phase $ph${rb:+, rollback step $rb})")
    else problems+=("$c: '$c' is now container ${cur:0:12}, neither the original nor the candidate (redeployed?)"); fi
  done
  case "$(state_get env_phase)" in
    backed_up | edited)
      b=$(state_get env_backup)
      { [ -f "$b" ] && [ "$(sha256sum <"$b" | cut -d' ' -f1)" = "$(state_get env_sha_before)" ]; } ||
        problems+=("env backup $b missing or changed")
      if [ "$(state_get env_phase)" = edited ] && [ "$(sha256sum <"$ENV_SRC" | cut -d' ' -f1)" != "$(state_get env_sha_after)" ]; then
        problems+=("$ENV_SRC was changed after the switch (restoring the backup would discard that)")
      fi ;;
  esac
  if [ "${#problems[@]}" -gt 0 ]; then
    log "--rollback refused, nothing was changed:"
    printf '  %s\n' "${problems[@]}" >&2
    manual_path
    return 1
  fi
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
complete_check() { # every container: the name runs the candidate
  local c want got ok=0
  for c in "${containers[@]}"; do
    want="$(state_get "c.$c.cand_id") true"
    got=$(di missing '{{.Id}} {{.State.Running}}' "$c")
    [ "$got" = "$want" ] || { log "$c: expected the new container running under this name, found: ${got:0:12} ${got##* }"; ok=1; }
  done
  return "$ok"
}
validate_state() { # per-container phases must be known
  local c ph
  for c in "${containers[@]}"; do
    ph=$(state_get "c.$c.phase")
    [ "$(phase_idx "$ph")" -ge 0 ] || [ "$ph" = rolled_back ] || die "$STATE: unknown phase '$ph' for $c; inspect by hand"
  done
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
  docker container inspect "$cand" >"$WORK/$name.cand.json"
  jq -r "$norm" "$WORK/$name.old.json" >"$WORK/$name.old.flat"
  jq -r "$norm" "$WORK/$name.cand.json" >"$WORK/$name.cand.flat"
  if ! diff -q "$WORK/$name.old.flat" "$WORK/$name.cand.flat" >/dev/null; then
    log "$name: the recreated container would differ from the running one in:"
    diff "$WORK/$name.old.flat" "$WORK/$name.cand.flat" | sed -nE 's/^[<>] ([^=]*)=.*/  \1/p' | sort -u >&2
    return 1
  fi
}


# ---------------------------------------------------------------- main
plan_fresh() { # dry-run / first --apply: everything validated before the state file exists
  [ -r "$ENV_SRC" ] || die "cannot read $ENV_SRC"
  env_file_lines "$ENV_SRC" >/dev/null
  deploy_preflight
  db_preflight
  env_rewritten "$ENV_SRC" >"$WORK/env.new"
  env_file_lines "$WORK/env.new" | env_check_db "rewritten $ENV_SRC" || die "rewrite check failed"
  local ts c cand
  ts=$(date -u +%Y%m%dT%H%M%SZ)
  st_pairs=(ts "$ts" containers "${containers[*]}" phase planned env_phase planned env_src "$ENV_SRC"
    env_backup "$ENV_SRC.pre-cutover-$ts" env_sha_before "$(sha256sum <"$ENV_SRC" | cut -d' ' -f1)")
  for c in "${containers[@]}"; do
    network_precheck "$c"
    cand="$c-oci-candidate-$ts"
    build_args "$c" "$cand" "$WORK/$c.env"
    build_env "$c" "$WORK/$c.env"
    docker create "${ARGS[@]}" "$IMAGE_REF" "${CMD[@]}" >/dev/null || die "$c: docker create failed"
    created+=("$cand")
    config_diff "$c" "$cand" || die "$c: not reproducible; nothing was stopped"
    docker container inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$cand" | env_check_db "$c candidate Config.Env" ||
      die "$c: candidate env check failed; nothing was stopped"
    rm -f -- "$WORK/$c.env"   # read by `docker create`; no copy of the env is kept
    printf '== %s\n   image: %s (running image id %s; created from %s)\n   env:   from %s; running-only keys kept: %s; differ from running (file wins): %s\n   checks: config diff clean (besides name, network flowmate, NET_RAW, env); exactly one DATABASE_URL and DIRECT_URL, both on %s\n' \
      "$c" "$(jq -r '.[0].Config.Image' "$WORK/$c.old.json")" "${IMAGE_ID:7:12}" "$([ "$IMAGE_REF" = "$IMAGE_ID" ] && echo "the image id" || echo "the same ref")" \
      "$ENV_SRC" "${RUNNING_ONLY_KEYS:-<none>}" "${DIFF_KEYS:-<none>}" "$DB_TARGET"
    st_pairs+=("c.$c.orig_id" "$(jq -r '.[0].Id' "$WORK/$c.old.json")"
      "c.$c.orig_restart" "$(jq -r '.[0].HostConfig.RestartPolicy | if .Name == "on-failure" and .MaximumRetryCount > 0 then "on-failure:\(.MaximumRetryCount)" elif (.Name // "") == "" then "no" else .Name end' "$WORK/$c.old.json")"
      "c.$c.prev" "$c-pre-oci-$ts" "c.$c.cand_id" "$(docker container inspect -f '{{.Id}}' "$cand")" "c.$c.phase" planned)
  done
}

case "$mode" in
  dry-run)
    [ ! -f "$STATE" ] || die "$STATE exists (phase $(state_get phase)); dry run only before a switch"
    plan_fresh
    log "dry run: preflight ok, candidates created, checked and removed; workers and $ENV_SRC untouched"
    ;;   # on_exit removes this run's candidates (no state file)
  apply)
    if [ -f "$STATE" ]; then
      read -r -a containers <<<"$(state_get containers)"
      validate_state
      case "$(state_get phase)" in
        planned | switching) log "resuming the switch recorded in $STATE (phase $(state_get phase); $(state_get interrupted))" ;;
        complete) log "already complete; verify, then '$0 --done' (or '$0 --rollback')"; exit 0 ;;
        rolling_back | rolled_back) die "$STATE records a rollback (phase $(state_get phase)); finish it with '$0 --rollback'" ;;
        *) die "$STATE: unknown phase '$(state_get phase)'" ;;
      esac
      state_set interrupted ""
    else
      plan_fresh
      state_set "${st_pairs[@]}"   # recovery metadata BEFORE any worker or the env file is touched
      created=()
    fi
    deploy_preflight
    db_preflight
    mutating=1
    state_set phase switching
    failed=0
    if ! env_switch; then failed=1; fi
    for c in "${containers[@]}"; do
      [ "$failed" = 1 ] && break
      [ "$(state_get "c.$c.phase")" = ready ] && continue
      if ! apply_container "$c"; then failed=1; fi
    done
    if [ "$failed" = 0 ] && [ "$TEST_MODE" = 1 ] && [ -n "${FLOWMATE_WORKERS_TEST_STOP_BEFORE_COMPLETE:-}" ]; then
      docker stop -t 5 "$FLOWMATE_WORKERS_TEST_STOP_BEFORE_COMPLETE" >/dev/null
    fi
    if [ "$failed" = 0 ] && ! complete_check; then failed=1; fi
    if [ "$failed" = 1 ]; then
      log "switch failed -> rolling back everything"
      rollback_preflight || die "automatic rollback refused; state kept in $STATE"
      rollback_all
      mv -f -- "$STATE" "$STATE.failed-$(state_get ts)"
      die "switch failed and was rolled back (state: $STATE.failed-*)"
    fi
    state_set phase complete
    log "all workers switched; .env.production points at flowmate-db. After verification: '$0 --done'. Until then '$0 --rollback' undoes it (not after a deploy.sh restart)."
    ;;
  rollback)
    [ -f "$STATE" ] || die "no $STATE: nothing to roll back (after --done or a manual recovery, see README)"
    read -r -a containers <<<"$(state_get containers)"
    validate_state
    rollback_preflight || exit 1
    mutating=1
    rollback_all
    mv -f -- "$STATE" "$STATE.rolledback-$(state_get ts)"
    log "rolled back; originals running, $ENV_SRC restored"
    ;;
  retire)
    [ -f "$STATE" ] || die "no $STATE"
    read -r -a containers <<<"$(state_get containers)"
    [ "$(state_get phase)" = complete ] || die "phase is $(state_get phase), not complete"
    complete_check || die "the switched containers are not all running under their names; not retiring the state"
    ts=$(state_get ts)
    mv -f -- "$STATE" "$STATE.done-$ts"
    log "switch retired ($STATE.done-$ts); --rollback is no longer available. The originals <name>-pre-oci-$ts may now be removed (user approval)."
    ;;
esac
