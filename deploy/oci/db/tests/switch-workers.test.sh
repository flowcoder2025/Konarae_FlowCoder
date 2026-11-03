#!/usr/bin/env bash
# switch-workers.sh against THROWAWAY containers and throwaway env files (never the real workers or
# ~/flowmate/.env.production). Needs docker, jq, network `flowmate` and the pgbouncer image (no
# VOLUME/HEALTHCHECK, like the workers). Run on OCI:
#
#   bash deploy/oci/db/tests/switch-workers.test.sh      (needs ../../deploy.sh next to it: copy deploy/oci/)
# shellcheck disable=SC2015,SC2016,SC2046  # `check && ok || bad` (ok always succeeds); literal $DATABASE_URL in a fixture; ids word-split on purpose
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 PYTHONUTF8=1 PYTHONIOENCODING=utf-8
set -uo pipefail
DB_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
image=$(docker inspect -f '{{.Config.Image}}' flowmate-pgbouncer)
pfx="flowmate-swtest-$$"
work=$(mktemp -d)
cleanup() {
  for c in $(docker ps -a --filter "name=^${pfx}" --format '{{.Names}}'); do docker rm -f -v "$c" >/dev/null 2>&1 || true; done
  docker volume ls -q --filter "label=flowmate.swtest=$$" | xargs -r docker volume rm >/dev/null 2>&1 || true
  docker image rm "$pfx-t:latest" >/dev/null 2>&1 || true   # our own tag only; the image itself stays
  rm -rf -- "$work"
}
trap cleanup EXIT
printf 'FLOWMATE_APP_PASSWORD=%s\n' "$(openssl rand -hex 32)" >"$work/.env"
chmod 600 "$work/.env"
pass=0
fail=0
ok() { echo "ok   $1"; pass=$((pass + 1)); }
bad() { echo "FAIL $1"; fail=$((fail + 1)); }
sha() { sha256sum <"$1" | cut -d' ' -f1; }
insp() { docker container inspect -f "$2" "$1" 2>/dev/null; }
envval() { docker container inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$1" | sed -n "s/^$2=//p"; }
envcount() { docker container inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$1" | grep -c "^$2=" || true; }
target() { sed -E 's|^[a-z]+://[^@]*@([^/]+)/(.*)$|\1/\2|'; }   # host:port/db, never the password
statephase() { sed -n "s/^$1=//p" "$sdir/state/switch.state" 2>/dev/null | tail -n 1; }

sdir=""
envfile() { # PATH [variant]
  case "${2:-default}" in
    default) printf '# fixture\nDATABASE_URL=postgresql://u:oldpw@old.example:5432/legacy\nDIRECT_URL=postgresql://u:oldpw@old.example:5433/legacy\n\nFOO_KEY=file-value\nQUOTED="kept-literal"\n' >"$1" ;;
    dup) printf 'DATABASE_URL=postgresql://u:oldpw@old.example:5432/legacy\nFOO_KEY=x\n   DATABASE_URL=postgresql://u:oldpw@other.example:5432/legacy\n' >"$1" ;;
    nodirect) printf '# no DIRECT_URL, indented DATABASE_URL\n  DATABASE_URL=postgresql://u:oldpw@old.example:5432/legacy\nFOO_KEY=file-value\n' >"$1" ;;
  esac
  chmod 664 "$1"
}
scenario() { # NAME [env variant]
  sdir="$work/$1"
  mkdir -p "$sdir"
  envfile "$sdir/.env.production" "${2:-default}"
  orig_sha=$(sha "$sdir/.env.production")
}
fixture() { # NAME [extra docker run args...] -- a running "worker" built like deploy.sh does
  local n=$1
  shift
  docker run -d --name "$n" --restart always -p 127.0.0.1:39997:8080 --memory 128m --memory-swap 128m \
    --env-file "$sdir/.env.production" -e NODE_OPTIONS='--max-old-space-size=96 --expose-gc' -e PORT=8080 \
    -e FOO_KEY=running-value "$@" >/dev/null || { echo "fixture $n failed"; return 1; }
  for _ in $(seq 1 20); do [ "$(insp "$n" '{{.State.Status}}')" = running ] && return 0; sleep 1; done
  echo "fixture $n did not start"; return 1
}
extra_env=()
DEPLOY_SH=$(cd -- "$DB_DIR/.." && pwd)/deploy.sh
deploy_sh=$DEPLOY_SH
sw() { env FLOWMATE_ENV_FILE="$work/.env" FLOWMATE_WORKERS_STATE_DIR="$sdir/state" FLOWMATE_WORKERS_ENV_FILE="$sdir/.env.production" FLOWMATE_DEPLOY_SH="$deploy_sh" \
  FLOWMATE_WORKERS_READY_TIMEOUT=60 FLOWMATE_WORKERS_SETTLE_SECONDS=5 FLOWMATE_TEST_MODE=1 FLOWMATE_WORKERS_SKIP_DB_PREFLIGHT=1 \
  "${extra_env[@]}" bash "$DB_DIR/switch-workers.sh" "$@"; }
