#!/usr/bin/env bash
# Cutover step: recreate the OCI worker containers against the OCI database, or roll back.
#
#   switch-workers.sh                  # dry run (default): print the plan, change nothing
#   switch-workers.sh --apply          # switch the workers
#   switch-workers.sh --rollback       # put the previous containers back exactly
#   ... --containers "a b c"           # default: flowmate-crawler flowmate-embedding flowmate-parser
#
# Independent of the ~/flowmate checkout. Everything is read from `docker inspect` of the
# RUNNING containers: the exact running image (by image id, so a later rebuild of a tag such
# as flowmate-embedding:latest cannot sneak in), environment (minus the image's own defaults), published ports, restart policy,
# memory / memory-swap / cpus / shm size, log config, capabilities and command. Only these
# change: DATABASE_URL and DIRECT_URL -> postgresql://flowmate_app:<pw>@flowmate-db:5432/flowmate
# (written to a copy of the env, $FLOWMATE_DB_HOME/workers/<name>.env, 600), --network flowmate,
# --cap-drop NET_RAW. Containers using options this script does not reproduce (mounts, extra
# hosts, ulimits, security options, devices, privileged, custom entrypoint/user/workdir/
# healthcheck) are refused rather than silently changed.
#
# --apply, per container: stop the old one, set its restart policy to "no", rename it
# <name>-pre-oci-<ts> (kept, never removed), start the new one, wait until running (and
# healthy if it has a healthcheck). On failure that container is rolled back and the run stops.
# --rollback, per container with a state file: stop the new one, rename it
# <name>-oci-rolledback-<ts> (kept), rename <name>-pre-oci-<ts> back, restore its restart
# policy and start it -- the original env and network come back unchanged.
# Never prints environment values.
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 PYTHONUTF8=1 PYTHONIOENCODING=utf-8
set -Eeuo pipefail
umask 077
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=common.sh
. "$SCRIPT_DIR/common.sh"

STATE_DIR=${FLOWMATE_WORKERS_STATE_DIR:-$FLOWMATE_DB_HOME/workers}
READY_TIMEOUT=${FLOWMATE_WORKERS_READY_TIMEOUT:-180}
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
ts=$(date -u +%Y%m%dT%H%M%SZ)
install -d -m 700 "$STATE_DIR"
exec 7>"$STATE_DIR/.lock"
flock -n 7 || die "another switch-workers.sh is running"

wait_ready() { # NAME
  local name=$1 state health
  for _ in $(seq 1 "$READY_TIMEOUT"); do
    state=$(docker inspect -f '{{.State.Status}}' "$name" 2>/dev/null || echo missing)
    health=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$name" 2>/dev/null || echo none)
    if [ "$state" = running ] && { [ "$health" = healthy ] || [ "$health" = none ]; }; then return 0; fi
    [ "$state" = exited ] || [ "$state" = dead ] || [ "$state" = missing ] && break
    sleep 1
  done
  log "$name not ready (state=$state health=$health)"
  return 1
}

