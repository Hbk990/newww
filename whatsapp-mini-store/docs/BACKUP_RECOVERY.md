# Backup and recovery strategy

Database records and uploaded assets are both required for a complete recovery. A database-only backup loses product/branding images; an uploads-only backup loses users, stores, orders, subscriptions, and audit history.

## Schedule and retention

- Database: nightly logical dump, plus immediately before every deployment/migration
- Uploaded assets: nightly incremental or archive backup, plus before every deployment that changes file handling
- Off-host copy: transfer encrypted backups to a provider/account separate from the web host
- Suggested retention: 7 daily, 4 weekly, and 12 monthly recovery points
- Restore drill: at least quarterly and after changing the backup process

Do not store the only backup inside `public_html` or on the same VPS disk.

## Database backup

Store credentials in a protected MySQL option file outside the web root with permission `600`; do not put passwords in command arguments. Example job:

```bash
umask 077
stamp=$(date -u +%Y%m%d-%H%M%S)
mysqldump --defaults-extra-file=/protected/path/backup.cnf --single-transaction --quick --routines --triggers ministore | gzip -9 > "/protected/backups/ministore-${stamp}.sql.gz"
gzip -t "/protected/backups/ministore-${stamp}.sql.gz"
sha256sum "/protected/backups/ministore-${stamp}.sql.gz" > "/protected/backups/ministore-${stamp}.sql.gz.sha256"
```

Use Hostinger's database-backup facility if shell tools are unavailable, then download/copy the result off-host. A successful command exit is not enough: verify gzip integrity and periodically restore into a disposable database.

## Uploaded assets backup

```bash
umask 077
stamp=$(date -u +%Y%m%d-%H%M%S)
tar -C /absolute/path/public -czf "/protected/backups/uploads-${stamp}.tar.gz" uploads
tar -tzf "/protected/backups/uploads-${stamp}.tar.gz" >/dev/null
sha256sum "/protected/backups/uploads-${stamp}.tar.gz" > "/protected/backups/uploads-${stamp}.tar.gz.sha256"
```

Preserve `public/uploads/.htaccess` in every archive. Verify that restored files retain non-executable permissions.

## Heartbeats

After validation succeeds:

```bash
php /absolute/path/bin/record-system-task.php backup_database success
php /absolute/path/bin/record-system-task.php backup_uploads success
```

Use `failed` on any failed dump, transfer, checksum, archive validation, or restore test. Heartbeats are operational evidence only; they are not backups.

## Restore drill

1. Provision a disposable database and private application copy.
2. Verify SHA-256 files and archive integrity.
3. Import the database dump into the disposable database.
4. Extract uploads outside the web root first, scan/list them, then place them under the test application's uploads directory.
5. Set a staging-only `.env`; never connect the drill to production WhatsApp/email endpoints.
6. Run `php bin/production-check.php` and the automated tests.
7. Verify representative merchants, tenant boundaries, store settings, product images, historical order totals, subscriptions, and audit rows.
8. Record recovery time and any missing data. Fix the backup process before calling the drill successful.

## Recovery objectives

For an initial small-business SaaS, target an RPO of 24 hours and an RTO of 4 hours. Reduce both as order volume and paid usage grow by increasing backup frequency and automating tested off-host replication.