snapshot() { # everything a "no mutation" claim covers: containers of this scenario, env file, state file
  local c
  for c in $(docker ps -a -q --filter "name=^$1"); do insp "$c" '{{.Id}} {{.Name}} {{.State.Status}} {{.State.StartedAt}} {{.HostConfig.RestartPolicy.Name}}'; done | sort
  sha "$sdir/.env.production"
  [ -f "$sdir/state/switch.state" ] && sha "$sdir/state/switch.state" || echo no-state
}
rm_all() { docker rm -f -v $(docker ps -a -q --filter "name=^$1") >/dev/null 2>&1; }

# ================================================================ A: dry run, apply, rollback
scenario a
n="$pfx-a"
fixture "$n" --init --read-only --tmpfs /etc/pgbouncer:uid=70,gid=70 --pids-limit 64 --cpu-quota 50000 --dns 1.1.1.1 \
  --label test.label=yes --log-opt max-size=1m --log-opt max-file=2 "$image" sleep 86400
orig_id=$(insp "$n" '{{.Id}}')
before=$(snapshot "$n")
sw --containers "$n" >"$work/a.out" 2>&1
[ "$(snapshot "$n")" = "$before" ] && [ -z "$(docker ps -a -q --filter "name=^$n-oci-candidate")" ] && ! grep -q oldpw "$work/a.out" &&
  [ -z "$(find "$sdir/state" -mindepth 1 -not -name .lock 2>/dev/null)" ] &&
  ok "dry run: no mutation, candidate removed, no env copies left in the state dir, no secrets printed" || { cat "$work/a.out"; bad "dry run"; }
sw --apply --containers "$n" >"$work/b.out" 2>&1 || { cat "$work/b.out"; bad "apply exited non-zero"; }
new_id=$(insp "$n" '{{.Id}}')
[ "$new_id" != "$orig_id" ] && [ "$(insp "$n" '{{.HostConfig.NetworkMode}}')" = flowmate ] && insp "$n" '{{.HostConfig.CapDrop}}' | grep -q NET_RAW &&
  ok "apply: recreated on network flowmate with NET_RAW dropped" || bad "apply: network/caps"
[ "$(insp "$n" '{{.HostConfig.ReadonlyRootfs}} {{.HostConfig.Init}} {{.HostConfig.PidsLimit}} {{.HostConfig.CpuQuota}} {{.HostConfig.Dns}} {{json .HostConfig.Tmpfs}} {{index .Config.Labels "test.label"}} {{json .HostConfig.LogConfig.Config}} {{.HostConfig.RestartPolicy.Name}} {{.HostConfig.Memory}} {{json .HostConfig.PortBindings}}')" = \
  'true true 64 50000 [1.1.1.1] {"/etc/pgbouncer":"uid=70,gid=70"} yes {"max-file":"2","max-size":"1m"} always 134217728 {"8080/tcp":[{"HostIp":"127.0.0.1","HostPort":"39997"}]}' ] &&
  ok "apply: read-only, init, pids, cpu quota, dns, tmpfs, label, log opts, restart, memory, ports preserved" || bad "apply: config"
[ "$(envcount "$n" DATABASE_URL) $(envcount "$n" DIRECT_URL)" = "1 1" ] && [ "$(envval "$n" DATABASE_URL | target)" = flowmate-db:5432/flowmate ] &&
  [ "$(envval "$n" DIRECT_URL | target)" = flowmate-db:5432/flowmate ] && [ "$(envval "$n" FOO_KEY)" = file-value ] &&
  [ "$(envval "$n" QUOTED)" = '"kept-literal"' ] && [ "$(envval "$n" NODE_OPTIONS)" = '--max-old-space-size=96 --expose-gc' ] && [ "$(envval "$n" PORT)" = 8080 ] &&
  ok "apply: env = .env.production (file wins, docker literal quotes) + running-only NODE_OPTIONS/PORT; exactly one DB URL each, on flowmate-db" || bad "apply: env"
