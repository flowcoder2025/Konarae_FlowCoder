#!/usr/bin/env bash
# switch-workers.sh against THROWAWAY containers and a throwaway env file (never the real workers
# or ~/flowmate/.env.production). Needs docker, jq, network `flowmate` and the pgbouncer image
# (no VOLUME/HEALTHCHECK, like the workers). Run on OCI:
#
#   bash deploy/oci/db/tests/switch-workers.test.sh
#
# Covers: dry run changes nothing; apply edits the env file (single source) and recreates the
# container with read-only/init/pids/cpu/dns/tmpfs/labels/log options preserved; rollback restores
# container + env file; unsupported config aborts before anything is stopped; SIGKILL after
# "stopped" resumes with --apply; HUP after "renamed" is recorded and --rollback recovers; a
# crash-looping new container fails fast and everything is rolled back (.failed state); a failing
# DB preflight touches nothing.
# shellcheck disable=SC2015,SC2016,SC2046  # `check && ok || bad` (ok always succeeds); literal $DATABASE_URL for the fixture; ids word-split on purpose
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 PYTHONUTF8=1 PYTHONIOENCODING=utf-8
set -uo pipefail
DB_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
image=$(docker inspect -f '{{.Config.Image}}' flowmate-pgbouncer)
pfx="flowmate-swtest-$$"
work=$(mktemp -d)
cleanup() {
  for c in $(docker ps -a --filter "name=^${pfx}" --format '{{.Names}}'); do docker rm -f -v "$c" >/dev/null 2>&1 || true; done
  rm -rf -- "$work"
}
trap cleanup EXIT
printf 'FLOWMATE_APP_PASSWORD=%s\n' "$(openssl rand -hex 32)" >"$work/.env"
chmod 600 "$work/.env"
pass=0
fail=0
ok() { echo "ok   $1"; pass=$((pass + 1)); }
bad() { echo "FAIL $1"; fail=$((fail + 1)); }

sdir=""
scenario() { # NAME: fresh dir with its own .env.production and state dir
  sdir="$work/$1"
  mkdir -p "$sdir"
  envfile "$sdir/.env.production"
  orig_sha=$(sha "$sdir/.env.production")
}
envfile() { # PATH: the fixture .env.production (comment, blank line, quoted value kept literal by docker)
  cat >"$1" <<'EOF'
# fixture
DATABASE_URL=postgresql://u:oldpw@old.example:5432/legacy
DIRECT_URL=postgresql://u:oldpw@old.example:5433/legacy

FOO_KEY=file-value
QUOTED="kept-literal"
EOF
  chmod 664 "$1"
}
fixture() { # NAME [extra docker run args...] -- running "worker" built like deploy.sh does
  local n=$1
  shift
  docker run -d --name "$n" --restart always -p 127.0.0.1:39997:8080 --memory 128m --memory-swap 128m \
    --env-file "$sdir/.env.production" -e NODE_OPTIONS='--max-old-space-size=96 --expose-gc' -e PORT=8080 \
    -e FOO_KEY=running-value "$@" >/dev/null
  for _ in $(seq 1 20); do [ "$(docker inspect -f '{{.State.Status}}' "$n")" = running ] && return 0; sleep 1; done
  echo "fixture $n did not start"; return 1
}
sw() { env FLOWMATE_ENV_FILE="$work/.env" FLOWMATE_WORKERS_STATE_DIR="$sdir/state" FLOWMATE_WORKERS_ENV_FILE="$sdir/.env.production" \
  FLOWMATE_WORKERS_READY_TIMEOUT=60 FLOWMATE_WORKERS_SETTLE_SECONDS=5 FLOWMATE_TEST_MODE=1 FLOWMATE_WORKERS_SKIP_DB_PREFLIGHT=1 "${extra_env[@]}" \
  bash "$DB_DIR/switch-workers.sh" "$@"; }
