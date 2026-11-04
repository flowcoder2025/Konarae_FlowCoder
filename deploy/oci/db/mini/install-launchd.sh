#!/bin/bash
# Install the Mini-side backup pull job (idempotent):
#   ~/.local/bin/flowmate-db-pull-backups.sh  (copy of pull-backups.sh, 700)
#   ~/Library/LaunchAgents/com.flowcoder.flowmate-db-backup.plist (05:30 daily)
# then (re)bootstraps it in the gui domain. Run from the repo checkout:
#   deploy/oci/db/mini/install-launchd.sh
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 PYTHONUTF8=1 PYTHONIOENCODING=utf-8
set -euo pipefail
here=$(cd -- "$(dirname -- "$0")" && pwd)
label=com.flowcoder.flowmate-db-backup
plist="$HOME/Library/LaunchAgents/$label.plist"

mkdir -p "$HOME/.local/bin" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
install -m 700 "$here/pull-backups.sh" "$HOME/.local/bin/flowmate-db-pull-backups.sh"
sed "s|@HOME@|$HOME|g" "$here/$label.plist" >"$plist.tmp"
plutil -lint "$plist.tmp" >/dev/null
mv -f "$plist.tmp" "$plist"
chmod 644 "$plist"

launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$plist"
launchctl print "gui/$(id -u)/$label" | grep -E '^\s*(state|path|program) =' || true
echo "installed $label (logs: $HOME/Library/Logs/flowmate-db-backup.log)"
