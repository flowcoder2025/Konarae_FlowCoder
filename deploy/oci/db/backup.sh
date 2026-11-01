#!/usr/bin/env bash
# Daily logical backup of database flowmate (cron 04:00 KST, see install.sh).
#
# Output set in ~/backup/flowmate-db/ (dir 700, files 600):
#   flowmate-db-<UTC stamp>.dump              pg_dump -Fc of the whole database
#   flowmate-db-<UTC stamp>.dump.counts.tsv   row-counts.sql output, same snapshot
#   flowmate-db-<UTC stamp>.dump.sha256       written last = set complete
#
# Consistency: a REPEATABLE READ session exports its snapshot and stays open; the
# row counts run inside that session and pg_dump imports it with --snapshot.
# flock prevents overlap; newest $FLOWMATE_BACKUP_KEEP (7) sets are kept.
# Any failure -> Telegram alert (no secrets in the message) + exit 1.
#
# Test hook: FLOWMATE_BACKUP_DB=<name> backs up another database (alert-path test).
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 PYTHONUTF8=1 PYTHONIOENCODING=utf-8
set -Eeuo pipefail
umask 077
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=common.sh
. "$SCRIPT_DIR/common.sh"

DB_NAME=${FLOWMATE_BACKUP_DB:-flowmate}
KEEP=${FLOWMATE_BACKUP_KEEP:-7}
DIR=$FLOWMATE_BACKUP_DIR

fail() {
  trap - ERR
  log "backup FAILED: $1"
  alert "[FlowMate DB] backup failed on $(hostname -s) (db=$DB_NAME): $1"
  exit 1
}
trap 'fail "unexpected error at line $LINENO"' ERR
trap '' PIPE   # a dead psql coprocess must surface as a write error, not kill the script

[[ $DB_NAME =~ ^[a-z_][a-z0-9_]*$ ]] || fail "invalid database name"
[[ $KEEP =~ ^[1-9][0-9]*$ ]] || fail "invalid FLOWMATE_BACKUP_KEEP"
install -d -m 700 "$DIR"
chmod 700 "$DIR"
exec 9>"$DIR/.backup.lock"
flock -n 9 || fail "another backup is still running"
container_running "$DB_CONTAINER" || fail "$DB_CONTAINER is not running"

started=$(date +%s)
stamp=$(date -u +%Y%m%dT%H%M%SZ)
name="flowmate-db-$stamp.dump"
final="$DIR/$name"
tmp_dump="$DIR/.$name.tmp"
tmp_counts="$DIR/.$name.counts.tsv.tmp"
tmp_sum="$DIR/.$name.sha256.tmp"
snap_pid=""
cleanup() {
  if [ -n "$snap_pid" ]; then kill "$snap_pid" 2>/dev/null || true; fi
  rm -f -- "$tmp_dump" "$tmp_counts" "$tmp_sum"
}
trap cleanup EXIT

# --- 1. snapshot-holding session ---------------------------------------------------
coproc SNAP {
  exec docker exec -i -u postgres "$DB_CONTAINER" \
    psql -X -q -At -F $'\t' -v ON_ERROR_STOP=1 -d "$DB_NAME" 2>&1
}
# shellcheck disable=SC2153  # SNAP_PID is set by coproc
snap_pid=$SNAP_PID
snap_in=${SNAP[1]}
snap_out=${SNAP[0]}

printf '%s\n' \
  "SET idle_in_transaction_session_timeout = 0;" \
  "BEGIN ISOLATION LEVEL REPEATABLE READ, READ ONLY;" \
  "SELECT pg_export_snapshot();" >&"$snap_in" || fail "snapshot session not writable"
snapshot=""
IFS= read -r -t 60 snapshot <&"$snap_out" || true
[[ $snapshot =~ ^[0-9A-F]{8}-[0-9A-F]{8}-[0-9]+$ ]] ||
  fail "could not export snapshot: ${snapshot:0:200}"

# --- 2. row counts inside the same snapshot ---------------------------------------
{ cat "$SCRIPT_DIR/row-counts.sql"; printf '\n\\echo __ROWCOUNTS_END__\n'; } >&"$snap_in" ||
  fail "snapshot session closed"
line_re=$'^[^\t]+\t[0-9]+$'
got_end=0
: >"$tmp_counts"
while IFS= read -r -t 600 line <&"$snap_out"; do
  if [ "$line" = "__ROWCOUNTS_END__" ]; then got_end=1; break; fi
  [[ $line =~ $line_re ]] || fail "unexpected row-count output: ${line:0:200}"
  printf '%s\n' "$line" >>"$tmp_counts"
done
[ "$got_end" = 1 ] || fail "row-count query did not finish"
tables=$(grep -c . "$tmp_counts" || true)
[ "$tables" -gt 0 ] || fail "no tables counted"

# --- 3. dump with the exported snapshot --------------------------------------------
docker exec -u postgres "$DB_CONTAINER" pg_dump -Fc --snapshot="$snapshot" -d "$DB_NAME" >"$tmp_dump" ||
  fail "pg_dump failed"

# --- 4. release the snapshot ---------------------------------------------------------
printf 'COMMIT;\n\\q\n' >&"$snap_in" || true
wait "$snap_pid" || fail "snapshot session exited with an error"
snap_pid=""

# --- 5. sanity: archive readable, one TABLE DATA entry per counted table ------------
[ -s "$tmp_dump" ] || fail "empty dump"
toc_tables=$(docker exec -i -u postgres "$DB_CONTAINER" pg_restore -l <"$tmp_dump" |
  grep -cE '^[0-9]+; [0-9]+ [0-9]+ TABLE DATA public ' || true)
[ "$toc_tables" = "$tables" ] || fail "dump has $toc_tables TABLE DATA entries, manifest has $tables tables"

hash=$(sha256sum "$tmp_dump" | cut -d' ' -f1)
printf '%s  %s\n' "$hash" "$name" >"$tmp_sum"

# --- 6. publish atomically (sha256 last = complete set) ------------------------------
chmod 600 "$tmp_dump" "$tmp_counts" "$tmp_sum"
mv -f -- "$tmp_dump" "$final"
mv -f -- "$tmp_counts" "$final.counts.tsv"
mv -f -- "$tmp_sum" "$final.sha256"

# --- 7. retention ------------------------------------------------------------------------
mapfile -t sets < <(find "$DIR" -maxdepth 1 -type f -name 'flowmate-db-*.dump' -printf '%f\n' | sort -r)
for old in "${sets[@]:$KEEP}"; do
  rm -f -- "$DIR/$old" "$DIR/$old.counts.tsv" "$DIR/$old.sha256"
  log "pruned $old"
done

rows=$(awk -F'\t' '{s += $2} END {print s + 0}' "$final.counts.tsv")
log "backup ok: $name size=$(du -h "$final" | cut -f1) tables=$tables rows=$rows duration=$(($(date +%s) - started))s kept=$((${#sets[@]} < KEEP ? ${#sets[@]} : KEEP))"
