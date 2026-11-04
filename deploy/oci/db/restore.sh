#!/usr/bin/env bash
# Restore a pg_dump -Fc archive as database `flowmate`, through a staging database.
#
#   restore.sh [--manifest-exclude t1,t2] [--allow-missing-live-tables] [--require-checksums] <dump>
#   FLOWMATE_CONFIRM_SWAP=<dump basename> restore.sh ... <dump>   # replace a non-empty live db
#
# Required next to the dump: <dump>.sha256 and <dump>.counts.tsv (row-counts.sql output of
# the SOURCE at dump time; backup.sh writes one, the cutover writes one from Supabase).
#
# 1. Validate (no database is touched): sha256 matches; manifest present and well-formed;
#    `pg_restore -l` reads the archive and it has TABLE DATA entries (no schema-only dumps);
#    free disk >= 10 x dump size + 1 GiB.
# 2. Stage into flowmate_restore_<YYYYmmdd_HHMMSS> (owner flowmate_owner, ICU en-US):
#    CREATE EXTENSION vector (as postgres), pg_restore -n public --no-owner --no-acl
#    --role=flowmate_owner --single-transaction --exit-on-error, roles.sql (grants and the
#    pgbouncer auth function live inside the db), privileges-check.sql, ANALYZE. If
#    <dump>.checksums.tsv exists, every table's content checksum must match it too;
#    --require-checksums (used by the cutover) makes a missing checksums file an error, and a
#    skipped content gate is always logged as a WARNING.
# 3. Verify staging: > 0 tables; exact row counts == manifest, except tables listed in
#    --manifest-exclude, which must exist with 0 rows (e.g. document_embeddings, whose data is
#    deliberately not migrated); when the live db is non-empty, every live table must exist in
#    staging (override: --allow-missing-live-tables).
# 4. Swap, only after 1-3 passed:
#    - live `flowmate` missing or without relations in public (first restore): no confirmation.
#    - otherwise FLOWMATE_CONFIRM_SWAP must equal the dump's basename (printed by the
#      unconfirmed run). Without it the script stops, leaves staging for inspection, prints the plan.
#    - confirmed: fresh backup.sh of the live db; ALLOW_CONNECTIONS false + terminate sessions on
#      staging AND live; one transaction: flowmate -> flowmate_prev_<ts>, staging -> flowmate,
#      ALLOW_CONNECTIONS true on the new flowmate. PgBouncer reconnects by name (~4 s of errors).
#    - if the transaction fails, connections to the live db are re-enabled; if THAT fails a
#      Telegram alert is sent (manual fix: ALTER DATABASE flowmate WITH ALLOW_CONNECTIONS true).
#    The previous database is NEVER dropped here (flowmate_prev_<ts>, connections disabled).
#
# Test: tests/restore-guard.test.sh (stub docker). FLOWMATE_BACKUP_CMD is honoured only with
# FLOWMATE_TEST_MODE=1.
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 PYTHONUTF8=1 PYTHONIOENCODING=utf-8
set -Eeuo pipefail
umask 077
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=common.sh
. "$SCRIPT_DIR/common.sh"

LIVE_DB=flowmate
BACKUP_CMD=$SCRIPT_DIR/backup.sh
if [ -n "${FLOWMATE_BACKUP_CMD:-}" ]; then
  [ "${FLOWMATE_TEST_MODE:-0}" = 1 ] || die "FLOWMATE_BACKUP_CMD is only honoured with FLOWMATE_TEST_MODE=1"
  BACKUP_CMD=$FLOWMATE_BACKUP_CMD
fi

usage() {
  echo "usage: [FLOWMATE_CONFIRM_SWAP=<dump basename>] $0 [--manifest-exclude t1,t2] [--allow-missing-live-tables] [--require-checksums] <dump>" >&2
  exit 2
}
exclude_csv=""
allow_missing_live=0
require_checksums=0
dump=""
while [ $# -gt 0 ]; do
  case "$1" in
    --manifest-exclude) [ $# -ge 2 ] || usage; exclude_csv=$2; shift 2 ;;
    --manifest-exclude=*) exclude_csv=${1#*=}; shift ;;
    --allow-missing-live-tables) allow_missing_live=1; shift ;;
    --require-checksums) require_checksums=1; shift ;;
    -*) usage ;;
    *) [ -z "$dump" ] || usage; dump=$1; shift ;;
  esac