backup=$(find "$sdir" -maxdepth 1 -name '.env.production.pre-cutover-*' | head -n 1)
[ -n "$backup" ] && [ "$(sha "$backup")" = "$orig_sha" ] && [ "$(stat -c %a "$backup")" = 600 ] && [ "$(stat -c %a "$sdir/.env.production")" = 600 ] &&
  ok "apply: .env.production edited (600), backup 600 = original sha" || bad "apply: env file"
[ "$(statephase phase)" = complete ] && [ "$(stat -c %a "$sdir/state/switch.state")" = 600 ] &&
  [ -z "$(find "$sdir/state" -mindepth 1 -not -name .lock -not -name switch.state)" ] &&
  ok "apply: state complete (600); no merged env files or work dirs left behind" || { ls -la "$sdir/state"; bad "apply: state dir"; }
sw --rollback >"$work/c.out" 2>&1 || { cat "$work/c.out"; bad "rollback exited non-zero"; }
[ "$(insp "$n" '{{.Id}} {{.State.Status}} {{.HostConfig.NetworkMode}} {{.HostConfig.RestartPolicy.Name}}')" = "$orig_id running bridge always" ] &&
  [ "$(sha "$sdir/.env.production")" = "$orig_sha" ] && ls "$sdir"/state/switch.state.rolledback-* >/dev/null 2>&1 &&
  ok "rollback: original container and .env.production (sha) restored" || bad "rollback"
rm_all "$n"

# ================================================================ I: --done retires the state, ends --rollback
scenario i
n="$pfx-i"
fixture "$n" --init "$image" sleep 86400
sw --apply --containers "$n" >/dev/null 2>&1 || bad "I: apply"
sw --done >"$work/i.out" 2>&1 && ls "$sdir"/state/switch.state.done-* >/dev/null 2>&1 && [ ! -f "$sdir/state/switch.state" ] &&
  ok "--done: complete check passed, state retired to .done-<ts>" || { cat "$work/i.out"; bad "--done"; }
before=$(snapshot "$n")
sw --rollback >"$work/i2.out" 2>&1 && bad "rollback after --done should fail"
[ "$(snapshot "$n")" = "$before" ] && ok "--rollback after --done: refused, no mutation" || bad "rollback after done mutated"
rm_all "$n"

# ================================================================ J: rollback with the original removed
scenario j
n="$pfx-j"
fixture "$n" --init "$image" sleep 86400
sw --apply --containers "$n" >/dev/null 2>&1 || bad "J: apply"
docker rm -f -v $(docker ps -a -q --filter "name=^$n-pre-oci-") >/dev/null
before=$(snapshot "$n")
sw --rollback >"$work/j.out" 2>&1 && bad "rollback with original removed should fail"
[ "$(snapshot "$n")" = "$before" ] && grep -q 'no longer exists' "$work/j.out" && grep -q 'FLOWMATE_ALLOW_NON_OCI_DB=1' "$work/j.out" &&
  ok "rollback with the original removed: refused, no mutation, manual path printed" || { cat "$work/j.out"; bad "J"; }
rm_all "$n"

# ================================================================ K: rollback after a simulated deploy.sh restart
scenario k
n="$pfx-k"
fixture "$n" --init "$image" sleep 86400
sw --apply --containers "$n" >/dev/null 2>&1 || bad "K: apply"
docker rm -f -v "$n" >/dev/null && docker run -d --name "$n" --init --network flowmate "$image" sleep 86400 >/dev/null
before=$(snapshot "$n")
sw --rollback >"$work/k.out" 2>&1 && bad "rollback after a redeploy should fail"
[ "$(snapshot "$n")" = "$before" ] && grep -q 'neither the original nor the candidate' "$work/k.out" &&
  ok "rollback after a redeploy replaced the container: refused, no mutation" || { cat "$work/k.out"; bad "K"; }
rm_all "$n"

