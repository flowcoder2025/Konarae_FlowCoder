#!/bin/bash
# deploy/oci/deploy.sh guards, with a stub docker (no Docker needed; bash 3.2+):
#  - check/start/restart validate everything (network, exactly one DATABASE_URL whose host is
#    flowmate-db, explicit image refs) before anything is created, stopped or started;
#  - restart `docker create`s all three new containers first and only then stops/removes the
#    old ones; a failed create stops nothing;
#  - guard messages never echo any part of the URL except a strictly parsed host;
#  - a promotion that fails half-way prints the ACTUAL per-service state and recovery commands.
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
case "$1" in
  network) exit "${STUB_NET_MISSING:-0}" ;;
  image) case "$3" in *missing*) exit 1 ;; esac ;;
  container) # `container inspect [-f FMT] NAME`; STUB_EXISTS=0: the old workers exist, 1: none exist
    [ "${STUB_EXISTS:-1}" = 0 ] || exit 1
    [ "$3" = -f ] && echo "${5}:old-tag (sha256:old-$5)"
    exit 0 ;;
  start) case "$2" in "${STUB_START_FAIL:-@none@}") echo "Error: port is already allocated" >&2; exit 1 ;; esac ;;
  stop) case "$2" in "${STUB_STOP_FAIL:-@none@}") echo "Error: cannot stop container" >&2; exit 1 ;; esac ;;
  rm) case "$2" in "${STUB_RM_FAIL:-@none@}") echo "Error: removal in progress" >&2; exit 1 ;; esac ;;
  create) case "$*" in *"${STUB_CREATE_FAIL:-@none@}"*) echo "invalid env file" >&2; exit 125 ;; esac; echo "id-$RANDOM" ;;
esac
exit 0
STUB
chmod +x "$work/docker"
pass=0
fail=0
ok() { echo "ok   $1"; pass=$((pass + 1)); }
bad() { echo "FAIL $1"; fail=$((fail + 1)); }
envf() { printf '%b' "$1" >"$work/proj/.env.production"; }
dburl() { envf "DATABASE_URL=$1\nDIRECT_URL=x\nOTHER=1\n"; }
run() { # NAME CMD [ENV=VAL...]
  local name=$1 cmd=$2
  shift 2
  export STUB_LOG="$work/$name.log"
  : >"$STUB_LOG"
  env FLOWMATE_DOCKER="$work/docker" FLOWMATE_PROJECT_DIR="$work/proj" \
    CRAWLER_IMAGE=flowmate-crawler:pr9 EMBEDDING_IMAGE=flowmate-embedding:x PARSER_IMAGE=flowmate-parser:x "$@" \
    bash "$DEPLOY" "$cmd" >"$work/$name.out" 2>&1
}
touched_live() { grep -qE '^docker (stop|rm|run|start|rename) flowmate-(crawler|embedding|parser)( |$)' "$work/$1.log"; }
created_any() { grep -q '^docker create' "$work/$1.log"; }

# --- DB host guard + message hygiene ---
dburl 'postgresql://postgres.abcdef:SUPERSECRETPW@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true'
run supa_check check && bad "check with Supabase host should fail" || {
  grep -q 'host is aws-1-ap-northeast-2.pooler.supabase.com, not flowmate-db' "$work/supa_check.out" &&
    ! grep -qE 'SUPERSECRETPW|abcdef|postgres\.|6543|pgbouncer=' "$work/supa_check.out" &&
    ok "check: non-OCI host refused; message shows the parsed host only (no user/password/port/params)" || bad "check message"; }
run supa_restart restart && bad "restart with Supabase host should fail" || { ! touched_live supa_restart && ! created_any supa_restart && ok "restart: refused before creating or stopping anything" || bad "restart touched"; }
run supa_start start && bad "start with Supabase host should fail" || { ! touched_live supa_start && ok "start: refused, nothing started" || bad "start ran"; }
run supa_allowed check FLOWMATE_ALLOW_NON_OCI_DB=1 && grep -q "allowed by FLOWMATE_ALLOW_NON_OCI_DB" "$work/supa_allowed.out" &&
  ok "check: FLOWMATE_ALLOW_NON_OCI_DB=1 override (rollback case)" || bad "override"

dburl 'postgresql://flowmate_app:SUPERSECRETPW@weird host name/flowmate'
run unparse check && bad "unparseable URL should fail" || {
  grep -q 'host is unparseable' "$work/unparse.out" && ! grep -qE 'SUPERSECRETPW|flowmate_app|weird|host name' "$work/unparse.out" &&
    ok "unparseable DATABASE_URL: reported as 'unparseable', no part of the URL printed" || { cat "$work/unparse.out"; bad "unparseable message"; }; }

envf 'DATABASE_URL=postgresql://flowmate_app:pw@flowmate-db:5432/flowmate\n   DATABASE_URL=postgresql://u:SUPERSECRETPW@aws.example:5432/postgres\n'
run dup check && bad "duplicate DATABASE_URL should fail" || {
  grep -q 'exactly once (found 2)' "$work/dup.out" && ! grep -q SUPERSECRETPW "$work/dup.out" && ok "indented duplicate DATABASE_URL: refused (docker would use the last one)" || bad "dup"; }