done
[ -n "$dump" ] || usage
excluded=()
if [ -n "$exclude_csv" ]; then
  IFS=, read -r -a excluded <<<"$exclude_csv"
  for t in "${excluded[@]}"; do [[ $t =~ ^[A-Za-z_][A-Za-z0-9_]{0,62}$ ]] || die "invalid --manifest-exclude table name"; done
fi
dump_name=$(basename -- "$dump")

exec 8>"$FLOWMATE_DB_HOME/.admin.lock"
flock -n 8 || die "another install.sh/restore.sh is running"

ts=$(date -u +%Y%m%d_%H%M%S)
staging="flowmate_restore_$ts"
prev="flowmate_prev_$ts"
in_container="/tmp/$staging.dump"
staging_created=0
swap_started=0

on_exit() {
  local rc=$?
  docker exec -u root "$DB_CONTAINER" rm -f "$in_container" >/dev/null 2>&1 || true
  if [ "$swap_started" = 1 ]; then
    log "swap did not complete -> re-enabling connections to $LIVE_DB"
    if ! db_psql -d postgres -c "ALTER DATABASE $LIVE_DB WITH ALLOW_CONNECTIONS true" >/dev/null 2>&1; then
      log "ERROR: re-enable FAILED: $LIVE_DB may still refuse connections. Fix by hand: docker exec -u postgres $DB_CONTAINER psql -c 'ALTER DATABASE $LIVE_DB WITH ALLOW_CONNECTIONS true'"
      alert "[FlowMate DB] restore swap failed on $(hostname -s) AND re-enabling connections to $LIVE_DB failed. Run: ALTER DATABASE $LIVE_DB WITH ALLOW_CONNECTIONS true"
    fi
  fi
  if [ "$rc" != 0 ] && [ "$staging_created" = 1 ]; then
    log "staging database $staging was left for inspection (drop it by hand: DROP DATABASE $staging)"
  fi
}
trap on_exit EXIT

# --- 1. validate (no database touched) --------------------------------------------------
[ -f "$dump" ] && [ -r "$dump" ] || die "cannot read $dump"
[ -f "$dump.sha256" ] || die "missing $dump.sha256 (sha256sum <dump> > <dump>.sha256)"
(cd "$(dirname -- "$dump")" && sha256sum -c --quiet "$dump_name.sha256") || die "sha256 mismatch for $dump"
manifest="$dump.counts.tsv"
[ -f "$manifest" ] || die "missing manifest $manifest (row-counts.sql output of the source at dump time)"
manifest_re=$'^[^\t]+\t[0-9]+$'
manifest_lines=0
while IFS= read -r line; do
  [[ $line =~ $manifest_re ]] || die "malformed manifest line in $dump_name.counts.tsv"
  manifest_lines=$((manifest_lines + 1))
done <"$manifest"
[ "$manifest_lines" -gt 0 ] || die "manifest $(basename -- "$manifest") is empty"
if [ "$require_checksums" = 1 ] && [ ! -s "$dump.checksums.tsv" ]; then
  die "--require-checksums: missing $dump_name.checksums.tsv (table-checksums.sql of the source at dump time)"
fi

dump_kb=$(( ($(stat -c %s "$dump") + 1023) / 1024 ))
need_kb=${FLOWMATE_RESTORE_MIN_FREE_KB:-$(( dump_kb * 10 + 1024 * 1024 ))}
free_kb=$(df -P "$FLOWMATE_DB_HOME" | awk 'NR == 2 {print $4}')
[ "$free_kb" -ge "$need_kb" ] || die "not enough free disk: ${free_kb} KB free, need ${need_kb} KB"

container_running "$DB_CONTAINER" || die "$DB_CONTAINER is not running"
wait_db_healthy
[ "$(db_psql -d postgres -At -c "/* roles_present */ SELECT count(*) FROM pg_roles WHERE rolname IN ('flowmate_owner','flowmate_app','pgbouncer_auth')")" = 3 ] ||
  die "roles missing: run install.sh first"

leftovers=$(db_psql -d postgres -At -F ' ' -c "/* existing_restore_dbs */ SELECT datname, pg_size_pretty(pg_database_size(oid)), CASE WHEN datallowconn THEN 'connections-on' ELSE 'connections-off' END FROM pg_database WHERE datname ~ '^flowmate_(restore|prev)_' ORDER BY 1")
if [ -n "$leftovers" ]; then
  log "existing staging/previous databases (not touched; drop by hand after review):"
  while IFS= read -r l; do printf '  %s\n' "$l" >&2; done <<<"$leftovers"
fi

