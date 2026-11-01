#!/bin/bash
# Pull FlowMate DB backup sets from OCI to the portable drive (Mini, launchd 05:30 daily).
#
#   source: oci:backup/flowmate-db/   (backup.sh, 04:00 KST, keeps 7 sets)
#   dest:   /Volumes/포터블/Backups/FlowMate/daily/  (keeps newest 30 sets, dir 700, files 600)
#
# A set is <name>.dump + .dump.counts.tsv + .dump.sha256; every pulled dump is
# re-verified against its .sha256. Fails loudly (exit != 0, ERROR line in the log)
# when the volume is not mounted, rsync fails, a checksum does not match, or the newest
# dump is older than 36h. Nothing is pruned unless every check passed.
# On success it touches oci:backup/flowmate-db/.mini-pulled; backup.sh on OCI sends a
# Telegram alert when that marker is older than 48h, so a dead offsite job is noticed.
# Installed copy: ~/.local/bin/flowmate-db-pull-backups.sh (install-launchd.sh), so the
# job can still start and report when the portable volume is missing.
# launchd context needs a one-time macOS permission: System Settings > Privacy &
# Security > Full Disk Access: add /bin/bash (the job's program, the "responsible"
# process for TCC) and /usr/bin/rsync (the binary TCC denied in testing). Without it
# rsync fails with "Operation not permitted" (logged, exit != 0, no marker -> OCI alerts
# after 48h). Manual runs from a terminal use the terminal app's permission.
# macOS /bin/bash 3.2 compatible.
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 PYTHONUTF8=1 PYTHONIOENCODING=utf-8
set -euo pipefail
umask 077
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

VOLUME=${FLOWMATE_BACKUP_VOLUME:-/Volumes/포터블}
DEST=${FLOWMATE_BACKUP_DEST:-$VOLUME/Backups/FlowMate/daily}
REMOTE=${FLOWMATE_BACKUP_REMOTE:-oci:backup/flowmate-db/}
KEEP=${FLOWMATE_BACKUP_KEEP:-30}
MAX_AGE_HOURS=${FLOWMATE_BACKUP_MAX_AGE_HOURS:-36}
# Apple's /usr/bin/rsync (openrsync) on purpose: under launchd, macOS TCC blocks a
# Homebrew rsync from writing to a removable volume (it waits on a consent prompt
# forever); the platform binary is not blocked.
RSYNC=${FLOWMATE_RSYNC:-/usr/bin/rsync}
RSYNC_TIMEOUT=${FLOWMATE_RSYNC_TIMEOUT:-1800}

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }

case "$KEEP" in '' | *[!0-9]* | 0) die "invalid FLOWMATE_BACKUP_KEEP" ;; esac

# The volume must be a real mount, not a leftover directory on the internal disk.
[ -d "$VOLUME" ] || die "backup volume $VOLUME is not mounted"
[ "$(stat -f %d "$VOLUME")" != "$(stat -f %d /Volumes)" ] || die "$VOLUME is not a mounted volume"
mkdir -p "$DEST"
chmod 700 "$DEST"

started=$(date +%s)
# No -p: new files get umask 077 (600); the sweep below fixes anything else.
"$RSYNC" -rt --timeout=300 \
  -e "ssh -o BatchMode=yes -o ConnectTimeout=20" \
  --include='flowmate-db-*.dump' \
  --include='flowmate-db-*.dump.counts.tsv' \
  --include='flowmate-db-*.dump.sha256' \
  --include='verify.log' \
  --exclude='*' \
  "$REMOTE" "$DEST/" &
rsync_pid=$!
# Watchdog: a blocked rsync (e.g. a pending macOS permission prompt) must fail loudly.
(
  trap 'kill "$s" 2>/dev/null; exit 0' TERM
  sleep "$RSYNC_TIMEOUT" &
  s=$!
  wait "$s" && kill -TERM "$rsync_pid" 2>/dev/null
) &
watchdog_pid=$!
rc=0
wait "$rsync_pid" || rc=$?
kill "$watchdog_pid" 2>/dev/null || true
wait "$watchdog_pid" 2>/dev/null || true
[ "$rc" -eq 0 ] || die "rsync from $REMOTE failed (exit $rc)"

cd "$DEST"
find . -maxdepth 1 -type f ! -perm 600 -exec chmod 600 {} +

# Verify every set; newest first.
dumps=$(find . -maxdepth 1 -type f -name 'flowmate-db-*.dump' | sed 's|^\./||' | sort -r)
[ -n "$dumps" ] || die "no backup sets in $DEST after rsync"
bad=0
total=0
for d in $dumps; do
  total=$((total + 1))
  if [ ! -f "$d.sha256" ] || [ ! -f "$d.counts.tsv" ]; then
    log "ERROR: incomplete set $d" >&2
    bad=$((bad + 1))
  elif ! shasum -a 256 -c --status "$d.sha256"; then
    log "ERROR: checksum mismatch $d" >&2
    bad=$((bad + 1))
  fi
done
[ "$bad" -eq 0 ] || die "$bad of $total sets failed verification (nothing pruned)"

# Freshness: name carries the UTC timestamp, flowmate-db-YYYYmmddTHHMMSSZ.dump.
newest=$(printf '%s\n' "$dumps" | head -n 1)
stamp=${newest#flowmate-db-}
stamp=${stamp%.dump}
newest_epoch=$(date -j -u -f '%Y%m%dT%H%M%SZ' "$stamp" +%s 2>/dev/null) || die "cannot parse timestamp of $newest"
age_h=$((($(date +%s) - newest_epoch) / 3600))
[ "$age_h" -le "$MAX_AGE_HOURS" ] || die "newest backup $newest is ${age_h}h old (limit ${MAX_AGE_HOURS}h; is backup.sh running on OCI?)"

# Retention: newest $KEEP sets (only reached when every check passed).
n=0
for d in $dumps; do
  n=$((n + 1))
  if [ "$n" -gt "$KEEP" ]; then
    rm -f -- "$d" "$d.counts.tsv" "$d.sha256"
    log "pruned $d"
  fi
done

# Tell OCI the offsite copy is current (backup.sh alerts when this goes stale).
remote_host=${REMOTE%%:*}
remote_dir=${REMOTE#*:}
ssh -o BatchMode=yes -o ConnectTimeout=20 "$remote_host" "umask 077 && touch '${remote_dir%/}/.mini-pulled'" ||
  die "could not update the pull marker on $remote_host"

log "pull ok: $total sets verified (keep $KEEP), newest $newest (${age_h}h old), $(($(date +%s) - started))s"
