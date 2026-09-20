# Hostinger production deployment

This procedure supports Hostinger shared hosting or a PHP-capable VPS. Use a staging subdomain first. Never upgrade the live database before taking and verifying both database and upload backups.

## 1. Hosting requirements

- PHP 8.1 or newer with PDO MySQL, mbstring, fileinfo, JSON, OpenSSL, and session support
- Zip and SimpleXML for XLSX import; GD is recommended for thumbnails
- MySQL 8+ or compatible MariaDB with InnoDB and JSON support
- HTTPS certificate, cron access, PHP `mail()` configured by Hostinger, and Apache rewrite support
- PHP limits at least: `memory_limit=256M`, `upload_max_filesize=6M`, `post_max_size=50M`, `max_file_uploads=20`, `max_execution_time=120`

## 2. Files and document root

Preferred: upload the project outside `public_html` and point the domain document root at the project's `public/` directory. This prevents the application, configuration, logs, migrations, and tests from being web-accessible.

If Hostinger shared hosting cannot change the document root, place the complete project in `public_html`. Keep both supplied `.htaccess` files. The root rules forward traffic to `public/` and explicitly deny private directories and dotfiles. Confirm direct requests for `/.env`, `/config/database.php`, `/storage/logs/app.log`, `/database/migrations/001_phase1_foundation.sql`, `/bin/migrate.php`, and `/composer.json` return 403 or 404.

Do not omit `public/uploads/.htaccess`. On Nginx, add an explicit location rule that denies execution beneath `/uploads/`; `.htaccess` is Apache-only.

## 3. Environment

Copy `.env.example` to `.env`, keep it out of source control, and set permissions to `600` where supported. Required production values:

```dotenv
APP_ENV=production
APP_DEBUG=false
APP_URL=https://store-platform.example
APP_MARKETING_URL=https://store-platform.example
APP_KEY=<at-least-64-random-characters>
APP_TIMEZONE=UTC
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=<database>
DB_USERNAME=<least-privileged-user>
DB_PASSWORD=<strong-unique-password>
SESSION_SECURE=true
MAIL_DRIVER=mail
MAIL_FROM=no-reply@store-platform.example
TRUSTED_PROXY_IPS=
ANALYTICS_RETENTION_DAYS=730
```

Generate `APP_KEY` locally with a cryptographically secure generator, for example `php -r "echo bin2hex(random_bytes(32)), PHP_EOL;"`. Do not paste database or application secrets into frontend JavaScript, cron URLs, tickets, or screenshots.

Leave `TRUSTED_PROXY_IPS` empty unless a known reverse proxy terminates HTTPS. If used, enter exact proxy IPs separated by commas. The proxy must replace—not blindly pass—`X-Forwarded-For` and `X-Forwarded-Proto`.

## 4. Database and permissions

Create a UTF-8 database and a dedicated application user. Grant only the database privileges the application requires; do not use the hosting root account. During deployment the migration user needs ALTER, CREATE, INDEX, INSERT, UPDATE, DELETE, SELECT, and REFERENCES. A separately restricted runtime user can be introduced after migrations if operationally practical.

Writable paths:

- `storage/logs`
- `storage/sessions`
- `storage/cache`
- `storage/cache/rate-limits`
- `public/uploads`

Use directories `750` or `770` and files `640` or `660`, depending on Hostinger's PHP user/group. Do not use `777` unless hosting support proves it is unavoidable.

## 5. Safe release sequence

1. Enable a maintenance page or deploy to a versioned release directory.
2. Back up and verify the database and `public/uploads` as described in `BACKUP_RECOVERY.md`.
3. Upload the new code without overwriting `.env`, uploads, logs, sessions, or backup files.
4. Run `php bin/migrate.php` once. Migration 009 adds indexes and may take time on large tables; schedule a low-traffic window.
5. Run `php bin/production-check.php`. Any FAIL blocks launch.
6. Create the first super-admin once with `php bin/create-super-admin.php` if this is a new installation.
7. Clear `storage/cache/system-storage.json` if present so the system page recalculates storage immediately.
8. Smoke-test login, admin access, merchant dashboard, one public store, cart, test checkout, saved order, and WhatsApp continuation.
9. Switch the document-root symlink/release directory or disable maintenance mode.
10. Watch the protected application log and super-admin system page.

Do not edit an applied migration. If migration fails, stop, retain the error output privately, and restore or repair from the verified backup. Never delete the production database to retry.

## 6. Cron jobs

Use absolute paths and the selected PHP binary:

```cron
*/5 * * * * /usr/bin/php /absolute/path/bin/process-subscriptions.php >/dev/null 2>&1
20 2 * * * /usr/bin/php /absolute/path/bin/maintenance.php >/dev/null 2>&1
```

Backups should run before maintenance and before planned deployments. Record backup success only after archive validation or a restore check. The super-admin system page reports heartbeats; it does not create or prove a backup.

## 7. HTTPS, email, and web-server checks

- Force HTTPS at the Hostinger/domain level before enabling traffic.
- Confirm the certificate chain and renewal.
- Send a registration verification and password-reset email to real external mailboxes. The `log` mail driver is blocked in production because it writes security links to disk.
- Confirm security response headers with browser developer tools.
- Confirm PHP files uploaded under `/uploads` cannot execute and return 403/404.
- Ensure directory listing is disabled.

## 8. Rollback

Keep the prior code release and the pre-deployment backups. If a release fails before schema changes, switch back to the previous code. If migration 009 applied, the added indexes/task row are backward-compatible with Phase 9; the prior code can run while the incident is investigated. For any destructive data incident, restore into a separate database first, validate row counts and tenant samples, then perform the controlled production restore.
