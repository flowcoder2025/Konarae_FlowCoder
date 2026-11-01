#!/usr/bin/env bash
# Restore a pg_dump -Fc archive into flowmate-db / database flowmate.
#
#   restore.sh <dump> [--recreate]
#
# - Only objects in schema public are restored (pg_restore -n public). That skips
#   CREATE SCHEMA public / extensions / the pgbouncer schema, so the same command
#   works for a Supabase `-n public` dump and for a whole-db dump from backup.sh.
# - Without --recreate the target database must have no relations in public.
#   --recreate drops it (WITH FORCE: kills pgbouncer/worker sessions) and recreates it.
# - Single transaction, --exit-on-error: all or nothing.
# - Objects are owned by flowmate_owner (--no-owner --role=flowmate_owner); grants
#   and the pgbouncer auth function come from roles.sql, re-applied afterwards.
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 PYTHONUTF8=1 PYTHONIOENCODING=utf-8
set -Eeuo pipefail
umask 077
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=common.sh
. "$SCRIPT_DIR/common.sh"

usage() { echo "usage: $0 <dump-file> [--recreate]" >&2; exit 2; }
dump=""
recreate=0
for arg in "$@"; do
  case "$arg" in
    --recreate) recreate=1 ;;
    -*) usage ;;
    *) [ -z "$dump" ] || usage; dump=$arg ;;
  esac
done
[ -n "$dump" ] || usage
[ -f "$dump" ] && [ -r "$dump" ] || die "cannot read $dump"
[ -f "$dump.sha256" ] && { (cd "$(dirname -- "$dump")" && sha256sum -c --quiet "$(basename -- "$dump").sha256") || die "sha256 mismatch for $dump"; }

container_running "$DB_CONTAINER" || die "$DB_CONTAINER is not running"
wait_db_healthy
[ "$(db_psql -d postgres -At -c "SELECT count(*) FROM pg_roles WHERE rolname IN ('flowmate_owner','flowmate_app','pgbouncer_auth')")" = 3 ] ||
  die "roles missing: run install.sh first"

started=$(date +%s)
in_container=/tmp/flowmate-restore.dump
cleanup() { docker exec -u root "$DB_CONTAINER" rm -f "$in_container" >/dev/null 2>&1 || true; }
trap cleanup EXIT

db_exists=$(db_psql -d postgres -At -c "SELECT count(*) FROM pg_database WHERE datname = 'flowmate'")
if [ "$db_exists" = 1 ]; then
  nrel=$(db_psql -d flowmate -At -c "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','S','f')")
  if [ "$recreate" = 1 ]; then
    log "dropping database flowmate WITH (FORCE) ($nrel relations in public)"
    db_psql -d postgres -c "DROP DATABASE flowmate WITH (FORCE)"
    db_exists=0
  elif [ "$nrel" != 0 ]; then
    die "database flowmate has $nrel relations in public; pass --recreate to drop and recreate it"
  fi
fi
if [ "$db_exists" != 1 ]; then
  log "creating database flowmate (owner flowmate_owner, ICU en-US)"
  db_psql -d postgres -c "CREATE DATABASE flowmate OWNER flowmate_owner TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER icu ICU_LOCALE 'en-US' LOCALE 'en_US.UTF-8'"
fi

# pgvector must exist before the tables that use it; dumps taken with -n public
# don't contain the extension. Created by postgres (owner of the extension).
db_psql -d flowmate -c "CREATE EXTENSION IF NOT EXISTS vector SCHEMA public"

log "copying $(basename -- "$dump") ($(du -h "$dump" | cut -f1)) into $DB_CONTAINER"
docker cp "$dump" "$DB_CONTAINER:$in_container" >/dev/null
docker exec -u root "$DB_CONTAINER" sh -c "chown postgres:postgres '$in_container' && chmod 600 '$in_container'"

log "pg_restore (schema public, single transaction)"
docker exec -u postgres "$DB_CONTAINER" pg_restore \
  -d flowmate -n public \
  --no-owner --no-acl --role=flowmate_owner \
  --single-transaction --exit-on-error \
  "$in_container"

log "re-applying roles.sql (grants, default privileges, auth function)"
apply_roles
db_psql -d flowmate -c "ANALYZE"

tables=$(db_psql -d flowmate -At -F $'\t' -f - <"$SCRIPT_DIR/row-counts.sql")
log "restore done in $(($(date +%s) - started))s: $(printf '%s\n' "$tables" | grep -c .) tables in public"
printf '%s\n' "$tables"
