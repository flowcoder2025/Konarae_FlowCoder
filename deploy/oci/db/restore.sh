#!/usr/bin/env bash
# Restore a pg_dump -Fc archive as database `flowmate`, through a staging database.
#
#   restore.sh <dump>                                   # validate + stage; swap only if live is empty/missing
#   FLOWMATE_CONFIRM_SWAP=flowmate restore.sh <dump>    # ... and replace a non-empty live database
#
# 1. Validate (no database is touched): <dump>.sha256 must exist and match; `pg_restore -l`
#    must read the archive; free disk >= 10 x dump size + 1 GiB.
# 2. Stage into flowmate_restore_<YYYYmmdd_HHMMSS> (owner flowmate_owner, ICU en-US):
#    CREATE EXTENSION vector (as postgres), pg_restore -n public --no-owner --no-acl
#    --role=flowmate_owner --single-transaction --exit-on-error, roles.sql (grants and the
#    pgbouncer auth function live inside the db), privileges-check.sql, ANALYZE, and when
#    <dump>.counts.tsv exists (backup.sh dumps) exact row counts must equal it.
#    -n public restores only schema public, so a Supabase `-n public` dump and a whole-db
#    backup.sh dump both work (extension / pgbouncer schema entries are skipped).
# 3. Swap, only after 1 and 2 passed:
#    - live `flowmate` missing, or no relations in public (first restore): no confirmation.
#    - otherwise FLOWMATE_CONFIRM_SWAP=flowmate is required. Without it the script stops after
#      staging, leaves the staging db for inspection and prints what it would do.
#    - with it: fresh backup.sh of the live db, ALLOW_CONNECTIONS false on the live db,
#      terminate its sessions, then in ONE transaction: flowmate -> flowmate_prev_<ts>,
#      staging -> flowmate. PgBouncer reconnects by name (a few seconds of errors).
#    The previous database is NEVER dropped here; it stays as flowmate_prev_<ts> with
#    ALLOW_CONNECTIONS false. Drop it by hand once the new one is verified.
#
# Test: tests/restore-guard.test.sh (stub docker; proves nothing touches the live db unconfirmed).
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 PYTHONUTF8=1 PYTHONIOENCODING=utf-8
set -Eeuo pipefail
umask 077
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=common.sh
. "$SCRIPT_DIR/common.sh"

BACKUP_CMD=${FLOWMATE_BACKUP_CMD:-$SCRIPT_DIR/backup.sh}
LIVE_DB=flowmate

usage() { echo "usage: [FLOWMATE_CONFIRM_SWAP=flowmate] $0 <dump-file>" >&2; exit 2; }
[ $# -eq 1 ] || usage
case "$1" in -*) usage ;; esac
dump=$1

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
    # The rename transaction failed or was interrupted: let clients back into the live db.
    log "swap did not complete -> re-enabling connections to $LIVE_DB"
    db_psql -d postgres -c "ALTER DATABASE $LIVE_DB WITH ALLOW_CONNECTIONS true" >/dev/null 2>&1 || true
  fi
  if [ "$rc" != 0 ] && [ "$staging_created" = 1 ]; then
    log "staging database $staging was left for inspection (drop it by hand: DROP DATABASE $staging)"
  fi
}
trap on_exit EXIT

# --- 1. validate ------------------------------------------------------------------------
[ -f "$dump" ] && [ -r "$dump" ] || die "cannot read $dump"
[ -f "$dump.sha256" ] || die "missing $dump.sha256 (write it next to the dump: sha256sum <dump> > <dump>.sha256)"
(cd "$(dirname -- "$dump")" && sha256sum -c --quiet "$(basename -- "$dump").sha256") ||
  die "sha256 mismatch for $dump"

dump_kb=$(( ($(stat -c %s "$dump") + 1023) / 1024 ))
need_kb=${FLOWMATE_RESTORE_MIN_FREE_KB:-$(( dump_kb * 10 + 1024 * 1024 ))}
free_kb=$(df -P "$FLOWMATE_DB_HOME" | awk 'NR == 2 {print $4}')
[ "$free_kb" -ge "$need_kb" ] || die "not enough free disk: ${free_kb} KB free, need ${need_kb} KB"

