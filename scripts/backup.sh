#!/usr/bin/env bash
#
# Nightly backup of the whole database.
#
# This is the difference between a bad day and a ruined business. Run it from
# cron every night and test a restore at least once, before you need it.
#
#   crontab -e
#   15 2 * * * /opt/showroom/scripts/backup.sh >> /var/log/showroom-backup.log 2>&1
#
# Configure with environment variables (or edit the defaults below):
#   DB_NAME, DB_USER, DB_PASSWORD, DB_HOST
#   BACKUP_DIR       where to write backups        (default /var/backups/showroom)
#   KEEP_DAYS        how long to keep them         (default 30)
#   OFFSITE_TARGET   optional rsync/scp target, e.g. user@host:/backups/showroom
#   ENCRYPT_PASSPHRASE  optional; when set, backups are encrypted with AES-256

set -euo pipefail

DB_NAME="${DB_NAME:-carshowroom}"
DB_USER="${DB_USER:-showroom}"
DB_PASSWORD="${DB_PASSWORD:-}"
DB_HOST="${DB_HOST:-127.0.0.1}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/showroom}"
KEEP_DAYS="${KEEP_DAYS:-30}"

timestamp="$(date +%Y-%m-%d_%H%M)"
mkdir -p "$BACKUP_DIR"
file="$BACKUP_DIR/${DB_NAME}_${timestamp}.sql.gz"

echo "[$(date -Is)] Backing up $DB_NAME -> $file"

# --single-transaction keeps the dump consistent without locking the site.
mysqldump \
  --host="$DB_HOST" \
  --user="$DB_USER" \
  ${DB_PASSWORD:+--password="$DB_PASSWORD"} \
  --single-transaction \
  --routines \
  --triggers \
  --default-character-set=utf8mb4 \
  "$DB_NAME" | gzip -9 > "$file"

if [ -n "${ENCRYPT_PASSPHRASE:-}" ]; then
  openssl enc -aes-256-cbc -pbkdf2 -salt \
    -in "$file" -out "${file}.enc" -pass env:ENCRYPT_PASSPHRASE
  rm -f "$file"
  file="${file}.enc"
  echo "[$(date -Is)] Encrypted."
fi

size="$(du -h "$file" | cut -f1)"
echo "[$(date -Is)] Done: $file ($size)"

# A backup that only exists on the same server is not a backup. If that machine
# dies, so does it.
if [ -n "${OFFSITE_TARGET:-}" ]; then
  echo "[$(date -Is)] Copying off-site to $OFFSITE_TARGET"
  rsync -az "$file" "$OFFSITE_TARGET/" || echo "[$(date -Is)] WARNING: off-site copy failed"
fi

deleted="$(find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz*" -mtime "+$KEEP_DAYS" -print -delete | wc -l)"
echo "[$(date -Is)] Removed $deleted backup(s) older than $KEEP_DAYS days"

# Fail loudly on a suspiciously small dump — an empty backup is worse than none,
# because it looks like everything is fine.
minimum_bytes=10240
actual_bytes="$(stat -c%s "$file")"
if [ "$actual_bytes" -lt "$minimum_bytes" ]; then
  echo "[$(date -Is)] ERROR: backup is only ${actual_bytes} bytes — something is wrong!" >&2
  exit 1
fi

echo "[$(date -Is)] Backup OK"