log "validating archive $dump_name ($(du -h "$dump" | cut -f1))"
docker cp "$dump" "$DB_CONTAINER:$in_container" >/dev/null
docker exec -u root "$DB_CONTAINER" sh -c "chown postgres:postgres '$in_container' && chmod 600 '$in_container'"
toc=$(docker exec -u postgres "$DB_CONTAINER" pg_restore -l "$in_container") || die "pg_restore -l could not read the archive"
toc_data=$(grep -cE '^[0-9]+; [0-9]+ [0-9]+ TABLE DATA ' <<<"$toc" || true)
[ "$toc_data" -gt 0 ] || die "archive has no TABLE DATA entries (schema-only dump?)"

# --- 2. stage ----------------------------------------------------------------------------
started=$(date +%s)
log "creating staging database $staging"
db_psql -d postgres -c "CREATE DATABASE $staging OWNER flowmate_owner TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER icu ICU_LOCALE 'en-US' LOCALE 'en_US.UTF-8'"
staging_created=1
db_psql -d "$staging" -c "CREATE EXTENSION IF NOT EXISTS vector SCHEMA public"

log "pg_restore into $staging (schema public, single transaction)"
docker exec -u postgres "$DB_CONTAINER" pg_restore \
  -d "$staging" -n public \
  --no-owner --no-acl --role=flowmate_owner \
  --single-transaction --exit-on-error \
  "$in_container"

log "roles.sql + privilege check in $staging"
apply_roles "$staging"
check_privileges "$staging" || die "privilege check failed in $staging"
db_psql -d "$staging" -c "ANALYZE"

# --- 3. verify staging ---------------------------------------------------------------------
counts=$(docker exec -i -u postgres "$DB_CONTAINER" psql -X -q -At -F $'\t' -v ON_ERROR_STOP=1 -d "$staging" -f - \
  <"$FLOWMATE_SQL_DIR/row-counts.sql")
tables=$(grep -c . <<<"$counts" || true)
[ "$tables" -gt 0 ] || die "staging $staging has no tables in public"

is_excluded() { local t; for t in "${excluded[@]}"; do [ "$t" = "$1" ] && return 0; done; return 1; }
filter_excluded() { local name rest; while IFS=$'\t' read -r name rest; do [ -n "$name" ] && ! is_excluded "$name" && printf '%s\t%s\n' "$name" "$rest"; done; return 0; }
if ! diff_out=$(diff <(filter_excluded <"$manifest") <(filter_excluded <<<"$counts")); then
  printf '%s\n' "$diff_out" | head -n 40 >&2
  die "row counts in $staging differ from $(basename -- "$manifest") (< manifest, > staging)"
fi
for t in "${excluded[@]}"; do
  n=$(awk -F'\t' -v t="$t" '$1 == t {print $2}' <<<"$counts")
  [ "$n" = 0 ] || die "excluded table $t must exist in $staging with 0 rows (found: ${n:-missing})"
done
log "row counts match the manifest ($tables tables${exclude_csv:+, excluded: $exclude_csv})"

# Content gate: when <dump>.checksums.tsv (table-checksums.sql on the SOURCE at dump time) exists,
# every non-excluded table's content hash must match too (catches what counts cannot).
if [ -f "$dump.checksums.tsv" ]; then
  sums=$(docker exec -i -u postgres "$DB_CONTAINER" psql -X -q -At -F $'\t' -v ON_ERROR_STOP=1 -d "$staging" -f - \
    <"$FLOWMATE_SQL_DIR/table-checksums.sql")
  if ! diff_out=$(diff <(filter_excluded <"$dump.checksums.tsv") <(filter_excluded <<<"$sums")); then
    printf '%s\n' "$diff_out" | cut -f1 | sed -nE 's/^[<>] /  /p' | sort -u >&2
    die "table content checksums in $staging differ from $(basename -- "$dump").checksums.tsv (tables above)"
  fi
  log "table content checksums match ($(grep -c . <<<"$sums") tables${exclude_csv:+, excluded: $exclude_csv})"
else
  log "WARNING: content checksum gate SKIPPED: no $dump_name.checksums.tsv (only row counts were verified; the cutover uses --require-checksums)"
fi

live_exists=$(db_psql -d postgres -At -c "/* live_exists */ SELECT count(*) FROM pg_database WHERE datname = '$LIVE_DB'")
live_rels=0
if [ "$live_exists" = 1 ]; then
  live_rels=$(db_psql -d "$LIVE_DB" -At -c "/* live_relations */ SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','S','f')")