# plan NAME: fills PLAN_ARGS (docker run args without image/cmd), PLAN_IMAGE, PLAN_CMD,
# PLAN_ENV (env lines for the new container), PLAN_SWAPPED (keys), PLAN_RESTART; dies on refusal.
plan() {
  local name=$1 j ij img ports key val line app_pw new_url
  j=$(docker inspect "$name" 2>/dev/null) || die "container $name not found"
  PLAN_IMAGE_REF=$(jq -r '.[0].Config.Image' <<<"$j")
  PLAN_IMAGE=$(jq -r '.[0].Image' <<<"$j")   # sha256:... of the running container
  ij=$(docker image inspect "$PLAN_IMAGE" 2>/dev/null) || die "$name: running image $PLAN_IMAGE not found locally"
  PLAN_NOTE=""
  if [ "$(docker image inspect -f '{{.Id}}' "$PLAN_IMAGE_REF" 2>/dev/null || echo none)" != "$PLAN_IMAGE" ]; then
    PLAN_NOTE="tag $PLAN_IMAGE_REF now points elsewhere; the running image id is used"
  fi
  [ "$(jq -r '.[0].HostConfig.NetworkMode' <<<"$j")" != flowmate ] || die "$name is already on network flowmate (switched?)"
  # Refuse what we do not reproduce.
  local refuse
  refuse=$(jq -r --argjson img "$ij" '.[0] as $c | $img[0] as $i | [
      (if ($c.Mounts | length) > 0 then "mounts" else empty end),
      (if $c.HostConfig.Privileged then "privileged" else empty end),
      (if ($c.HostConfig.ExtraHosts // [] | length) > 0 then "extra hosts" else empty end),
      (if ($c.HostConfig.Ulimits // [] | length) > 0 then "ulimits" else empty end),
      (if ($c.HostConfig.SecurityOpt // [] | length) > 0 then "security options" else empty end),
      (if ($c.HostConfig.Devices // [] | length) > 0 then "devices" else empty end),
      (if ($c.Config.Entrypoint // null) != ($i.Config.Entrypoint // null) then "custom entrypoint" else empty end),
      (if ($c.Config.User // "") != ($i.Config.User // "") then "custom user" else empty end),
      (if ($c.Config.WorkingDir // "") != ($i.Config.WorkingDir // "") then "custom workdir" else empty end),
      (if ($c.Config.Healthcheck // null) != ($i.Config.Healthcheck // null) then "custom healthcheck" else empty end),
      (if ([$c.Config.Env[]?, $c.Config.Cmd[]?] | any(test("\n"))) then "newline in env/cmd" else empty end)
    ] | join(", ")' <<<"$j")
  [ -z "$refuse" ] || die "$name uses options this script does not reproduce: $refuse"

  PLAN_RESTART=$(jq -r '.[0].HostConfig.RestartPolicy | if .Name == "on-failure" and .MaximumRetryCount > 0 then "on-failure:\(.MaximumRetryCount)" else (.Name // "no") end | if . == "" then "no" else . end' <<<"$j")
  PLAN_ARGS=(--name "$name" --restart "$PLAN_RESTART" --network flowmate)
  ports=$(jq -r '.[0].HostConfig.PortBindings // {} | to_entries[] | .key as $p | .value[] | "\(.HostIp)|\(.HostPort)|\($p)"' <<<"$j")
  while IFS='|' read -r hip hport cport; do
    [ -n "$cport" ] || continue
    if [ -n "$hip" ]; then PLAN_ARGS+=(-p "$hip:$hport:$cport"); else PLAN_ARGS+=(-p "$hport:$cport"); fi
  done <<<"$ports"
  val=$(jq -r '.[0].HostConfig.Memory' <<<"$j"); [ "$val" = 0 ] || PLAN_ARGS+=(--memory "$val")
  val=$(jq -r '.[0].HostConfig.MemorySwap' <<<"$j"); [ "$val" = 0 ] || PLAN_ARGS+=(--memory-swap "$val")
  val=$(jq -r '.[0].HostConfig.NanoCpus' <<<"$j"); [ "$val" = 0 ] || PLAN_ARGS+=(--cpus "$(awk -v n="$val" 'BEGIN { printf "%.3f", n / 1e9 }')")
  val=$(jq -r '.[0].HostConfig.ShmSize' <<<"$j"); [ "$val" = 67108864 ] || PLAN_ARGS+=(--shm-size "$val")
  val=$(jq -r '.[0].HostConfig.LogConfig.Type' <<<"$j")
  if [ "$val" != json-file ] || [ "$(jq -r '.[0].HostConfig.LogConfig.Config | length' <<<"$j")" != 0 ]; then
    PLAN_ARGS+=(--log-driver "$val")
    while IFS= read -r line; do [ -n "$line" ] && PLAN_ARGS+=(--log-opt "$line"); done \
      < <(jq -r '.[0].HostConfig.LogConfig.Config | to_entries[] | "\(.key)=\(.value)"' <<<"$j")
  fi
  while IFS= read -r line; do [ -n "$line" ] && PLAN_ARGS+=(--cap-add "$line"); done < <(jq -r '.[0].HostConfig.CapAdd[]?' <<<"$j")
  while IFS= read -r line; do [ -n "$line" ] && [ "$line" != NET_RAW ] && PLAN_ARGS+=(--cap-drop "$line"); done < <(jq -r '.[0].HostConfig.CapDrop[]?' <<<"$j")
  PLAN_ARGS+=(--cap-drop NET_RAW)
  PLAN_CMD=()
  if [ "$(jq -c '.[0].Config.Cmd' <<<"$j")" != "$(jq -c '.[0].Config.Cmd' <<<"$ij")" ]; then
    mapfile -t PLAN_CMD < <(jq -r '.[0].Config.Cmd[]?' <<<"$j")
  fi

  # Env: container env minus the image's own entries, DB URLs swapped.
  app_pw=$(secret_get FLOWMATE_APP_PASSWORD)
  new_url="postgresql://flowmate_app:${app_pw}@flowmate-db:5432/flowmate"
  PLAN_ENV=()
  PLAN_SWAPPED=()
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    key=${line%%=*}
    case "$key" in
      DATABASE_URL | DIRECT_URL) PLAN_ENV+=("$key=$new_url"); PLAN_SWAPPED+=("$key") ;;
      *) PLAN_ENV+=("$line") ;;
    esac
  done < <(comm -23 <(jq -r '.[0].Config.Env[]?' <<<"$j" | sort) <(jq -r '.[0].Config.Env[]?' <<<"$ij" | sort))
}

describe_plan() { # NAME
  local keys
  keys=$(printf '%s\n' "${PLAN_ENV[@]}" | cut -d= -f1 | sort | tr '\n' ' ')
  printf '%s\n' "== $1"
  printf '   image:   %s = %s (running image id, used as-is)%s\n' "$PLAN_IMAGE_REF" "${PLAN_IMAGE:0:19}" "${PLAN_NOTE:+ NOTE: $PLAN_NOTE}"
  printf '   env:     %s keys from the running container: %s\n' "${#PLAN_ENV[@]}" "$keys"
  printf '   swapped: %s -> postgresql://flowmate_app:***@flowmate-db:5432/flowmate\n' "${PLAN_SWAPPED[*]:-<none: no DB URL in env>}"
  printf '   run:     docker run -d %s --env-file %s %s %s\n' "${PLAN_ARGS[*]}" "$STATE_DIR/$1.env" "$PLAN_IMAGE" "${PLAN_CMD[*]:-}"
}

rollback_one() { # NAME PREV RESTART
  local name=$1 prev=$2 restart=$3
  docker container inspect "$prev" >/dev/null 2>&1 || die "$name: previous container $prev not found"
  if docker container inspect "$name" >/dev/null 2>&1; then
    docker update --restart no "$name" >/dev/null
    docker stop -t 30 "$name" >/dev/null
    docker rename "$name" "$name-oci-rolledback-$ts"
    log "$name: new container kept stopped as $name-oci-rolledback-$ts"
  fi
  docker rename "$prev" "$name"
  docker update --restart "$restart" "$name" >/dev/null
  docker start "$name" >/dev/null
  wait_ready "$name" || die "$name: restored previous container did not become ready"
  log "$name: previous container restored (restart=$restart, original env and network)"
}

case "$mode" in
  dry-run | apply)
    for c in "${containers[@]}"; do plan "$c"; describe_plan "$c"; done
    if [ "$mode" = dry-run ]; then
      log "dry run only: nothing was changed (re-run with --apply)"
      exit 0
    fi
    docker network inspect flowmate >/dev/null 2>&1 || die "network flowmate missing"
    for c in "${containers[@]}"; do
      plan "$c"
      prev="$c-pre-oci-$ts"
      envfile="$STATE_DIR/$c.env"
      printf '%s\n' "${PLAN_ENV[@]}" >"$envfile.tmp"
      chmod 600 "$envfile.tmp"
      mv -f "$envfile.tmp" "$envfile"
      log "$c: stopping (restart policy was $PLAN_RESTART) and keeping it as $prev"
      docker update --restart no "$c" >/dev/null
      docker stop -t 30 "$c" >/dev/null
      docker rename "$c" "$prev"
      printf 'prev=%s\nrestart=%s\nswitched=%s\n' "$prev" "$PLAN_RESTART" "$ts" >"$STATE_DIR/$c.state"
      if docker run -d "${PLAN_ARGS[@]}" --env-file "$envfile" "$PLAN_IMAGE" "${PLAN_CMD[@]}" >/dev/null && wait_ready "$c"; then
        log "$c: switched (network flowmate, NET_RAW dropped, ${PLAN_SWAPPED[*]:-no DB URL} -> flowmate-db)"
      else
        log "$c: new container failed -> rolling back this container"
        rollback_one "$c" "$prev" "$PLAN_RESTART"
        mv -f "$STATE_DIR/$c.state" "$STATE_DIR/$c.state.failed-$ts"
        die "$c: switch failed and was rolled back; later containers were not touched"
      fi
    done
    log "all workers switched; rollback: $0 --rollback"
    ;;
  rollback)
    for c in "${containers[@]}"; do
      sf="$STATE_DIR/$c.state"
      [ -f "$sf" ] || { log "$c: no state file, nothing to roll back"; continue; }
      prev=$(sed -n 's/^prev=//p' "$sf")
      restart=$(sed -n 's/^restart=//p' "$sf")
      [ -n "$prev" ] && [ -n "$restart" ] || die "$c: broken state file $sf"
      rollback_one "$c" "$prev" "$restart"
      mv -f "$sf" "$sf.rolledback-$ts"
    done
    ;;
esac