# --- OCI host: everything else validated before stopping ---
dburl 'postgresql://flowmate_app:SUPERSECRETPW@flowmate-db:5432/flowmate'
run ok_check check && ! grep -q SUPERSECRETPW "$work/ok_check.out" && ok "check: flowmate-db host, network, images -> ok" || bad "check ok case"
run noimg restart CRAWLER_IMAGE=flowmate-crawler:missing && bad "missing image should fail" || { ! touched_live noimg && ok "restart: missing image refused before stopping" || bad "restart (image)"; }
run unset restart CRAWLER_IMAGE= && bad "unset image should fail" || { ! touched_live unset && ok "restart: unset image ref refused before stopping" || bad "restart (unset)"; }
run nonet restart STUB_NET_MISSING=1 && bad "missing network should fail" || { ! touched_live nonet && ok "restart: missing network refused before stopping" || bad "restart (network)"; }
mv "$work/proj/.env.production" "$work/proj/.env.saved"
run noenv restart && bad "missing env file should fail" || { ! touched_live noenv && ok "restart: missing .env.production refused before stopping" || bad "restart (env)"; }
mv "$work/proj/.env.saved" "$work/proj/.env.production"

# --- (a) create-first: a failing create (e.g. docker rejects the env file) stops nothing ---
run createfail restart STUB_CREATE_FAIL=flowmate-embedding-next && bad "create failure should fail" || {
  ! touched_live createfail && grep -q '^docker rm -f flowmate-crawler-next-' "$work/createfail.log" &&
    ok "restart: 2nd docker create fails -> nothing stopped, the 1st new container removed" || { cat "$work/createfail.log"; bad "create failure"; }; }

if run good restart STUB_EXISTS=0; then
  c=$(grep -n '^docker create' "$work/good.log" | tail -n 1 | cut -d: -f1)
  s=$(grep -nE '^docker stop flowmate-(crawler|embedding|parser)$' "$work/good.log" | head -n 1 | cut -d: -f1)
  [ "$(grep -c '^docker create' "$work/good.log")" = 3 ] && [ -n "$c" ] && [ -n "$s" ] && [ "$c" -lt "$s" ] &&
    [ "$(grep -c '^docker create .*--restart unless-stopped --network flowmate --cap-drop NET_RAW' "$work/good.log")" = 3 ] &&
    [ "$(grep -cE '^docker rename flowmate-(crawler|embedding|parser)-next-[0-9TZ]+ flowmate-(crawler|embedding|parser)$' "$work/good.log")" = 3 ] &&
    grep -q 'flowmate-crawler:pr9$' "$work/good.log" && ! grep -q nginx "$work/good.log" && ! grep -q '^docker run' "$work/good.log" &&
    ok "restart (valid): 3 creates (unless-stopped, network flowmate, NET_RAW dropped) BEFORE the first stop, then rename + start" ||
    { cat "$work/good.log"; bad "restart valid case"; }
else bad "restart valid case exited non-zero"; fi
run startexists start STUB_EXISTS=0 && bad "start over existing containers should fail" || { ! touched_live startexists && ! created_any startexists && ok "start: refuses when the workers already exist (use restart)" || bad "start exists"; }

# --- (I1) promotion fails at embedding's start (e.g. port busy): recovery text == real end state ---
if run promofail restart STUB_EXISTS=0 STUB_START_FAIL=flowmate-embedding; then bad "promotion failure should exit non-zero"; else
  L="$work/promofail.log"; O="$work/promofail.out"
  # end state according to the stub log
  grep -q '^docker start flowmate-crawler$' "$L" && grep -qE '^docker rename flowmate-embedding-next-[0-9TZ]+ flowmate-embedding$' "$L" &&
    grep -q '^docker rm flowmate-embedding$' "$L" && grep -q '^docker start flowmate-embedding$' "$L" &&
    ! grep -qE '^docker (stop|rm|rename|start) flowmate-parser( |$)' "$L" && pnext=$(grep -oE 'flowmate-parser-next-[0-9TZ]+' "$L" | head -n 1) && [ -n "$pnext" ] &&
    ok "stub end state: crawler promoted, embedding old removed + candidate renamed but start failed, parser untouched with orphan $pnext" || bad "promofail end state"
  # printed recovery must describe exactly that state
  grep -q 'flowmate-crawler: promoted' "$O" && grep -q 'flowmate-embedding: the old container was removed; the new one is named flowmate-embedding but NOT started' "$O" &&
    grep -q "start flowmate-embedding" "$O" && grep -q 'previous image of flowmate-embedding: flowmate-embedding:old-tag' "$O" &&
    grep -q "flowmate-parser: untouched (old container still running)" "$O" && grep -q "rm $pnext" "$O" &&
    ! grep -q 'rename flowmate-parser-next' "$O" &&
    ok "printed recovery matches it: crawler nothing to do, 'docker start flowmate-embedding' (+ previous image), parser 'docker rm $pnext'" || { cat "$O"; bad "promofail recovery text"; }
fi

# --- (C) promotion fails at embedding's stop / rm: the old container is still there -> never "rm flowmate-embedding" ---
for st in stop rm; do
  if [ "$st" = stop ]; then failenv=STUB_STOP_FAIL=flowmate-embedding; else failenv=STUB_RM_FAIL=flowmate-embedding; fi
  if run "promo$st" restart STUB_EXISTS=0 "$failenv"; then bad "$st failure should exit non-zero"; continue; fi
  L="$work/promo$st.log"; O="$work/promo$st.out"
  enext=$(grep -oE 'flowmate-embedding-next-[0-9TZ]+' "$L" | head -n 1)
  ! grep -qE '^docker (rename|start) [^ ]* ?flowmate-embedding$' "$L" && ! grep -qE '^docker rename flowmate-embedding-next' "$L" &&
    grep -q "flowmate-crawler: promoted" "$O" && grep -q "rm $enext" "$O" &&
    ! grep -qE 'rm flowmate-embedding( |$|\))' "$O" && ! grep -q 'To go back instead' "$O" &&
    grep -q "flowmate-parser: untouched" "$O" &&
    ok "promotion fails at embedding's $st: recovery removes only $enext, no 'rm flowmate-embedding' / re-create hint" || { cat "$O"; bad "promo$st recovery text"; }
done

echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