envval() { docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$1" | sed -n "s/^$2=//p"; }
target() { sed -E 's|^[a-z]+://[^@]*@([^/]+)/(.*)$|\1/\2|'; }   # host:port/db, never the password
sha() { sha256sum <"$1" | cut -d' ' -f1; }
insp() { docker inspect -f "$2" "$1" 2>/dev/null; }
extra_env=()

# ---------------------------------------------------------------- A/B/C: dry run, apply, rollback
scenario a
n="$pfx-a"
fixture "$n" --init --read-only --tmpfs /etc/pgbouncer:uid=70,gid=70 --pids-limit 64 --cpu-quota 50000 --dns 1.1.1.1 \
  --label test.label=yes --log-opt max-size=1m --log-opt max-file=2 "$image" sleep 86400
orig_id=$(insp "$n" '{{.Id}}')

sw --containers "$n" >"$work/a.out" 2>&1
[ "$(insp "$n" '{{.Id}} {{.State.Status}} {{.HostConfig.NetworkMode}}')" = "$orig_id running bridge" ] &&
  [ "$(sha "$sdir/.env.production")" = "$orig_sha" ] && [ ! -f "$sdir/state/switch.state" ] &&
  [ -z "$(docker ps -a -q --filter "name=^$n-oci-candidate")" ] && ! grep -q oldpw "$work/a.out" &&
  ok "dry run: container, env file and state untouched, candidate removed, no secrets printed" || { cat "$work/a.out"; bad "dry run"; }

sw --apply --containers "$n" >"$work/b.out" 2>&1 || { cat "$work/b.out"; bad "apply exited non-zero"; }
new_id=$(insp "$n" '{{.Id}}')
[ "$new_id" != "$orig_id" ] && [ "$(insp "$n" '{{.HostConfig.NetworkMode}}')" = flowmate ] &&
  insp "$n" '{{.HostConfig.CapDrop}}' | grep -q NET_RAW && ok "apply: recreated on network flowmate with NET_RAW dropped" || bad "apply: network/caps"
[ "$(insp "$n" '{{.HostConfig.ReadonlyRootfs}} {{.HostConfig.Init}} {{.HostConfig.PidsLimit}} {{.HostConfig.CpuQuota}} {{.HostConfig.Dns}} {{json .HostConfig.Tmpfs}} {{index .Config.Labels "test.label"}} {{json .HostConfig.LogConfig.Config}} {{.HostConfig.RestartPolicy.Name}} {{.HostConfig.Memory}} {{json .HostConfig.PortBindings}}')" = \
  'true true 64 50000 [1.1.1.1] {"/etc/pgbouncer":"uid=70,gid=70"} yes {"max-file":"2","max-size":"1m"} always 134217728 {"8080/tcp":[{"HostIp":"127.0.0.1","HostPort":"39997"}]}' ] &&
  ok "apply: read-only, init, pids, cpu quota, dns, tmpfs, label, log opts, restart, memory, ports preserved" || bad "apply: config not preserved"
[ "$(envval "$n" DATABASE_URL | target)" = flowmate-db:5432/flowmate ] && [ "$(envval "$n" DIRECT_URL | target)" = flowmate-db:5432/flowmate ] &&
  [ "$(envval "$n" FOO_KEY)" = file-value ] && [ "$(envval "$n" QUOTED)" = '"kept-literal"' ] &&
  [ "$(envval "$n" NODE_OPTIONS)" = '--max-old-space-size=96 --expose-gc' ] && [ "$(envval "$n" PORT)" = 8080 ] &&
  ok "apply: env = .env.production (file wins for FOO_KEY, docker literal QUOTED) + running-only NODE_OPTIONS/PORT, DB -> flowmate-db" || bad "apply: env"
backup=$(find "$sdir" -maxdepth 1 -name '.env.production.pre-cutover-*' | head -n 1)
[ -n "$backup" ] && [ "$(sha "$backup")" = "$orig_sha" ] && [ "$(stat -c %a "$backup")" = 600 ] && [ "$(stat -c %a "$sdir/.env.production")" = 600 ] &&
  [ "$(sed -n 's/^DATABASE_URL=//p' "$sdir/.env.production" | target)" = flowmate-db:5432/flowmate ] &&
  diff -q <(grep -vE '^(DATABASE_URL|DIRECT_URL)=' "$sdir/.env.production") <(grep -vE '^(DATABASE_URL|DIRECT_URL)=' "$backup") >/dev/null &&
  ok "apply: .env.production edited (DB keys only, 600), backup 600 = original sha" || bad "apply: env file edit"
prev=$(docker ps -a --filter "name=^$n-pre-oci-" --format '{{.Names}}')
[ -n "$prev" ] && [ "$(insp "$prev" '{{.Id}} {{.State.Status}} {{.HostConfig.RestartPolicy.Name}}')" = "$orig_id exited no" ] &&
  [ "$(sed -n 's/^phase=//p' "$sdir/state/switch.state" | tail -n 1)" = complete ] && [ "$(stat -c %a "$sdir/state/switch.state")" = 600 ] &&
  ! grep -q oldpw "$work/b.out" && ok "apply: original kept stopped (restart=no), state complete (600), no secrets printed" || bad "apply: original/state"

sw --rollback >"$work/c.out" 2>&1 || { cat "$work/c.out"; bad "rollback exited non-zero"; }
[ "$(insp "$n" '{{.Id}} {{.State.Status}} {{.HostConfig.NetworkMode}} {{.HostConfig.RestartPolicy.Name}}')" = "$orig_id running bridge always" ] &&
  [ "$(envval "$n" DATABASE_URL | target)" = old.example:5432/legacy ] && [ "$(sha "$sdir/.env.production")" = "$orig_sha" ] &&
  [ ! -f "$sdir/state/switch.state" ] && ls "$sdir"/state/switch.state.rolledback-* >/dev/null 2>&1 &&
  ok "rollback: original container (same id, bridge, restart always) and .env.production (sha) restored" || bad "rollback"
docker rm -f -v $(docker ps -a -q --filter "name=^$n") >/dev/null 2>&1

# ---------------------------------------------------------------- D: unsupported config aborts first
scenario d
n="$pfx-d"
fixture "$n" --init --health-cmd true --health-interval 30s "$image" sleep 86400
orig_id=$(insp "$n" '{{.Id}}')
for _ in $(seq 1 40); do [ "$(insp "$n" '{{.State.Health.Status}}')" = healthy ] && break; sleep 1; done
sw --apply --containers "$n" >"$work/d.out" 2>&1 && bad "unsupported config: apply should fail"
[ "$(insp "$n" '{{.Id}} {{.State.Status}} {{.HostConfig.RestartPolicy.Name}}')" = "$orig_id running always" ] &&
  [ "$(sha "$sdir/.env.production")" = "$orig_sha" ] && [ ! -f "$sdir/state/switch.state" ] &&
  [ -z "$(docker ps -a -q --filter "name=^$n-oci-candidate")" ] && grep -q 'Config.Healthcheck' "$work/d.out" &&
  ok "custom healthcheck: aborted before stopping (diff names Config.Healthcheck), nothing changed" || { cat "$work/d.out"; bad "unsupported config"; }
docker rm -f -v "$n" >/dev/null

# ---------------------------------------------------------------- E: SIGKILL after "stopped" -> --apply resumes
scenario e
n="$pfx-e"
fixture "$n" --init "$image" sleep 86400
orig_id=$(insp "$n" '{{.Id}}')
extra_env=(FLOWMATE_WORKERS_CRASH_AFTER="$n:stopped")
sw --apply --containers "$n" >"$work/e1.out" 2>&1
extra_env=()
[ "$(sed -n "s/^c.$n.phase=//p" "$sdir/state/switch.state" | tail -n 1)" = stopped ] && [ "$(insp "$orig_id" '{{.State.Status}}')" = exited ] &&
  ok "SIGKILL after 'stopped': state on disk says stopped (no trap needed)" || bad "crash state"
sw --apply --containers "$n" >"$work/e2.out" 2>&1 || { cat "$work/e2.out"; bad "resume exited non-zero"; }
[ "$(insp "$n" '{{.HostConfig.NetworkMode}} {{.State.Status}}')" = "flowmate running" ] && grep -q 'resuming' "$work/e2.out" &&
  [ "$(sed -n 's/^phase=//p' "$sdir/state/switch.state" | tail -n 1)" = complete ] && ok "--apply resumed the interrupted switch" || bad "resume apply"
sw --rollback >/dev/null 2>&1 && [ "$(insp "$n" '{{.Id}}')" = "$orig_id" ] && ok "--rollback after the resumed switch" || bad "rollback after resume"
docker rm -f -v $(docker ps -a -q --filter "name=^$n") >/dev/null 2>&1

# ---------------------------------------------------------------- F: HUP after "renamed" -> --rollback recovers
scenario f
n="$pfx-f"
fixture "$n" --init "$image" sleep 86400
orig_id=$(insp "$n" '{{.Id}}')
extra_env=(FLOWMATE_WORKERS_SIGNAL_AFTER="$n:renamed")
sw --apply --containers "$n" >"$work/f1.out" 2>&1
extra_env=()
grep -q '^interrupted=HUP' "$sdir/state/switch.state" && [ "$(sed -n "s/^c.$n.phase=//p" "$sdir/state/switch.state" | tail -n 1)" = renamed ] &&
  grep -q INTERRUPTED "$work/f1.out" && ok "HUP after 'renamed': trap recorded interrupted=HUP" || { cat "$work/f1.out"; bad "HUP trap"; }
sw --rollback >"$work/f2.out" 2>&1 || { cat "$work/f2.out"; bad "rollback after HUP exited non-zero"; }
[ "$(insp "$n" '{{.Id}} {{.State.Status}} {{.HostConfig.RestartPolicy.Name}} {{.HostConfig.NetworkMode}}')" = "$orig_id running always bridge" ] &&
  [ "$(sha "$sdir/.env.production")" = "$orig_sha" ] && [ -z "$(docker ps -a -q --filter "name=^$n-oci-")" ] &&
  ok "--rollback from 'renamed': original back under its name, never-started candidate removed, env restored" || bad "rollback after HUP"
docker rm -f -v $(docker ps -a -q --filter "name=^$n") >/dev/null 2>&1

# ---------------------------------------------------------------- G: crash-looping new container
scenario g
n="$pfx-g"
fixture "$n" --init "$image" sh -c 'case "$DATABASE_URL" in *flowmate-db*) exit 3 ;; esac; exec sleep 86400'
orig_id=$(insp "$n" '{{.Id}}')
t0=$(date +%s)
sw --apply --containers "$n" >"$work/g.out" 2>&1 && bad "crash loop: apply should fail"
took=$(($(date +%s) - t0))
[ "$took" -lt 50 ] && grep -qE 'is (restarting|exited)|did not stay up' "$work/g.out" && ok "crash-looping new container detected in ${took}s (< 60s timeout)" || { cat "$work/g.out"; bad "crash loop detection (${took}s)"; }
[ "$(insp "$n" '{{.Id}} {{.State.Status}} {{.HostConfig.RestartPolicy.Name}}')" = "$orig_id running always" ] &&
  [ "$(sha "$sdir/.env.production")" = "$orig_sha" ] && [ ! -f "$sdir/state/switch.state" ] && ls "$sdir"/state/switch.state.failed-* >/dev/null 2>&1 &&
  ok "crash loop: everything rolled back, state renamed .failed-*" || bad "crash loop rollback"
docker rm -f -v $(docker ps -a -q --filter "name=^$n") >/dev/null 2>&1

# ---------------------------------------------------------------- H: failing DB preflight touches nothing
scenario h
n="$pfx-h"
fixture "$n" --init "$image" sleep 86400
orig_id=$(insp "$n" '{{.Id}}')
env FLOWMATE_ENV_FILE="$work/.env" FLOWMATE_WORKERS_STATE_DIR="$sdir/state" FLOWMATE_WORKERS_ENV_FILE="$sdir/.env.production" \
  bash "$DB_DIR/switch-workers.sh" --apply --containers "$n" >"$work/h.out" 2>&1 && bad "preflight: apply should fail"
grep -q 'DB preflight failed' "$work/h.out" && [ "$(insp "$n" '{{.Id}} {{.State.Status}}')" = "$orig_id running" ] &&
  [ ! -f "$sdir/state/switch.state" ] && [ "$(sha "$sdir/.env.production")" = "$orig_sha" ] &&
  ok "DB preflight with a wrong password: aborted before anything was touched" || { cat "$work/h.out"; bad "preflight"; }
docker rm -f -v "$n" >/dev/null

echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
