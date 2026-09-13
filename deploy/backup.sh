#!/usr/bin/env bash
# Copies the shop's data — products, orders, customers, photos — into a dated
# archive under ~/backups, and keeps the last 30.
#
#   chmod +x deploy/backup.sh
#   ./deploy/backup.sh
#
# To run it nightly at 3am, add this with `crontab -e`:
#   0 3 * * * /home/huqa/shop/deploy/backup.sh
set -euo pipefail

DATA_DIR="${DATA_DIR:-/home/huqa/shop/data}"
DEST="${BACKUP_DIR:-$HOME/backups}"
mkdir -p "$DEST"

stamp="$(date +%Y-%m-%d-%H%M)"
archive="$DEST/huqa-$stamp.tar.gz"

# Copy the database through SQLite so a backup taken mid-write is still valid.
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
if [ -f "$DATA_DIR/huqa.sqlite" ]; then
  sqlite3 "$DATA_DIR/huqa.sqlite" ".backup '$work/huqa.sqlite'" 2>/dev/null \
    || cp "$DATA_DIR/huqa.sqlite" "$work/huqa.sqlite"
fi
cp -r "$DATA_DIR/files" "$work/files" 2>/dev/null || true

tar -czf "$archive" -C "$work" .
echo "Saved $archive"

ls -1t "$DEST"/huqa-*.tar.gz 2>/dev/null | tail -n +31 | xargs -r rm --