# ================================================================ L: --apply refuses rollback phases
scenario l
n="$pfx-l"
fixture "$n" --init "$image" sleep 86400
sw --apply --containers "$n" >/dev/null 2>&1 || bad "L: apply"
for ph in rolling_back rolled_back; do
  sed -i "s/^phase=.*/phase=$ph/" "$sdir/state/switch.state"
  before=$(snapshot "$n")
  sw --apply >"$work/l.out" 2>&1 && bad "--apply from $ph should fail"
  [ "$(snapshot "$n")" = "$before" ] && grep -q -- '--rollback' "$work/l.out" && ok "--apply with phase=$ph: refused (points to --rollback), no mutation" || { cat "$work/l.out"; bad "L $ph"; }
done
sed -i "s/^c\.$n\.phase=.*/c.$n.phase=bogus/" "$sdir/state/switch.state"
sed -i "s/^phase=.*/phase=switching/" "$sdir/state/switch.state"
sw --apply >"$work/l2.out" 2>&1 && bad "unknown container phase should fail"
grep -q "unknown phase 'bogus'" "$work/l2.out" && ok "unknown per-container phase: refused" || { cat "$work/l2.out"; bad "L unknown phase"; }
rm_all "$n"

# ================================================================ M: the complete check catches a stopped container
scenario m
n="$pfx-m"
fixture "$n" --init "$image" sleep 86400
orig_id=$(insp "$n" '{{.Id}}')
extra_env=(FLOWMATE_WORKERS_TEST_STOP_BEFORE_COMPLETE="$n")
sw --apply --containers "$n" >"$work/m.out" 2>&1 && bad "complete check: apply should fail"
extra_env=()
grep -q 'expected the new container running' "$work/m.out" && [ "$(insp "$n" '{{.Id}} {{.State.Status}}')" = "$orig_id running" ] &&
  [ "$(sha "$sdir/.env.production")" = "$orig_sha" ] && ls "$sdir"/state/switch.state.failed-* >/dev/null 2>&1 &&
  ok "complete check failure: caught, everything rolled back, .failed state" || { cat "$work/m.out"; bad "M"; }
rm_all "$n"

# ================================================================ D: unsupported config aborts first
scenario d
n="$pfx-d"
fixture "$n" --init --health-cmd true --health-interval 30s "$image" sleep 86400
for _ in $(seq 1 40); do [ "$(insp "$n" '{{.State.Health.Status}}')" = healthy ] && break; sleep 1; done
before=$(snapshot "$n")
sw --apply --containers "$n" >"$work/d.out" 2>&1 && bad "unsupported config: apply should fail"
[ "$(snapshot "$n")" = "$before" ] && grep -q 'Config.Healthcheck' "$work/d.out" &&
  ok "custom healthcheck: aborted before stopping (diff names Config.Healthcheck), no mutation" || { cat "$work/d.out"; bad "D"; }
rm_all "$n"

# ================================================================ P: mounts are refused (anonymous volume)
scenario p
n="$pfx-p"
fixture "$n" --init -v /data --label flowmate.swtest=$$ "$image" sleep 86400
before=$(snapshot "$n")
sw --apply --containers "$n" >"$work/p.out" 2>&1 && bad "mount: apply should fail"
[ "$(snapshot "$n")" = "$before" ] && grep -q 'has mounts (volume)' "$work/p.out" && ok "container with an (anonymous) volume: refused, no mutation" || { cat "$work/p.out"; bad "P"; }
rm_all "$n"

# ================================================================ N: duplicate DATABASE_URL (one indented)
scenario n dup
n="$pfx-n"
fixture "$n" --init "$image" sleep 86400
before=$(snapshot "$n")
sw --apply --containers "$n" >"$work/n.out" 2>&1 && bad "duplicate DATABASE_URL: apply should fail"
[ "$(snapshot "$n")" = "$before" ] && grep -q 'defines DATABASE_URL more than once' "$work/n.out" && ! grep -q oldpw "$work/n.out" &&
  ok "indented duplicate DATABASE_URL: refused before anything, no values printed" || { cat "$work/n.out"; bad "N"; }
rm_all "$n"

# ================================================================ O: missing DIRECT_URL is added
scenario o nodirect
n="$pfx-o"
fixture "$n" --init "$image" sleep 86400
sw --apply --containers "$n" >"$work/o.out" 2>&1 || { cat "$work/o.out"; bad "O: apply"; }
[ "$(envcount "$n" DATABASE_URL) $(envcount "$n" DIRECT_URL)" = "1 1" ] && [ "$(envval "$n" DIRECT_URL | target)" = flowmate-db:5432/flowmate ] &&
  [ "$(grep -c '^DIRECT_URL=' "$sdir/.env.production")" = 1 ] && ! grep -q '^  DATABASE_URL' "$sdir/.env.production" &&
  ok "indented DATABASE_URL rewritten, missing DIRECT_URL added (file and container: exactly one each)" || bad "O"
