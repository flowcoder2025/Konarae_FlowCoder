#!/usr/bin/env bash
# Guard test for restore.sh with a stub `docker` (no Docker, no Postgres needed).
# Proves: without FLOWMATE_CONFIRM_SWAP=flowmate nothing touches a non-empty live database
# (no RENAME / DROP / pg_terminate_backend / ALLOW_CONNECTIONS, no backup); a bad or
# unverifiable archive stops before any database is created; no scenario ever DROPs.
#
#   bash deploy/oci/db/tests/restore-guard.test.sh      # bash >= 4.4 + GNU coreutils (e.g. on OCI)
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 PYTHONUTF8=1 PYTHONIOENCODING=utf-8
set -euo pipefail
DB_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
mkdir -p "$work/bin" "$work/home"

for k in POSTGRES_SUPERUSER_PASSWORD FLOWMATE_OWNER_PASSWORD FLOWMATE_APP_PASSWORD PGBOUNCER_AUTH_PASSWORD; do
  printf '%s=%s\n' "$k" "$(printf 'a%.0s' $(seq 1 64))"
done >"$work/home/.env"

cat >"$work/bin/docker" <<'STUB'
#!/usr/bin/env bash
# Stub docker: logs every call (and psql stdin) to $STUB_LOG, answers by pattern.
args="$*"
printf 'docker %s\n' "$args" >>"$STUB_LOG"
stdin=""
if [[ " $args " == *" -f - "* ]]; then stdin=$(cat); printf '%s\n' "$stdin" | sed 's/^/  | /' >>"$STUB_LOG"; fi
case "$args" in
  "inspect -f {{.State.Running}} "*) echo true ;;
  "inspect -f {{.State.Health.Status}} "*) echo healthy ;;
  cp\ *) : ;;
  *"pg_restore -l "*) [ "${STUB_TOC_FAIL:-0}" = 1 ] && exit 1; echo "3; 1259 1 TABLE DATA public foo postgres" ;;
  *"pg_restore -d "*) [ "${STUB_RESTORE_FAIL:-0}" = 1 ] && exit 1; : ;;
  *"roles_present"*) echo 3 ;;
  *"live_exists"*) echo "${STUB_LIVE_EXISTS:-1}" ;;
  *"live_relations"*) echo "${STUB_LIVE_NREL:-40}" ;;
  *"terminate_live"*) echo 0 ;;
  *) if [[ $stdin == *"query_to_xml"* ]]; then printf '%b\n' "${STUB_COUNTS:-foo\t5}"
     elif [[ $stdin == *"\\getenv"* ]]; then echo "roles.sql: ok"
     elif [[ $stdin == *"Privilege self-check"* ]]; then [ "${STUB_PRIV_FAIL:-0}" = 1 ] && echo "table not owned by flowmate_owner: foo"; :
     fi ;;
esac
exit 0
STUB
# shellcheck disable=SC2016  # $STUB_LOG expands when the fake backup runs
printf '#!/usr/bin/env bash\necho BACKUP >>"$STUB_LOG"\n' >"$work/bin/fake-backup"
chmod +x "$work/bin/docker" "$work/bin/fake-backup"

printf 'PGDMP fake archive\n' >"$work/x.dump"
(cd "$work" && sha256sum x.dump >x.dump.sha256)

pass=0
fail=0
n=0
# run NAME EXPECTED_EXIT [ENV=VALUE...] -- runs restore.sh with the stub, log in $work/NAME.log
run() {
  local name=$1 want=$2 rc=0
  shift 2
  n=$((n + 1))
  export STUB_LOG="$work/$name.log"
  : >"$STUB_LOG"
  env PATH="$work/bin:$PATH" FLOWMATE_DB_HOME="$work/home" FLOWMATE_ENV_FILE="$work/home/.env" \
    FLOWMATE_BACKUP_CMD="$work/bin/fake-backup" TELEGRAM_ENV_FILE=/nonexistent "$@" \
    bash "$DB_DIR/restore.sh" "${DUMP:-$work/x.dump}" >"$work/$name.out" 2>&1 </dev/null || rc=$?
  if [ "$rc" != "$want" ]; then
    echo "FAIL $name: exit $rc, expected $want"; sed 's/^/    /' "$work/$name.out"; fail=$((fail + 1)); return 1
  fi
}
ok() { echo "ok   $1"; pass=$((pass + 1)); }
bad() { echo "FAIL $1"; fail=$((fail + 1)); }
has() { grep -qE "$2" "$work/$1.log"; }
touches_live() { has "$1" 'RENAME|DROP DATABASE|pg_terminate_backend|ALLOW_CONNECTIONS|terminate_live'; }

# 1. no confirm, non-empty live db: staging only, live untouched, no backup
if run noconfirm 0; then
  if ! touches_live noconfirm && ! has noconfirm BACKUP && has noconfirm 'CREATE DATABASE flowmate_restore_' &&
    grep -q 'FLOWMATE_CONFIRM_SWAP=flowmate' "$work/noconfirm.out"; then ok "no confirm: staging only, live untouched"
  else bad "no confirm: live touched or staging missing"; fi
