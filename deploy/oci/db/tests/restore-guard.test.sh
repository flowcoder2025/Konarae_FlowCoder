#!/usr/bin/env bash
# Guard test for restore.sh with a stub `docker` (no Docker, no Postgres needed).
# Proves: without FLOWMATE_CONFIRM_SWAP=<dump basename> nothing touches a non-empty live
# database (no RENAME / DROP / pg_terminate_backend / ALLOW_CONNECTIONS, no backup); an
# unverifiable, schema-only, manifest-less or mismatching archive never gets swapped in;
# a failed rename gives the live db its connections back; no scenario ever DROPs.
#
#   bash deploy/oci/db/tests/restore-guard.test.sh      # bash >= 4.4 + GNU coreutils (e.g. on OCI)
# shellcheck disable=SC2015  # `check && ok ... || bad ...`: ok() always succeeds
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
  *"pg_restore -l "*)
    [ "${STUB_TOC_FAIL:-0}" = 1 ] && exit 1
    if [ "${STUB_TOC_SCHEMA_ONLY:-0}" = 1 ]; then echo "3; 1259 1 TABLE public foo postgres"
    else echo "3; 1259 1 TABLE public foo postgres"; echo "9; 0 1 TABLE DATA public foo postgres"; fi ;;
  *"pg_restore -d "*) [ "${STUB_RESTORE_FAIL:-0}" = 1 ] && exit 1; : ;;
  *"roles_present"*) echo 3 ;;
  *"existing_restore_dbs"*) printf '%b' "${STUB_LEFTOVERS:-}" ;;
  *"live_exists"*) echo "${STUB_LIVE_EXISTS:-1}" ;;
  *"live_relations"*) echo "${STUB_LIVE_NREL:-40}" ;;
  *"live_tables"*) printf '%b\n' "${STUB_LIVE_TABLES:-foo}" ;;
  *"terminate_live"* | *"terminate_staging"*) echo 0 ;;
  *"-c ALTER DATABASE flowmate WITH ALLOW_CONNECTIONS true"*) [ "${STUB_REENABLE_FAIL:-0}" = 1 ] && exit 1; : ;;
  *) if [[ $stdin == *"query_to_xml"* ]]; then [ -n "${STUB_COUNTS-foo\t5}" ] && printf '%b\n' "${STUB_COUNTS-foo\t5}"
     elif [[ $stdin == *"\\getenv"* ]]; then echo "roles.sql: ok"
     elif [[ $stdin == *"Privilege self-check"* ]]; then [ "${STUB_PRIV_FAIL:-0}" = 1 ] && echo "table not owned by flowmate_owner: foo"
     elif [[ $stdin == *"RENAME TO flowmate_prev_"* ]] && [ "${STUB_RENAME_FAIL:-0}" = 1 ]; then
       echo "ERROR:  database \"flowmate_restore_x\" is being accessed by other users" >&2; exit 1
     fi ;;
esac
exit 0
STUB
# shellcheck disable=SC2016  # $STUB_LOG expands when the fake backup runs
printf '#!/usr/bin/env bash\necho BACKUP >>"$STUB_LOG"\n' >"$work/bin/fake-backup"
chmod +x "$work/bin/docker" "$work/bin/fake-backup"

D="$work/x.dump"
printf 'PGDMP fake archive\n' >"$D"
(cd "$work" && sha256sum x.dump >x.dump.sha256)
manifest() { printf '%b\n' "$1" >"$D.counts.tsv"; }

