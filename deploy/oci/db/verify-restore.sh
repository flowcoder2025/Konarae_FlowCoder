#!/usr/bin/env bash
# Prove a backup restores: throwaway container -> pg_restore -> row counts == manifest.
#
#   verify-restore.sh <dump>      # needs <dump>.counts.tsv (written by backup.sh)
#   verify-restore.sh --latest    # newest dump in ~/backup/flowmate-db (monthly cron)
#
# The container uses the running flowmate-db image and initdb args, has no network
# (--network none) and no published ports. Its own volumes are recorded right after start;
# cleanup is `docker rm -f -v` and must provably remove the container AND exactly those
# volumes (the restored data contains member PII). A cleanup failure is alerted and logged
# separately from the restore result (exit 3).
# Counts are compared with the manifest produced by the same row-counts.sql (the
# plan's compare-row-counts.ts can't run on OCI: no node_modules there).
# Appends one line to ~/backup/flowmate-db/verify.log. Exit 0 only on exact match.
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 PYTHONUTF8=1 PYTHONIOENCODING=utf-8
set -Eeuo pipefail
umask 077
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=common.sh
. "$SCRIPT_DIR/common.sh"

VERIFY_LOG="$FLOWMATE_BACKUP_DIR/verify.log"
dump_label="?"
# Best effort: a failing verify.log write must never stop the alert.
record() {
  { printf '%s %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2" >>"$VERIFY_LOG"; } 2>/dev/null ||
    log "could not write $VERIFY_LOG"
}
fail() {
  trap - ERR
  set +e
  log "verify-restore FAILED: $1"
  alert "[FlowMate DB] restore verification failed on $(hostname -s) for $dump_label: $1"
  record FAIL "$dump_label $1"
  exit 1
}
trap 'fail "unexpected error at line $LINENO"' ERR

[ $# -eq 1 ] || { echo "usage: $0 <dump> | --latest" >&2; exit 2; }
install -d -m 700 "$FLOWMATE_BACKUP_DIR"
if [ "$1" = "--latest" ]; then
  dump=$(find "$FLOWMATE_BACKUP_DIR" -maxdepth 1 -type f -name 'flowmate-db-*.dump' | sort | tail -n 1)
  [ -n "$dump" ] || fail "no dumps in $FLOWMATE_BACKUP_DIR"
else
  dump=$1
fi
dump_label=$(basename -- "$dump")
manifest="$dump.counts.tsv"
[ -r "$dump" ] || fail "cannot read dump"
[ -r "$manifest" ] || fail "missing manifest $(basename -- "$manifest")"
if [ -r "$dump.sha256" ]; then
  (cd "$(dirname -- "$dump")" && sha256sum -c --quiet "$dump_label.sha256" >/dev/null) || fail "sha256 mismatch"
fi

image=$(db_image) || fail "cannot read image of $DB_CONTAINER"
initdb_args=$(db_initdb_args)
[ -n "$initdb_args" ] || fail "cannot read POSTGRES_INITDB_ARGS of $DB_CONTAINER"

started=$(date +%s)
cname="flowmate-verify-$(date -u +%Y%m%dT%H%M%SZ)-$$"
tmp_counts=$(mktemp)
own_volumes=""
cleaned=0
# remove_container: rm -f -v, then prove the container and its recorded volumes are gone.
remove_container() {
  local v leftover=""
  docker rm -f -v "$cname" >/dev/null 2>&1 || leftover="container rm failed"
  if docker container inspect "$cname" >/dev/null 2>&1; then leftover="$leftover container $cname still exists"; fi
  for v in $own_volumes; do
    if docker volume inspect "$v" >/dev/null 2>&1; then leftover="$leftover volume $v still exists"; fi
  done
  cleaned=1
  if [ -n "$leftover" ]; then
    log "CLEANUP FAILED:$leftover (restored PII may remain on disk: docker rm -f -v $cname; docker volume rm <volume>)"
    alert "[FlowMate DB] verify-restore cleanup failed on $(hostname -s):$leftover. Restored member data may remain on disk."
    record CLEANUP-FAIL "$dump_label$leftover"
    return 1
  fi
  return 0
}
cleanup() {
  # EXIT trap: never trigger the ERR trap from here (the exit status is already decided).
  trap - ERR
  set +e
  if [ "$cleaned" = 0 ] && docker container inspect "$cname" >/dev/null 2>&1; then remove_container; fi
  rm -f -- "$tmp_counts"
}
trap cleanup EXIT

# Throwaway superuser password (container has no network; never printed).
POSTGRES_PASSWORD=$(openssl rand -hex 24) \
  docker run -d --name "$cname" --network none --memory 1g --shm-size 256m \
  -e POSTGRES_PASSWORD -e POSTGRES_DB=flowmate -e POSTGRES_INITDB_ARGS="$initdb_args" \
  "$image" >/dev/null || fail "could not start throwaway container"

own_volumes=$(docker container inspect -f '{{range .Mounts}}{{if .Name}}{{.Name}} {{end}}{{end}}' "$cname")
[ -n "$own_volumes" ] || fail "could not record the throwaway container's volumes"
ready=0
for _ in $(seq 1 90); do
  if docker logs "$cname" 2>&1 | grep -q 'PostgreSQL init process complete' &&
    docker exec "$cname" pg_isready -q -h /var/run/postgresql -U postgres -d flowmate; then
    ready=1
    break
  fi
  [ "$(docker container inspect -f '{{.State.Running}}' "$cname" 2>/dev/null)" = "true" ] || fail "throwaway container exited"
  sleep 2
done
[ "$ready" = 1 ] || fail "throwaway postgres not ready"

docker cp "$dump" "$cname:/tmp/verify.dump" >/dev/null
docker exec -u root "$cname" chown postgres:postgres /tmp/verify.dump
docker exec -u postgres "$cname" pg_restore -d flowmate --no-owner --no-acl \
  --single-transaction --exit-on-error /tmp/verify.dump || fail "pg_restore failed"

docker exec -i -u postgres "$cname" psql -X -q -At -F $'\t' -v ON_ERROR_STOP=1 -d flowmate -f - \
  <"$SCRIPT_DIR/row-counts.sql" >"$tmp_counts" || fail "row count query failed"

tables=$(grep -c . "$manifest" || true)
rows=$(awk -F'\t' '{s += $2} END {print s + 0}' "$manifest")
if ! diff_out=$(diff "$manifest" "$tmp_counts"); then
  log "row-count diff (manifest < > restored):"
  printf '%s\n' "$diff_out" | head -n 40 >&2
  fail "row counts differ ($(printf '%s\n' "$diff_out" | grep -c '^[<>]') lines)"
fi

record OK "$dump_label tables=$tables rows=$rows duration=$(($(date +%s) - started))s"
log "verify-restore ok: $dump_label tables=$tables rows=$rows"
remove_container || exit 3
log "cleanup ok: removed $cname and its volume(s) $own_volumes"