fi
# 2. wrong confirm value behaves like no confirm
if run wrongconfirm 0 FLOWMATE_CONFIRM_SWAP=yes; then
  if ! touches_live wrongconfirm && ! has wrongconfirm BACKUP; then ok "wrong confirm value: live untouched"
  else bad "wrong confirm value touched live"; fi
fi
# 3. confirm: backup first, then rename in one transaction
if run confirm 0 FLOWMATE_CONFIRM_SWAP=flowmate; then
  b=$(grep -n BACKUP "$work/confirm.log" | head -1 | cut -d: -f1)
  r=$(grep -n 'RENAME TO flowmate_prev_' "$work/confirm.log" | head -1 | cut -d: -f1)
  if [ -n "$b" ] && [ -n "$r" ] && [ "$b" -lt "$r" ] && has confirm 'ALLOW_CONNECTIONS false' &&
    has confirm 'BEGIN;'; then ok "confirm: backup before swap, rename transaction"
  else bad "confirm: missing backup/rename order"; fi
fi
# 4. empty live db (first restore): swap without confirm, no backup
if run emptylive 0 STUB_LIVE_NREL=0; then
  if has emptylive 'RENAME TO flowmate_prev_' && ! has emptylive BACKUP; then ok "empty live db: swap without confirm"
  else bad "empty live db: unexpected behaviour"; fi
fi
# 5. live db missing: staging renamed to flowmate
if run nolive 0 STUB_LIVE_EXISTS=0; then
  if has nolive 'RENAME TO flowmate$' && ! has nolive 'flowmate_prev_'; then ok "no live db: staging becomes flowmate"
  else bad "no live db: unexpected behaviour"; fi
fi
# 6. sha256 mismatch -> stop before any CREATE DATABASE
cp "$work/x.dump" "$work/y.dump"; (cd "$work" && sha256sum x.dump | sed 's/x.dump/y.dump/' >y.dump.sha256); printf 'tamper' >>"$work/y.dump"
if DUMP="$work/y.dump" run badsum 1 FLOWMATE_CONFIRM_SWAP=flowmate; then
  if ! has badsum 'CREATE DATABASE' && ! touches_live badsum; then ok "sha256 mismatch: nothing created"; else bad "sha256 mismatch created something"; fi
fi
# 7. missing .sha256
cp "$work/x.dump" "$work/z.dump"
if DUMP="$work/z.dump" run nosum 1 FLOWMATE_CONFIRM_SWAP=flowmate; then
  if ! has nosum 'CREATE DATABASE'; then ok "missing .sha256: nothing created"; else bad "missing .sha256 created something"; fi
fi
# 8. unreadable archive
if run badtoc 1 FLOWMATE_CONFIRM_SWAP=flowmate STUB_TOC_FAIL=1; then
  if ! has badtoc 'CREATE DATABASE'; then ok "pg_restore -l failure: nothing created"; else bad "bad archive created something"; fi
fi
# 9. not enough disk
if run nodisk 1 FLOWMATE_CONFIRM_SWAP=flowmate FLOWMATE_RESTORE_MIN_FREE_KB=999999999999; then
  if ! has nodisk 'CREATE DATABASE'; then ok "not enough disk: nothing created"; else bad "low disk created something"; fi
fi
# 10. manifest mismatch -> no swap even when confirmed
printf 'foo\t6\n' >"$work/x.dump.counts.tsv"
if run badcounts 1 FLOWMATE_CONFIRM_SWAP=flowmate; then
  if ! touches_live badcounts && ! has badcounts BACKUP; then ok "manifest mismatch: no swap"; else bad "manifest mismatch swapped"; fi
fi
# 11. manifest match -> swap proceeds
printf 'foo\t5\n' >"$work/x.dump.counts.tsv"
if run goodcounts 0 FLOWMATE_CONFIRM_SWAP=flowmate; then
  if has goodcounts 'RENAME TO flowmate_prev_'; then ok "manifest match: swap"; else bad "manifest match: no swap"; fi
fi
rm -f "$work/x.dump.counts.tsv"
# 12. privilege check failure -> no swap
if run badpriv 1 FLOWMATE_CONFIRM_SWAP=flowmate STUB_PRIV_FAIL=1; then
  if ! touches_live badpriv; then ok "privilege check failure: no swap"; else bad "privilege failure swapped"; fi
fi
# 13. restore failure -> no swap
if run badrestore 1 FLOWMATE_CONFIRM_SWAP=flowmate STUB_RESTORE_FAIL=1; then
  if ! touches_live badrestore; then ok "pg_restore failure: no swap"; else bad "restore failure swapped"; fi
fi
# 14. never DROP DATABASE in any scenario
if ! grep -l 'DROP DATABASE' "$work"/*.log >/dev/null 2>&1; then ok "no scenario issued DROP DATABASE"; else bad "DROP DATABASE issued"; fi

echo "$pass passed, $fail failed ($n runs)"
[ "$fail" -eq 0 ]
