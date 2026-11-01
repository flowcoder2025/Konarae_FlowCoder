#!/usr/bin/env bash
# switch-workers.sh against a THROWAWAY container (never the real workers): dry run changes
# nothing; --apply recreates it on network flowmate with NET_RAW dropped, DB URLs swapped and
# everything else equal; --rollback restores the original container (same id, env, network).
# Needs docker, jq, the `flowmate` network and the pgbouncer image (no VOLUME, no
# HEALTHCHECK, like the workers; the db image declares a VOLUME and would be refused).
#
#   bash deploy/oci/db/tests/switch-workers.test.sh
# shellcheck disable=SC2015  # `check && ok ... || bad ...`: ok() always succeeds
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 PYTHONUTF8=1 PYTHONIOENCODING=utf-8
set -euo pipefail
DB_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
image=$(docker inspect -f '{{.Config.Image}}' flowmate-pgbouncer)
name="flowmate-swtest-$$"
work=$(mktemp -d)
cleanup() {
  for c in $(docker ps -a --filter "name=^${name}" --format '{{.Names}}'); do docker rm -f -v "$c" >/dev/null 2>&1 || true; done
  rm -rf -- "$work"
}
trap cleanup EXIT
printf 'FLOWMATE_APP_PASSWORD=%s\n' "$(openssl rand -hex 32)" >"$work/.env"
chmod 600 "$work/.env"

docker run -d --name "$name" --restart always -p 127.0.0.1:39997:8080 --memory 128m --memory-swap 128m \
  -e DATABASE_URL=postgresql://u:oldpw@old.example:5432/legacy -e DIRECT_URL=postgresql://u:oldpw@old.example:5432/legacy \
  -e NODE_OPTIONS='--max-old-space-size=96 --expose-gc' -e PORT=8080 -e FOO_KEY=keep-me \
  "$image" sleep 86400 >/dev/null
orig_id=$(docker inspect -f '{{.Id}}' "$name")

sw() { env FLOWMATE_ENV_FILE="$work/.env" FLOWMATE_WORKERS_STATE_DIR="$work/state" FLOWMATE_WORKERS_READY_TIMEOUT=30 \
  bash "$DB_DIR/switch-workers.sh" "$@" --containers "$name"; }
envval() { docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$1" | sed -n "s/^$2=//p"; }
dbhost() { envval "$1" "$2" | sed -E 's|^[a-z]+://[^@]*@([^/]+)/(.*)$|\1/\2|'; }   # host:port/db only, never the password
pass=0
fail=0
ok() { echo "ok   $1"; pass=$((pass + 1)); }
bad() { echo "FAIL $1"; fail=$((fail + 1)); }

sw >"$work/dry.out" 2>&1 || { cat "$work/dry.out"; bad "dry run failed"; }
[ "$(docker inspect -f '{{.Id}} {{.HostConfig.NetworkMode}}' "$name")" = "$orig_id bridge" ] && grep -q 'dry run only' "$work/dry.out" &&
  ! grep -q oldpw "$work/dry.out" && ok "dry run: nothing changed, no secrets printed" || bad "dry run changed something"

sw --apply >"$work/apply.out" 2>&1 || { cat "$work/apply.out"; bad "apply failed"; }
new_id=$(docker inspect -f '{{.Id}}' "$name")
[ "$new_id" != "$orig_id" ] && ok "apply: container recreated" || bad "apply: same container"
[ "$(docker inspect -f '{{.HostConfig.NetworkMode}}' "$name")" = flowmate ] && ok "apply: network flowmate" || bad "apply: network"
docker inspect -f '{{.HostConfig.CapDrop}}' "$name" | grep -q NET_RAW && ok "apply: NET_RAW dropped" || bad "apply: NET_RAW"
[ "$(dbhost "$name" DATABASE_URL)" = flowmate-db:5432/flowmate ] && [ "$(dbhost "$name" DIRECT_URL)" = flowmate-db:5432/flowmate ] &&
  ok "apply: DATABASE_URL/DIRECT_URL -> flowmate-db:5432/flowmate" || bad "apply: DB URLs"
[ "$(envval "$name" NODE_OPTIONS)" = '--max-old-space-size=96 --expose-gc' ] && [ "$(envval "$name" PORT)" = 8080 ] &&
  [ "$(envval "$name" FOO_KEY)" = keep-me ] && ok "apply: other env kept (NODE_OPTIONS, PORT, FOO_KEY)" || bad "apply: env changed"
[ "$(docker inspect -f '{{.HostConfig.RestartPolicy.Name}} {{.HostConfig.Memory}} {{.HostConfig.MemorySwap}} {{json .HostConfig.PortBindings}} {{json .Config.Cmd}}' "$name")" = \
  'always 134217728 134217728 {"8080/tcp":[{"HostIp":"127.0.0.1","HostPort":"39997"}]} ["sleep","86400"]' ] &&
  ok "apply: restart, memory, ports, cmd kept" || bad "apply: settings changed"
prev=$(docker ps -a --filter "name=^${name}-pre-oci-" --format '{{.Names}}')
[ -n "$prev" ] && [ "$(docker inspect -f '{{.Id}} {{.State.Status}} {{.HostConfig.RestartPolicy.Name}}' "$prev")" = "$orig_id exited no" ] &&
  ok "apply: original kept stopped as $prev (restart=no)" || bad "apply: original container not kept"
[ "$(stat -c %a "$work/state/$name.env")" = 600 ] && ok "apply: env copy is 600" || bad "apply: env copy perms"
! grep -q oldpw "$work/apply.out" && ok "apply: no secrets printed" || bad "apply printed a secret"

sw --rollback >"$work/rb.out" 2>&1 || { cat "$work/rb.out"; bad "rollback failed"; }
[ "$(docker inspect -f '{{.Id}} {{.State.Status}} {{.HostConfig.NetworkMode}} {{.HostConfig.RestartPolicy.Name}}' "$name")" = "$orig_id running bridge always" ] &&
  ok "rollback: original container back (same id, running, bridge, restart always)" || bad "rollback: original not restored"
[ "$(dbhost "$name" DATABASE_URL)" = old.example:5432/legacy ] && ok "rollback: original DATABASE_URL" || bad "rollback: env"
rb=$(docker ps -a --filter "name=^${name}-oci-rolledback-" --format '{{.Names}}')
[ -n "$rb" ] && [ "$(docker inspect -f '{{.Id}} {{.State.Status}}' "$rb")" = "$new_id exited" ] &&
  ok "rollback: new container kept stopped as $rb" || bad "rollback: new container handling"

echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