sw --rollback >/dev/null 2>&1 && [ "$(sha "$sdir/.env.production")" = "$orig_sha" ] && ok "O: rollback restores the original file" || bad "O rollback"
rm_all "$n"

# ================================================================ E: SIGKILL after "stopped" -> --apply resumes
scenario e
n="$pfx-e"
fixture "$n" --init "$image" sleep 86400
orig_id=$(insp "$n" '{{.Id}}')
extra_env=(FLOWMATE_WORKERS_CRASH_AFTER="$n:stopped")
sw --apply --containers "$n" >"$work/e1.out" 2>&1
extra_env=()
[ "$(statephase "c.$n.phase")" = stopped ] && [ "$(insp "$orig_id" '{{.State.Status}}')" = exited ] && [ -n "$(find "$sdir/state" -maxdepth 1 -name 'work.*')" ] &&
  ok "SIGKILL after 'stopped': state says stopped (no trap ran; work dir left behind)" || bad "E crash state"
sw --apply --containers "$n" >"$work/e2.out" 2>&1 || { cat "$work/e2.out"; bad "E resume"; }
[ "$(insp "$n" '{{.HostConfig.NetworkMode}} {{.State.Status}}')" = "flowmate running" ] && grep -q 'resuming' "$work/e2.out" &&
  [ "$(statephase phase)" = complete ] && [ -z "$(find "$sdir/state" -maxdepth 1 -name 'work.*')" ] &&
  ok "--apply resumed the interrupted switch and purged the stale work dir" || bad "E resume"
sw --rollback >/dev/null 2>&1 && [ "$(insp "$n" '{{.Id}}')" = "$orig_id" ] && ok "--rollback after the resumed switch" || bad "E rollback"
rm_all "$n"

# ================================================================ F: HUP after "renamed" -> --rollback recovers
scenario f
n="$pfx-f"
fixture "$n" --init "$image" sleep 86400
orig_id=$(insp "$n" '{{.Id}}')
extra_env=(FLOWMATE_WORKERS_SIGNAL_AFTER="$n:renamed")
sw --apply --containers "$n" >"$work/f1.out" 2>&1
extra_env=()
grep -q '^interrupted=HUP' "$sdir/state/switch.state" && [ "$(statephase "c.$n.phase")" = renamed ] && ok "HUP after 'renamed': recorded interrupted=HUP" || bad "F trap"
sw --rollback >"$work/f2.out" 2>&1 || { cat "$work/f2.out"; bad "F rollback"; }
[ "$(insp "$n" '{{.Id}} {{.State.Status}} {{.HostConfig.RestartPolicy.Name}} {{.HostConfig.NetworkMode}}')" = "$orig_id running always bridge" ] &&
  [ "$(sha "$sdir/.env.production")" = "$orig_sha" ] && [ -z "$(docker ps -a -q --filter "name=^$n-oci-")" ] &&
  ok "--rollback from 'renamed' (name resolves to nothing, allowed): original back, candidate removed, env restored" || bad "F"
rm_all "$n"

# ================================================================ G: crash-looping new container
scenario g
n="$pfx-g"
fixture "$n" --init "$image" sh -c 'case "$DATABASE_URL" in *flowmate-db*) exit 3 ;; esac; exec sleep 86400'
orig_id=$(insp "$n" '{{.Id}}')
t0=$(date +%s)
sw --apply --containers "$n" >"$work/g.out" 2>&1 && bad "crash loop: apply should fail"
took=$(($(date +%s) - t0))
[ "$took" -lt 50 ] && grep -qE 'is (restarting|exited)|did not stay up' "$work/g.out" && [ "$(insp "$n" '{{.Id}} {{.State.Status}}')" = "$orig_id running" ] &&
  [ "$(sha "$sdir/.env.production")" = "$orig_sha" ] && ls "$sdir"/state/switch.state.failed-* >/dev/null 2>&1 &&
  ok "crash-looping new container: detected in ${took}s, everything rolled back, .failed state" || { cat "$work/g.out"; bad "G (${took}s)"; }
rm_all "$n"

