#!/bin/bash
# deploy/oci/deploy.sh guards, with a stub docker (no Docker needed; bash 3.2+):
# start/restart/check validate everything (network, .env.production DB host = flowmate-db,
# explicit image refs) BEFORE anything is stopped or started.
#
#   bash deploy/oci/db/tests/deploy-guard.test.sh
# shellcheck disable=SC2015  # `check && ok ... || bad ...`: ok() always succeeds
set -u
DEPLOY=$(cd -- "$(dirname -- "$0")/../.." && pwd)/deploy.sh
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
mkdir -p "$work/proj"
cat >"$work/docker" <<'STUB'
#!/bin/bash
echo "docker $*" >>"$STUB_LOG"
case "$1 $2" in
  "network inspect") exit "${STUB_NET_MISSING:-0}" ;;
  "image inspect") case "$3" in *missing*) exit 1 ;; esac ;;
esac
exit 0
STUB
chmod +x "$work/docker"
pass=0
fail=0
ok() { echo "ok   $1"; pass=$((pass + 1)); }
bad() { echo "FAIL $1"; fail=$((fail + 1)); }
dbhost() { printf 'DATABASE_URL=postgresql://flowmate_app:pw@%s:5432/flowmate\nDIRECT_URL=x\nOTHER=1\n' "$1" >"$work/proj/.env.production"; }
run() { # NAME CMD [ENV=VAL...]
  local name=$1 cmd=$2
  shift 2
  export STUB_LOG="$work/$name.log"
  : >"$STUB_LOG"
  env FLOWMATE_DOCKER="$work/docker" FLOWMATE_PROJECT_DIR="$work/proj" FLOWMATE_RESTART_PAUSE=0 \
    CRAWLER_IMAGE=flowmate-crawler:pr9 EMBEDDING_IMAGE=flowmate-embedding:x PARSER_IMAGE=flowmate-parser:x "$@" \
    bash "$DEPLOY" "$cmd" >"$work/$name.out" 2>&1
}
touched() { grep -qE '^docker (stop|rm|run) ' "$work/$1.log"; }

dbhost aws-1-ap-northeast-2.pooler.supabase.com
run supa_check check && bad "check with Supabase host should fail" || { grep -q "not flowmate-db" "$work/supa_check.out" && ok "check: DATABASE_URL host not flowmate-db -> refused" || bad "check message"; }
run supa_restart restart && bad "restart with Supabase host should fail" || { ! touched supa_restart && ok "restart: refused BEFORE stopping anything (Supabase host)" || bad "restart stopped workers"; }
run supa_start start && bad "start with Supabase host should fail" || { ! touched supa_start && ok "start: refused, nothing started" || bad "start ran"; }
run supa_allowed check FLOWMATE_ALLOW_NON_OCI_DB=1 && grep -q "allowed by FLOWMATE_ALLOW_NON_OCI_DB" "$work/supa_allowed.out" &&
  ok "check: FLOWMATE_ALLOW_NON_OCI_DB=1 override (rollback case)" || bad "override"

dbhost flowmate-db
run ok_check check && ok "check: flowmate-db host, network, images -> ok" || bad "check ok case"
run noimg restart CRAWLER_IMAGE=flowmate-crawler:missing && bad "missing image should fail" || { ! touched noimg && ok "restart: missing image refused before stopping" || bad "restart stopped (image)"; }
run unset restart CRAWLER_IMAGE= && bad "unset image should fail" || { ! touched unset && ok "restart: unset image ref refused before stopping" || bad "restart stopped (unset)"; }
run nonet restart STUB_NET_MISSING=1 && bad "missing network should fail" || { ! touched nonet && ok "restart: missing network refused before stopping" || bad "restart stopped (network)"; }
mv "$work/proj/.env.production" "$work/proj/.env.saved"
run noenv restart && bad "missing env file should fail" || { ! touched noenv && ok "restart: missing .env.production refused before stopping" || bad "restart stopped (env)"; }
mv "$work/proj/.env.saved" "$work/proj/.env.production"

if run good restart; then
  s=$(grep -n '^docker stop' "$work/good.log" | head -n 1 | cut -d: -f1)
  r=$(grep -n '^docker run' "$work/good.log" | head -n 1 | cut -d: -f1)
  [ -n "$s" ] && [ -n "$r" ] && [ "$s" -lt "$r" ] && [ "$(grep -c '^docker run .*--network flowmate --cap-drop NET_RAW' "$work/good.log")" = 3 ] &&
    grep -q 'flowmate-crawler:pr9$' "$work/good.log" && ! grep -q 'nginx' "$work/good.log" &&
    ok "restart (valid): stop, then 3 runs with --network flowmate --cap-drop NET_RAW, explicit images, no nginx" || bad "restart valid case"
else bad "restart valid case exited non-zero"; fi

echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