fi
if [ "$live_exists" = 1 ] && [ "$live_rels" != 0 ]; then
  live_tables=$(db_psql -d "$LIVE_DB" -At -c "/* live_tables */ SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND NOT c.relispartition ORDER BY 1")
  missing=$(comm -23 <(sort <<<"$live_tables" | grep .) <(cut -f1 <<<"$counts" | sort) | tr '\n' ' ' || true)
  if [ -n "${missing// /}" ]; then
    [ "$allow_missing_live" = 1 ] || die "staging lacks live tables: $missing(pass --allow-missing-live-tables if intended)"
    log "WARNING: staging lacks live tables (allowed by flag): $missing"
  fi
fi
log "staging verified in $(($(date +%s) - started))s: $staging, $tables tables in public"

# --- 4. swap -------------------------------------------------------------------------------
if [ "$live_exists" = 1 ] && [ "$live_rels" != 0 ] && [ "${FLOWMATE_CONFIRM_SWAP:-}" != "$dump_name" ]; then
  cat <<EOF
Staging database $staging is restored and verified. The live database was NOT touched.
Live '$LIVE_DB' has $live_rels relations in public, so replacing it needs confirmation:
  FLOWMATE_CONFIRM_SWAP=$dump_name $0${exclude_csv:+ --manifest-exclude $exclude_csv}$([ "$allow_missing_live" = 1 ] && printf ' --allow-missing-live-tables') $dump
That run builds and verifies a fresh staging db, then:
  1. takes a fresh backup of '$LIVE_DB' ($BACKUP_CMD)
  2. blocks new connections to staging and '$LIVE_DB' and terminates their sessions
  3. renames '$LIVE_DB' -> 'flowmate_prev_<ts>' and staging -> '$LIVE_DB' (one transaction)
The staging db $staging stays for inspection; drop it by hand when done:
  docker exec -u postgres $DB_CONTAINER psql -c 'DROP DATABASE $staging'
EOF
  exit 0
fi

if [ "$live_exists" = 1 ] && [ "$live_rels" != 0 ]; then
  log "pre-swap backup of $LIVE_DB"
  "$BACKUP_CMD" || die "pre-swap backup failed; live database untouched"
fi

fence_db() { # DB TAG: block new connections and terminate existing sessions
  # On failure the db gets its connections back before dying (live: also via on_exit).
  local db=$1 tag=$2 left=""
  db_psql -d postgres -c "ALTER DATABASE $db WITH ALLOW_CONNECTIONS false"
  for _ in $(seq 1 "${FLOWMATE_FENCE_WAIT_SECONDS:-30}"); do
    left=$(db_psql -d postgres -At -c "/* $tag */ SELECT count(pg_terminate_backend(pid)) FROM pg_stat_activity WHERE datname = '$db' AND pid <> pg_backend_pid()")
    [ "$left" = 0 ] && return 0
    sleep 1
  done
  db_psql -d postgres -c "ALTER DATABASE $db WITH ALLOW_CONNECTIONS true" >/dev/null 2>&1 ||
    log "ERROR: could not re-enable connections to $db (fix: ALTER DATABASE $db WITH ALLOW_CONNECTIONS true)"
  die "sessions on $db did not terminate within ${FLOWMATE_FENCE_WAIT_SECONDS:-30} s; connections to $db re-enabled, nothing swapped"
}

log "swapping: $LIVE_DB -> $prev, $staging -> $LIVE_DB"
fence_db "$staging" terminate_staging
if [ "$live_exists" = 1 ]; then
  swap_started=1
  fence_db "$LIVE_DB" terminate_live
  db_psql -d postgres -f - <<EOF
BEGIN;
ALTER DATABASE $LIVE_DB RENAME TO $prev;
ALTER DATABASE $staging RENAME TO $LIVE_DB;
ALTER DATABASE $LIVE_DB WITH ALLOW_CONNECTIONS true;
COMMIT;
EOF
  swap_started=0
  log "previous database kept as $prev (ALLOW_CONNECTIONS false; never dropped by this script)"
else
  db_psql -d postgres -f - <<EOF
BEGIN;
ALTER DATABASE $staging RENAME TO $LIVE_DB;
ALTER DATABASE $LIVE_DB WITH ALLOW_CONNECTIONS true;
COMMIT;
EOF
fi
staging_created=0

check_privileges "$LIVE_DB" || die "privilege check failed after swap"
log "restore done: $LIVE_DB now holds $dump_name ($tables tables)"
printf '%s\n' "$counts"