# ================================================================ H: failing DB preflight touches nothing
scenario h
n="$pfx-h"
fixture "$n" --init "$image" sleep 86400
before=$(snapshot "$n")
env FLOWMATE_ENV_FILE="$work/.env" FLOWMATE_WORKERS_STATE_DIR="$sdir/state" FLOWMATE_WORKERS_ENV_FILE="$sdir/.env.production" FLOWMATE_DEPLOY_SH="$DEPLOY_SH" \
  bash "$DB_DIR/switch-workers.sh" --apply --containers "$n" >"$work/h.out" 2>&1 && bad "preflight: apply should fail"
[ "$(snapshot "$n")" = "$before" ] && grep -q 'DB preflight failed' "$work/h.out" && ok "DB preflight with a wrong password: nothing touched" || { cat "$work/h.out"; bad "H"; }
rm_all "$n"

# ================================================================ Q: unguarded deploy.sh -> refused
scenario q
n="$pfx-q"
fixture "$n" --init "$image" sleep 86400
printf '#!/bin/bash\n# main-branch deploy.sh without the guard\nsudo docker run -d flowmate-crawler\n' >"$work/old-deploy.sh"
before=$(snapshot "$n")
deploy_sh="$work/old-deploy.sh"
sw --containers "$n" >"$work/q1.out" 2>&1 && bad "dry run with an unguarded deploy.sh should fail"
sw --apply --containers "$n" >"$work/q2.out" 2>&1 && bad "apply with an unguarded deploy.sh should fail"
deploy_sh="$DEPLOY_SH"
[ "$(snapshot "$n")" = "$before" ] && grep -q 'is not the guarded deploy.sh' "$work/q1.out" && grep -q 'is not the guarded deploy.sh' "$work/q2.out" &&
  ok "deploy.sh without the guard marker: dry run and --apply refused, no mutation" || { cat "$work/q2.out"; bad "Q"; }
rm_all "$n"

# ================================================================ R: rollback killed between its two renames -> --rollback resumes
scenario r
n="$pfx-r"
fixture "$n" --init "$image" sleep 86400
orig_id=$(insp "$n" '{{.Id}}')
sw --apply --containers "$n" >/dev/null 2>&1 || bad "R: apply"
extra_env=(FLOWMATE_WORKERS_CRASH_AFTER="$n:rb:cand_parked")
sw --rollback >"$work/r1.out" 2>&1
extra_env=()
[ -z "$(docker ps -a -q --filter "name=^$n\$")" ] && [ "$(statephase "c.$n.rb")" = cand_parked ] && [ "$(statephase phase)" = rolling_back ] &&
  ok "rollback SIGKILLed between its renames: no container named $n, state says cand_parked" || bad "R crash state"
sw --rollback >"$work/r2.out" 2>&1 || { cat "$work/r2.out"; bad "R resume"; }
[ "$(insp "$n" '{{.Id}} {{.State.Status}} {{.HostConfig.RestartPolicy.Name}} {{.HostConfig.NetworkMode}}')" = "$orig_id running always bridge" ] &&
  [ "$(sha "$sdir/.env.production")" = "$orig_sha" ] && ls "$sdir"/state/switch.state.rolledback-* >/dev/null 2>&1 &&
  ok "--rollback resumed from between the renames: original back, env restored" || bad "R"
rm_all "$n"

# ================================================================ T: the service name is also an IMAGE tag
scenario t
n="$pfx-t"
docker tag "$image" "$n:latest"
fixture "$n" --init "$image" sleep 86400
orig_id=$(insp "$n" '{{.Id}}')
sw --apply --containers "$n" >"$work/t0.out" 2>&1 || { cat "$work/t0.out"; bad "T: apply"; }
extra_env=(FLOWMATE_WORKERS_CRASH_AFTER="$n:rb:cand_parked")
sw --rollback >/dev/null 2>&1
extra_env=()
docker image inspect "$n:latest" >/dev/null 2>&1 && [ -z "$(docker ps -a -q --filter "name=^$n\$")" ] &&
  ok "T setup: no container named $n, but an image $n:latest exists" || bad "T setup"
sw --rollback >"$work/t1.out" 2>&1 || { cat "$work/t1.out"; bad "T resume"; }
[ "$(insp "$n" '{{.Id}} {{.State.Status}}')" = "$orig_id running" ] &&
  ok "name shadowed by an image tag: rollback resumes (container lookups never resolve the image)" || bad "T"
rm_all "$n"

echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
