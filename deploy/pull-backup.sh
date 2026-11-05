#!/usr/bin/env bash
# Run from another machine, so losing the server doesn't lose the backups.
# Usage: SSH_KEY=~/.ssh/key SSH_TARGET=user@host deploy/pull-backup.sh
# Copies new dumps to ~/squeek-time-machine-backups, checks them, and keeps 14.
set -euo pipefail
export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin
umask 077
DEST="$HOME/squeek-time-machine-backups"
KEEP=14
mkdir -p "$DEST"
chmod 700 "$DEST"
SSH="ssh -i ${SSH_KEY:?} -o BatchMode=yes -o ConnectTimeout=20"
rsync -a --partial-dir=.part --timeout=120 -e "$SSH" "${SSH_TARGET:?}:squeek-backups/squeek-*.sql.gz" "$DEST/"
for f in "$DEST"/squeek-*.sql.gz; do
  gzip -t "$f" || { echo "$(date -u +%FT%TZ) corrupt copy removed: $f"; rm -f "$f"; }
done
ls -1t "$DEST"/squeek-*.sql.gz | tail -n +$((KEEP + 1)) | xargs -r rm -f
echo "$(date -u +%FT%TZ) ok newest: $(ls -1t "$DEST"/squeek-*.sql.gz | head -n 1 | xargs basename)"