container_running "$DB_CONTAINER" || die "$DB_CONTAINER is not running"
wait_db_healthy
[ "$(db_psql -d postgres -At -c "/* roles_present */ SELECT count(*) FROM pg_roles WHERE rolname IN ('flowmate_owner','flowmate_app','pgbouncer_auth')")" = 3 ] ||
  die "roles missing: run install.sh first"

log "validating archive $(basename -- "$dump") ($(du -h "$dump" | cut -f1))"
docker cp "$dump" "$DB_CONTAINER:$in_container" >/dev/null
docker exec -u root "$DB_CONTAINER" sh -c "chown postgres:postgres '$in_container' && chmod 600 '$in_container'"
toc_entries=$(docker exec -u postgres "$DB_CONTAINER" pg_restore -l "$in_container" | grep -c '^[0-9]' || true)
[ "$toc_entries" -gt 0 ] || die "pg_restore -l could not read the archive"

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

counts=$(docker exec -i -u postgres "$DB_CONTAINER" psql -X -q -At -F $'\t' -v ON_ERROR_STOP=1 -d "$staging" -f - \
  <"$FLOWMATE_SQL_DIR/row-counts.sql")
tables=$(printf '%s\n' "$counts" | grep -c . || true)
if [ -f "$dump.counts.tsv" ]; then
  if ! diff_out=$(diff "$dump.counts.tsv" <(printf '%s\n' "$counts")); then
    printf '%s\n' "$diff_out" | head -n 40 >&2
    die "row counts in $staging differ from $(basename -- "$dump").counts.tsv"
  fi
  log "row counts match the manifest ($tables tables)"
else
  log "no $(basename -- "$dump").counts.tsv: row counts not checked here (use scripts/db/compare-row-counts.ts)"
fi
log "staging ready in $(($(date +%s) - started))s: $staging, $tables tables in public"

# --- 3. swap -------------------------------------------------------------------------------
live_exists=$(db_psql -d postgres -At -c "/* live_exists */ SELECT count(*) FROM pg_database WHERE datname = '$LIVE_DB'")
live_rels=0
if [ "$live_exists" = 1 ]; then
  live_rels=$(db_psql -d "$LIVE_DB" -At -c "/* live_relations */ SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','S','f')")
fi

if [ "$live_exists" = 1 ] && [ "$live_rels" != 0 ] && [ "${FLOWMATE_CONFIRM_SWAP:-}" != "$LIVE_DB" ]; then
  cat <<EOF
Staging database $staging is restored and verified. The live database was NOT touched.
Live '$LIVE_DB' has $live_rels relations in public, so replacing it needs confirmation.
Re-run with FLOWMATE_CONFIRM_SWAP=$LIVE_DB to:
  1. take a fresh backup of '$LIVE_DB' ($BACKUP_CMD)
  2. block new connections to '$LIVE_DB' and terminate its sessions
  3. rename '$LIVE_DB' -> 'flowmate_prev_<ts>' and a new staging db -> '$LIVE_DB' (one transaction)
The staging db $staging stays for inspection; drop it by hand when done:
  docker exec -u postgres $DB_CONTAINER psql -c 'DROP DATABASE $staging'
EOF
  exit 0
fi

if [ "$live_exists" = 1 ] && [ "$live_rels" != 0 ]; then
  log "pre-swap backup of $LIVE_DB"
  "$BACKUP_CMD" || die "pre-swap backup failed; live database untouched"
fi

log "swapping: $LIVE_DB -> $prev, $staging -> $LIVE_DB"
if [ "$live_exists" = 1 ]; then
  swap_started=1
  db_psql -d postgres -c "ALTER DATABASE $LIVE_DB WITH ALLOW_CONNECTIONS false"
  for _ in $(seq 1 30); do
    left=$(db_psql -d postgres -At -c "/* terminate_live */ SELECT count(pg_terminate_backend(pid)) FROM pg_stat_activity WHERE datname = '$LIVE_DB' AND pid <> pg_backend_pid()")
    [ "$left" = 0 ] && break
    sleep 1
  done
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
  db_psql -d postgres -c "ALTER DATABASE $staging RENAME TO $LIVE_DB"
fi
staging_created=0

check_privileges "$LIVE_DB" || die "privilege check failed after swap"
log "restore done: $LIVE_DB now holds $(basename -- "$dump") ($tables tables)"
printf '%s\n' "$counts"