pass=0
fail=0
n=0
# run NAME EXPECTED_EXIT [ENV=VALUE...] [-- restore args...]
run() {
  local name=$1 want=$2 rc=0 envs=() rargs=()
  shift 2
  while [ $# -gt 0 ] && [ "$1" != "--" ]; do envs+=("$1"); shift; done
  [ "${1:-}" = "--" ] && { shift; rargs=("$@"); }
  n=$((n + 1))
  export STUB_LOG="$work/$name.log"
  : >"$STUB_LOG"
  env PATH="$work/bin:$PATH" FLOWMATE_DB_HOME="$work/home" FLOWMATE_ENV_FILE="$work/home/.env" \
    FLOWMATE_TEST_MODE=1 FLOWMATE_BACKUP_CMD="$work/bin/fake-backup" TELEGRAM_ENV_FILE=/nonexistent "${envs[@]}" \
    bash "$DB_DIR/restore.sh" "${rargs[@]}" "${DUMP:-$D}" >"$work/$name.out" 2>&1 </dev/null || rc=$?
  if [ "$rc" != "$want" ]; then
    echo "FAIL $name: exit $rc, expected $want"; sed 's/^/    /' "$work/$name.out"; fail=$((fail + 1)); return 1
  fi
}
ok() { echo "ok   $1"; pass=$((pass + 1)); }
bad() { echo "FAIL $1"; fail=$((fail + 1)); }
has() { grep -qE -- "$2" "$work/$1.log"; }
says() { grep -qE -- "$2" "$work/$1.out"; }
touches_live() { has "$1" 'RENAME|DROP DATABASE|pg_terminate_backend|ALLOW_CONNECTIONS|terminate_live'; }
created() { has "$1" 'CREATE DATABASE'; }
CONFIRM=FLOWMATE_CONFIRM_SWAP=x.dump

manifest 'foo\t5'
# --- confirmation ---
if run noconfirm 0; then
  if ! touches_live noconfirm && ! has noconfirm BACKUP && created noconfirm && says noconfirm 'FLOWMATE_CONFIRM_SWAP=x.dump'
  then ok "no confirm: staging only, live untouched, token printed"; else bad "no confirm: live touched or staging missing"; fi
fi
if run statictoken 0 FLOWMATE_CONFIRM_SWAP=flowmate; then
  if ! touches_live statictoken && ! has statictoken BACKUP; then ok "static token 'flowmate': live untouched"; else bad "static token swapped"; fi
fi
if run confirm 0 "$CONFIRM"; then
  b=$(grep -n BACKUP "$work/confirm.log" | head -1 | cut -d: -f1 || true)
  f=$(grep -nE 'ALTER DATABASE flowmate_restore_[0-9_]+ WITH ALLOW_CONNECTIONS false' "$work/confirm.log" | head -1 | cut -d: -f1 || true)
  r=$(grep -n 'RENAME TO flowmate_prev_' "$work/confirm.log" | head -1 | cut -d: -f1 || true)
  if [ -n "$b" ] && [ -n "$f" ] && [ -n "$r" ] && [ "$b" -lt "$f" ] && [ "$f" -lt "$r" ] && has confirm terminate_staging &&
    has confirm 'ALTER DATABASE flowmate WITH ALLOW_CONNECTIONS false'; then ok "confirm: backup, fence staging+live, then rename tx"
  else bad "confirm: wrong order or missing staging fence"; fi
fi
if run emptylive 0 STUB_LIVE_NREL=0; then
  if has emptylive 'RENAME TO flowmate_prev_' && ! has emptylive BACKUP; then ok "empty live db: swap without confirm"; else bad "empty live db"; fi
fi
if run nolive 0 STUB_LIVE_EXISTS=0; then
  if has nolive 'RENAME TO flowmate;' && ! has nolive 'flowmate_prev_'; then ok "no live db: staging becomes flowmate"; else bad "no live db"; fi
fi
if run nobackupoverride 1 FLOWMATE_TEST_MODE=0 "$CONFIRM"; then
  if ! created nobackupoverride && ! touches_live nobackupoverride; then ok "FLOWMATE_BACKUP_CMD refused outside test mode"; else bad "backup override accepted"; fi
fi
# --- archive validation: nothing created ---
cp "$D" "$work/y.dump"; sed 's/x.dump/y.dump/' "$D.sha256" >"$work/y.dump.sha256"; printf 'tamper' >>"$work/y.dump"; cp "$D.counts.tsv" "$work/y.dump.counts.tsv"
if DUMP="$work/y.dump" run badsum 1 FLOWMATE_CONFIRM_SWAP=y.dump; then ! created badsum && ok "sha256 mismatch: nothing created" || bad "sha256 mismatch created"; fi
cp "$D" "$work/z.dump"; cp "$D.counts.tsv" "$work/z.dump.counts.tsv"
if DUMP="$work/z.dump" run nosum 1 FLOWMATE_CONFIRM_SWAP=z.dump; then ! created nosum && ok "missing .sha256: nothing created" || bad "missing .sha256 created"; fi
mv "$D.counts.tsv" "$work/saved.counts"
if run nomanifest 1 "$CONFIRM"; then ! created nomanifest && ! touches_live nomanifest && ok "missing manifest: nothing created, no swap" || bad "missing manifest"; fi
mv "$work/saved.counts" "$D.counts.tsv"
if run badtoc 1 "$CONFIRM" STUB_TOC_FAIL=1; then ! created badtoc && ok "unreadable archive: nothing created" || bad "bad archive created"; fi
if run schemaonly 1 "$CONFIRM" STUB_TOC_SCHEMA_ONLY=1; then ! created schemaonly && ! touches_live schemaonly && ok "schema-only archive: nothing created, no swap" || bad "schema-only"; fi
if run nodisk 1 "$CONFIRM" FLOWMATE_RESTORE_MIN_FREE_KB=999999999999; then ! created nodisk && ok "low disk: nothing created" || bad "low disk created"; fi
# --- staging verification: no swap ---
if run badcounts 1 "$CONFIRM" 'STUB_COUNTS=foo\t6'; then ! touches_live badcounts && ! has badcounts BACKUP && ok "manifest mismatch: no swap" || bad "mismatch swapped"; fi
if run zerotables 1 "$CONFIRM" STUB_COUNTS=; then ! touches_live zerotables && says zerotables 'no tables' && ok "zero tables: no swap" || bad "zero tables swapped"; fi
if run missinglive 1 "$CONFIRM" 'STUB_LIVE_TABLES=foo\nbar'; then
  ! touches_live missinglive && says missinglive 'lacks live tables: bar' && ok "staging missing a live table: no swap" || bad "missing live table swapped"; fi
if run missingliveok 0 "$CONFIRM" 'STUB_LIVE_TABLES=foo\nbar' -- --allow-missing-live-tables; then
  has missingliveok 'RENAME TO flowmate_prev_' && ok "--allow-missing-live-tables: swap" || bad "override ignored"; fi
manifest 'document_embeddings\t13467\nfoo\t5'
if run exclnoflag 1 "$CONFIRM" 'STUB_COUNTS=document_embeddings\t0\nfoo\t5'; then ! touches_live exclnoflag && ok "excluded data without --manifest-exclude: no swap" || bad "exclnoflag swapped"; fi
if run excl 0 "$CONFIRM" 'STUB_COUNTS=document_embeddings\t0\nfoo\t5' -- --manifest-exclude document_embeddings; then
  has excl 'RENAME TO flowmate_prev_' && ok "--manifest-exclude document_embeddings (0 rows): swap" || bad "exclude: no swap"; fi
if run exclrows 1 "$CONFIRM" 'STUB_COUNTS=document_embeddings\t3\nfoo\t5' -- --manifest-exclude document_embeddings; then
  ! touches_live exclrows && ok "excluded table with rows in staging: no swap" || bad "exclrows swapped"; fi
if run exclmissing 1 "$CONFIRM" 'STUB_COUNTS=foo\t5' -- --manifest-exclude document_embeddings; then
  ! touches_live exclmissing && ok "excluded table missing in staging: no swap" || bad "exclmissing swapped"; fi
manifest 'foo\t5'
if run badpriv 1 "$CONFIRM" STUB_PRIV_FAIL=1; then ! touches_live badpriv && ok "privilege check failure: no swap" || bad "privilege failure swapped"; fi
if run badrestore 1 "$CONFIRM" STUB_RESTORE_FAIL=1; then ! touches_live badrestore && ok "pg_restore failure: no swap" || bad "restore failure swapped"; fi
# --- failed rename: live gets its connections back ---
if run renamefail 1 "$CONFIRM" STUB_RENAME_FAIL=1; then
  r=$(grep -n 'RENAME TO flowmate_prev_' "$work/renamefail.log" | head -1 | cut -d: -f1 || true)
  e=$(grep -n -- '-c ALTER DATABASE flowmate WITH ALLOW_CONNECTIONS true' "$work/renamefail.log" | head -1 | cut -d: -f1 || true)
  [ -n "$r" ] && [ -n "$e" ] && [ "$e" -gt "$r" ] && ok "rename failure: live ALLOW_CONNECTIONS true restored" || bad "rename failure: live not re-enabled"
fi
if run reenablefail 1 "$CONFIRM" STUB_RENAME_FAIL=1 STUB_REENABLE_FAIL=1; then
  says reenablefail 're-enable FAILED' && says reenablefail 'alert:' && ok "re-enable failure: loud + alert attempted" || bad "re-enable failure swallowed"
fi
if ! grep -l 'DROP DATABASE' "$work"/*.log >/dev/null 2>&1; then ok "no scenario issued DROP DATABASE"; else bad "DROP DATABASE issued"; fi

echo "$pass passed, $fail failed ($n runs)"
[ "$fail" -eq 0 ]
