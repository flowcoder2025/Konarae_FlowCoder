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
image=$(docker container inspect -f '{{.Config.Image}}' flowmate-pgbouncer)
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
    switched) printf 'DATABASE_URL=postgresql://flowmate_app:newpw@flowmate-db:5432/flowmate\nDIRECT_URL=postgresql://flowmate_app:newpw@flowmate-db:5432/flowmate\nFOO_KEY=file-value\n' >"$1" ;;
    nodb) printf '# no DB keys at all\nFOO_KEY=file-value\n' >"$1" ;;
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

# ================================================================ V: guarded but conflicted / unparseable deploy.sh -> refused
scenario v
n="$pfx-v"
fixture "$n" --init "$image" sleep 86400
{ printf '#!/bin/bash
# flowmate-deploy-guard: v1
<<<<<<< Updated upstream
echo main
=======
echo guarded
>>>>>>> Stashed changes
'; } >"$work/conflict-deploy.sh"
{ sed -n '1,3p' "$DEPLOY_SH"; printf 'if then
'; } >"$work/broken-deploy.sh"
grep -qF 'flowmate-deploy-guard: v1' "$work/broken-deploy.sh" || bad "V fixture: broken copy lost the marker"
before=$(snapshot "$n")
deploy_sh="$work/conflict-deploy.sh"
sw --containers "$n" >"$work/v1.out" 2>&1 && bad "dry run with a conflicted deploy.sh should fail"
sw --apply --containers "$n" >"$work/v2.out" 2>&1 && bad "apply with a conflicted deploy.sh should fail"
deploy_sh="$work/broken-deploy.sh"
sw --apply --containers "$n" >"$work/v3.out" 2>&1 && bad "apply with an unparseable deploy.sh should fail"
deploy_sh="$DEPLOY_SH"
[ "$(snapshot "$n")" = "$before" ] && grep -q 'contains git conflict markers' "$work/v1.out" && grep -q 'contains git conflict markers' "$work/v2.out" &&
  grep -q 'does not parse (bash -n failed)' "$work/v3.out" && [ ! -e "$sdir/state/switch.state" ] &&
  ok "guarded deploy.sh with conflict markers / bash -n failure: dry run and --apply refused, no state, no mutation" || { cat "$work/v2.out" "$work/v3.out"; bad "V"; }
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

# ================================================================ U: rollback killed right after removing a never-started candidate
scenario u
n="$pfx-u"
fixture "$n" --init "$image" sleep 86400
orig_id=$(insp "$n" '{{.Id}}')
extra_env=(FLOWMATE_WORKERS_CRASH_AFTER="$n:new_named")      # candidate holds the name, never started
sw --apply --containers "$n" >/dev/null 2>&1
cand_id=$(statephase "c.$n.cand_id")
extra_env=(FLOWMATE_WORKERS_CRASH_AFTER="$n:rb:cand_removed") # die between the rm and the next sub-step
sw --rollback >/dev/null 2>&1
extra_env=()
[ -z "$(docker ps -a -q --filter "name=^$n\$")" ] && ! docker container inspect "$cand_id" >/dev/null 2>&1 && [ "$(statephase "c.$n.rb")" = cand_removing ] &&
  ok "rollback SIGKILLed right after removing the never-started candidate: name resolves to nothing, rb=cand_removing" || bad "U crash state"
sw --rollback >"$work/u.out" 2>&1 || { cat "$work/u.out"; bad "U resume"; }
[ "$(insp "$n" '{{.Id}} {{.State.Status}} {{.HostConfig.RestartPolicy.Name}}')" = "$orig_id running always" ] && [ "$(sha "$sdir/.env.production")" = "$orig_sha" ] &&
  ok "--rollback resumed from rb=cand_removing: original back under its name" || bad "U"
rm_all "$n"

# ================================================================ W: manual-rollback state (network flowmate, non-OCI env) -> switched
scenario w
n="$pfx-w"
fixture "$n" --init --network flowmate --cap-drop NET_RAW "$image" sleep 86400
orig_id=$(insp "$n" '{{.Id}}')
before=$(snapshot "$n")
sw --containers "$n" >"$work/w1.out" 2>&1 || { cat "$work/w1.out"; bad "W: dry run exited non-zero"; }
[ "$(snapshot "$n")" = "$before" ] && grep -q "is on network flowmate with a DATABASE_URL host other than flowmate-db (e.g. the manual-rollback state); accepted" "$work/w1.out" && ! grep -q oldpw "$work/w1.out" &&
  ok "W dry run: worker on network flowmate with a non-OCI DATABASE_URL accepted (logged), no mutation" || { cat "$work/w1.out"; bad "W dry run"; }
sw --apply --containers "$n" >"$work/w2.out" 2>&1 || { cat "$work/w2.out"; bad "W: apply exited non-zero"; }
[ "$(insp "$n" '{{.Id}}')" != "$orig_id" ] && [ "$(insp "$n" '{{.HostConfig.NetworkMode}} {{.State.Status}}')" = "flowmate running" ] &&
  [ "$(envval "$n" DATABASE_URL | target)" = flowmate-db:5432/flowmate ] && [ "$(statephase phase)" = complete ] &&
  ok "W apply: recreated (new id) on flowmate, DATABASE_URL on flowmate-db, state complete" || { cat "$work/w2.out"; bad "W apply"; }
sw --rollback >"$work/w3.out" 2>&1 || { cat "$work/w3.out"; bad "W: rollback exited non-zero"; }
[ "$(insp "$n" '{{.Id}} {{.State.Status}} {{.HostConfig.NetworkMode}} {{.HostConfig.RestartPolicy.Name}}')" = "$orig_id running flowmate always" ] &&
  [ "$(envval "$n" DATABASE_URL | target)" = old.example:5432/legacy ] && [ "$(sha "$sdir/.env.production")" = "$orig_sha" ] &&
  ok "W rollback: original back (same id, running, network flowmate, original non-OCI env), .env.production sha restored" || { cat "$work/w3.out"; bad "W rollback"; }
sw --apply --containers "$n" >"$work/w4.out" 2>&1 || { cat "$work/w4.out"; bad "W: second apply exited non-zero"; }
sw --done >"$work/w5.out" 2>&1 && [ "$(envval "$n" DATABASE_URL | target)" = flowmate-db:5432/flowmate ] &&
  ls "$sdir"/state/switch.state.done-* >/dev/null 2>&1 && [ ! -f "$sdir/state/switch.state" ] &&
  ok "W second apply after the rollback + --done: switched again and retired" || { cat "$work/w4.out" "$work/w5.out"; bad "W second apply / --done"; }
rm_all "$n"

# ================================================================ X: already switched (network flowmate + flowmate-db URL) -> refused
scenario x switched
n="$pfx-x"
fixture "$n" --init --network flowmate --cap-drop NET_RAW "$image" sleep 86400
before=$(snapshot "$n")
sw --containers "$n" >"$work/x1.out" 2>&1 && bad "X: dry run on an already switched worker should fail"
sw --apply --containers "$n" >"$work/x2.out" 2>&1 && bad "X: apply on an already switched worker should fail"
[ "$(snapshot "$n")" = "$before" ] && [ ! -e "$sdir/state/switch.state" ] && [ -z "$(docker ps -a -q --filter "name=^$n-oci-candidate")" ] &&
  grep -q "is already switched: on network flowmate and its running DATABASE_URL already targets flowmate-db" "$work/x1.out" &&
  grep -q "is already switched" "$work/x2.out" && ! grep -q newpw "$work/x1.out" "$work/x2.out" &&
  ok "X: worker on flowmate with DATABASE_URL on flowmate-db refused (dry run and --apply), no state, no mutation, no secret printed" || { cat "$work/x2.out"; bad "X"; }
rm_all "$n"

# ================================================================ Y: on network flowmate with zero / two DATABASE_URL -> refused
scenario y0 nodb
n="$pfx-y0"
fixture "$n" --init --network flowmate --cap-drop NET_RAW "$image" sleep 86400
before=$(snapshot "$n")
sw --apply --containers "$n" >"$work/y0.out" 2>&1 && bad "Y0: apply with no DATABASE_URL should fail"
[ "$(snapshot "$n")" = "$before" ] && [ ! -e "$sdir/state/switch.state" ] &&
  grep -q "is on network flowmate with 0 DATABASE_URL definitions in its running env (expected exactly 1)" "$work/y0.out" &&
  ok "Y0: worker on flowmate without DATABASE_URL refused, no state, no mutation" || { cat "$work/y0.out"; bad "Y0"; }
rm_all "$n"
scenario y2
n="$pfx-y2"
fixture "$n" --init --network flowmate --cap-drop NET_RAW -e DATABASE_URL=postgresql://u:oldpw@other.example:5432/legacy "$image" sleep 86400
before=$(snapshot "$n")
[ "$(envcount "$n" DATABASE_URL)" = 2 ] || bad "Y2 fixture: expected two DATABASE_URL entries in Config.Env"
sw --apply --containers "$n" >"$work/y2.out" 2>&1 && bad "Y2: apply with two DATABASE_URL should fail"
[ "$(snapshot "$n")" = "$before" ] && [ ! -e "$sdir/state/switch.state" ] && ! grep -q oldpw "$work/y2.out" &&
  grep -q "is on network flowmate with 2 DATABASE_URL definitions in its running env (expected exactly 1)" "$work/y2.out" &&
  ok "Y2: worker on flowmate with two DATABASE_URL refused, no state, no mutation" || { cat "$work/y2.out"; bad "Y2"; }
rm_all "$n"
scenario yu nodb
n="$pfx-yu"
fixture "$n" --init --network flowmate --cap-drop NET_RAW -e DATABASE_URL=mysql://u:oldpw@h:1/x "$image" sleep 86400
before=$(snapshot "$n")
sw --apply --containers "$n" >"$work/yu.out" 2>&1 && bad "YU: apply with an unparseable DATABASE_URL should fail"
[ "$(snapshot "$n")" = "$before" ] && [ ! -e "$sdir/state/switch.state" ] && ! grep -q oldpw "$work/yu.out" &&
  grep -q "its running DATABASE_URL cannot be parsed (value not shown)" "$work/yu.out" &&
  ok "YU: worker on flowmate with an unparseable DATABASE_URL refused, value not shown, no mutation" || { cat "$work/yu.out"; bad "YU"; }
rm_all "$n"

# ================================================================ SF1: state write fails at a container phase mid-apply
scenario sf1
n="$pfx-sf1"
fixture "$n" --init "$image" sleep 86400
orig_id=$(insp "$n" '{{.Id}}')
extra_env=(FLOWMATE_WORKERS_STATE_FAIL_AT="c.$n.phase=stopped")
sw --apply --containers "$n" >"$work/sf1.out" 2>&1; rc=$?
extra_env=()
cand=$(docker ps -a --filter "name=^$n-oci-candidate-" --format '{{.Names}}')
[ "$rc" != 0 ] && grep -q "STATE FILE UNWRITABLE: could not record 'c.$n.phase=stopped'" "$work/sf1.out" &&
  grep -q "state file stopped at: phase=switching env_phase=edited $n=restart_disabled" "$work/sf1.out" && grep -q 'no automatic rollback' "$work/sf1.out" &&
  [ "$(insp "$n" '{{.Id}} {{.State.Status}} {{.HostConfig.RestartPolicy.Name}}')" = "$orig_id exited no" ] &&
  [ -n "$cand" ] && [ "$(insp "$cand" '{{.State.Status}}')" = created ] && [ -z "$(docker ps -a -q --filter "name=^$n-pre-oci-")" ] &&
  [ "$(statephase "c.$n.phase")" = restart_disabled ] && [ -z "$(statephase interrupted)" ] && [ -f "$sdir/state/switch.state" ] &&
  ! ls "$sdir"/state/switch.state.failed-* >/dev/null 2>&1 && [ -z "$(find "$sdir/state" -name 'switch.state.tmp.*')" ] &&
  ok "SF1: state write fails after 'docker stop': exit $rc, stops there (no rename/start, no auto-rollback, state untouched), report names the step" || { cat "$work/sf1.out"; bad "SF1"; }
sw --rollback >"$work/sf1b.out" 2>&1 && [ "$(insp "$n" '{{.Id}} {{.State.Status}} {{.HostConfig.RestartPolicy.Name}}')" = "$orig_id running always" ] &&
  [ "$(sha "$sdir/.env.production")" = "$orig_sha" ] &&
  ok "SF1: once writable, --rollback recovers (original running, env restored)" || { cat "$work/sf1b.out"; bad "SF1 rollback"; }
rm_all "$n"

# ================================================================ SF2: state write fails during the env switch
scenario sf2
n="$pfx-sf2"
fixture "$n" --init "$image" sleep 86400
orig_id=$(insp "$n" '{{.Id}}')
extra_env=(FLOWMATE_WORKERS_STATE_FAIL_AT="env_phase=edited")
sw --apply --containers "$n" >"$work/sf2.out" 2>&1; rc=$?
extra_env=()
cand=$(docker ps -a --filter "name=^$n-oci-candidate-" --format '{{.Names}}')
[ "$rc" != 0 ] && grep -q "STATE FILE UNWRITABLE: could not record 'env_phase=edited env_sha_after=" "$work/sf2.out" &&
  [ "$(statephase env_phase)" = backed_up ] && [ "$(sha "$sdir/.env.production")" != "$orig_sha" ] &&
  [ "$(insp "$n" '{{.Id}} {{.State.Status}} {{.HostConfig.RestartPolicy.Name}}')" = "$orig_id running always" ] &&
  [ "$(insp "$cand" '{{.State.Status}}')" = created ] && [ "$(statephase "c.$n.phase")" = planned ] &&
  ok "SF2: state write fails after the env rewrite: exit $rc, no container touched, state says backed_up" || { cat "$work/sf2.out"; bad "SF2"; }
sw --rollback >"$work/sf2b.out" 2>&1 && [ "$(sha "$sdir/.env.production")" = "$orig_sha" ] &&
  [ "$(insp "$n" '{{.Id}} {{.State.Status}}')" = "$orig_id running" ] &&
  ok "SF2: --rollback restores .env.production from the backup" || { cat "$work/sf2b.out"; bad "SF2 rollback"; }
rm_all "$n"

# ================================================================ SF3: state write fails at a rollback sub-step
scenario sf3
n="$pfx-sf3"
fixture "$n" --init "$image" sleep 86400
orig_id=$(insp "$n" '{{.Id}}')
sw --apply --containers "$n" >/dev/null 2>&1 || bad "SF3: apply"
cand_id=$(statephase "c.$n.cand_id")
extra_env=(FLOWMATE_WORKERS_STATE_FAIL_AT="c.$n.rb=orig_named")
sw --rollback >"$work/sf3.out" 2>&1; rc=$?
extra_env=()
[ "$rc" != 0 ] && grep -q "STATE FILE UNWRITABLE: could not record 'c.$n.rb=orig_named'" "$work/sf3.out" &&
  grep -q "$n=ready/rb:cand_parked" "$work/sf3.out" &&
  [ "$(insp "$n" '{{.Id}} {{.State.Status}} {{.HostConfig.RestartPolicy.Name}}')" = "$orig_id exited no" ] &&
  [ "$(insp "$cand_id" '{{.State.Status}} {{.Name}}')" = "exited /$n-oci-rolledback-$(statephase ts)" ] &&
  [ "$(statephase "c.$n.rb")" = cand_parked ] && [ "$(statephase phase)" = rolling_back ] &&
  ok "SF3: state write fails after the rename back: exit $rc, original not restarted (restart policy still 'no'), report shows rb:cand_parked" || { cat "$work/sf3.out"; bad "SF3"; }
sw --rollback >"$work/sf3b.out" 2>&1 && [ "$(insp "$n" '{{.Id}} {{.State.Status}} {{.HostConfig.RestartPolicy.Name}}')" = "$orig_id running always" ] &&
  [ "$(sha "$sdir/.env.production")" = "$orig_sha" ] &&
  ok "SF3: a second --rollback resumes from cand_parked and finishes" || { cat "$work/sf3b.out"; bad "SF3 resume"; }
rm_all "$n"

# ================================================================ SF4: 'env_phase restored' not recorded -> a second --rollback finishes
scenario sf4
n="$pfx-sf4"
fixture "$n" --init "$image" sleep 86400
orig_id=$(insp "$n" '{{.Id}}')
sw --apply --containers "$n" >/dev/null 2>&1 || bad "SF4: apply"
extra_env=(FLOWMATE_WORKERS_STATE_FAIL_AT="env_phase=restored")
sw --rollback >"$work/sf4.out" 2>&1; rc=$?
extra_env=()
[ "$rc" != 0 ] && [ "$(statephase env_phase)" = edited ] && [ "$(sha "$sdir/.env.production")" = "$orig_sha" ] &&
  [ "$(statephase "c.$n.phase")" = rolled_back ] || { cat "$work/sf4.out"; bad "SF4 setup (env restored, record failed)"; }
sw --rollback >"$work/sf4b.out" 2>&1 && grep -q 'already matches its pre-cutover sha256; recording it as restored' "$work/sf4b.out" &&
  [ "$(insp "$n" '{{.Id}} {{.State.Status}} {{.HostConfig.RestartPolicy.Name}}')" = "$orig_id running always" ] &&
  [ "$(sha "$sdir/.env.production")" = "$orig_sha" ] && ls "$sdir"/state/switch.state.rolledback-* >/dev/null 2>&1 && ! grep -q 'Manual recovery' "$work/sf4b.out" &&
  ok "SF4: env restored but not recorded: second --rollback accepts the pre-cutover sha and finishes (no manual path)" || { cat "$work/sf4b.out"; bad "SF4"; }
rm_all "$n"

# ================================================================ SF5: first rename done but not recorded -> --rollback accepts it
scenario sf5
n="$pfx-sf5"
fixture "$n" --init "$image" sleep 86400
orig_id=$(insp "$n" '{{.Id}}')
extra_env=(FLOWMATE_WORKERS_STATE_FAIL_AT="c.$n.phase=renamed")
sw --apply --containers "$n" >"$work/sf5.out" 2>&1; rc=$?
extra_env=()
[ "$rc" != 0 ] && [ "$(statephase "c.$n.phase")" = stopped ] && [ "$(insp "$orig_id" '{{.Name}}')" = "/$(statephase "c.$n.prev")" ] &&
  [ -z "$(docker ps -a -q --filter "name=^$n\$")" ] || { cat "$work/sf5.out"; bad "SF5 setup (renamed, recorded as stopped)"; }
sw --rollback >"$work/sf5b.out" 2>&1 && [ "$(insp "$n" '{{.Id}} {{.State.Status}} {{.HostConfig.RestartPolicy.Name}}')" = "$orig_id running always" ] &&
  [ "$(sha "$sdir/.env.production")" = "$orig_sha" ] && [ -z "$(docker ps -a -q --filter "name=^$n-oci-candidate-")" ] &&
  ok "SF5: unrecorded first rename: --rollback accepts it (our own prev name) and restores the original" || { cat "$work/sf5b.out"; bad "SF5"; }
rm_all "$n"

# ================================================================ SF5b: same state, --apply resumes instead
scenario sf5b
n="$pfx-sf5b"
fixture "$n" --init "$image" sleep 86400
orig_id=$(insp "$n" '{{.Id}}')
extra_env=(FLOWMATE_WORKERS_STATE_FAIL_AT="c.$n.phase=renamed")
sw --apply --containers "$n" >/dev/null 2>&1
extra_env=()
cand_id=$(statephase "c.$n.cand_id")
sw --apply >"$work/sf5c.out" 2>&1 && [ "$(statephase phase)" = complete ] && [ "$(insp "$n" '{{.Id}} {{.State.Status}}')" = "$cand_id running" ] &&
  [ "$(insp "$orig_id" '{{.Name}} {{.State.Status}}')" = "/$(statephase "c.$n.prev") exited" ] &&
  ok "SF5b: unrecorded first rename: --apply resumes (rename skipped) and completes" || { cat "$work/sf5c.out"; bad "SF5b"; }
rm_all "$n"

# ================================================================ SF6: 'phase complete' not recorded -> --apply resume only records it
scenario sf6
n="$pfx-sf6"
fixture "$n" --init "$image" sleep 86400
extra_env=(FLOWMATE_WORKERS_STATE_FAIL_AT="phase=complete")
sw --apply --containers "$n" >"$work/sf6.out" 2>&1; rc=$?
extra_env=()
new_id=$(insp "$n" '{{.Id}}')
env_after=$(sha "$sdir/.env.production")
[ "$rc" != 0 ] && [ "$(statephase phase)" = switching ] && [ "$(statephase "c.$n.phase")" = ready ] || { cat "$work/sf6.out"; bad "SF6 setup"; }
start=$(date +%s)
sw --apply >"$work/sf6b.out" 2>&1 && [ "$(statephase phase)" = complete ] && [ "$(insp "$n" '{{.Id}} {{.State.Status}}')" = "$new_id running" ] &&
  [ "$(sha "$sdir/.env.production")" = "$env_after" ] && [ $(($(date +%s) - start)) -lt 30 ] &&
  ok "SF6: switch done but 'complete' not recorded: --apply resume re-checks and records it ($(($(date +%s) - start))s, nothing recreated)" || { cat "$work/sf6b.out"; bad "SF6"; }
: >"$sdir/state/switch.state.tmp.99999"; : >"$sdir/state/switch.state.tmp.99999.2"
: >"$sdir/.env.production.tmp.20990101T000000Z"; : >"$sdir/.env.production.tmp.restore"; : >"$sdir/.env.production.pre-cutover-20990101T000000Z.tmp"
real_backup=$(find "$sdir" -maxdepth 1 -name '.env.production.pre-cutover-*' ! -name '*.tmp' | head -n 1)
sw --done >"$work/sf6c.out" 2>&1 && [ -z "$(find "$sdir/state" -name 'switch.state.tmp.*')" ] &&
  [ -z "$(find "$sdir" -maxdepth 1 \( -name '.env.production.tmp.*' -o -name '.env.production.pre-cutover-*.tmp' \))" ] &&
  [ -n "$real_backup" ] && [ -f "$real_backup" ] && [ -f "$sdir/.env.production" ] &&
  ok "stale switch.state.tmp.* and env .tmp files (killed steps, credentials) are purged under the lock; the real backup stays" || { cat "$work/sf6c.out"; bad "tmp purge"; }
rm_all "$n"

# ================================================================ SF7: hand restore of the backup, then --apply resume -> no false "complete"
scenario sf7
n="$pfx-sf7"
fixture "$n" --init "$image" sleep 86400
orig_id=$(insp "$n" '{{.Id}}')
extra_env=(FLOWMATE_WORKERS_STATE_FAIL_AT="phase=complete")
sw --apply --containers "$n" >/dev/null 2>&1
extra_env=()
cp -p "$(statephase env_backup)" "$sdir/.env.production"   # the operator's hand restore
sw --apply >"$work/sf7.out" 2>&1 && bad "SF7: --apply after a hand restore should fail"
[ ! -f "$sdir/state/switch.state" ] && ls "$sdir"/state/switch.state.failed-* >/dev/null 2>&1 &&
  grep -q 'no longer matches the switched file recorded in the state' "$work/sf7.out" && ! grep -q 'all workers switched' "$work/sf7.out" &&
  [ "$(insp "$n" '{{.Id}} {{.State.Status}} {{.HostConfig.RestartPolicy.Name}}')" = "$orig_id running always" ] && [ "$(sha "$sdir/.env.production")" = "$orig_sha" ] &&
  ok "SF7: env restored by hand after an interrupted apply: --apply resume fails the env check and rolls back (never 'complete')" || { cat "$work/sf7.out"; bad "SF7"; }
rm_all "$n"

# ================================================================ SF8: env edited by hand while the state says backed_up -> --rollback refuses
scenario sf8
n="$pfx-sf8"
fixture "$n" --init "$image" sleep 86400
orig_id=$(insp "$n" '{{.Id}}')
extra_env=(FLOWMATE_WORKERS_STATE_FAIL_AT="env_phase=edited")
sw --apply --containers "$n" >/dev/null 2>&1
extra_env=()
printf 'HAND_EDIT=1\n' >>"$sdir/.env.production"
edited_sha=$(sha "$sdir/.env.production")
before=$(snapshot "$n")
sw --rollback >"$work/sf8.out" 2>&1 && bad "SF8: --rollback over a hand edit should refuse"
[ "$(statephase env_phase)" = backed_up ] && [ "$(snapshot "$n")" = "$before" ] && [ "$(sha "$sdir/.env.production")" = "$edited_sha" ] &&
  grep -q 'was changed after the switch' "$work/sf8.out" && grep -q 'Manual recovery' "$work/sf8.out" &&
  ok "SF8: hand edit while the state says backed_up: --rollback refuses (no overwrite), prints the manual path" || { cat "$work/sf8.out"; bad "SF8"; }
rm_all "$n"

echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
