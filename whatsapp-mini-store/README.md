# MiniStore SaaS — V1 / Phase 10

Production-hardened V1 of a multi-tenant, WhatsApp-first mini-store platform. Phase 10 audits and strengthens the complete Phase 1–9 application across authentication, tenant isolation, uploads, orders, headers, logging, concurrency, query performance, maintenance, backups, and Hostinger deployment readiness.

## Requirements

- PHP 8.1+ with PDO MySQL, mbstring, and fileinfo; GD is recommended for thumbnails
- MySQL 8+ or a compatible MariaDB release with JSON support
- Apache with `mod_rewrite` (or equivalent Nginx routing)
- HTTPS in production

## Install

1. Point the domain document root to `public/` when hosting allows it. If shared hosting cannot change the document root, the root `.htaccess` forwards public requests and blocks private directories.
2. Copy `.env.example` to `.env` and use a random 64-character `APP_KEY`.
3. Create an empty MySQL database and a least-privileged database user.
4. Run `php bin/migrate.php`. Existing Phase 1 databases are upgraded safely by the new numbered migration.
5. Run `php bin/create-super-admin.php` once from the command line.
6. Make only `storage/logs`, `storage/cache/rate-limits`, and `storage/sessions` writable by PHP.
7. Prefer `MAIL_DRIVER=smtp` with `SMTP_HOST`/`SMTP_PORT`/`SMTP_ENCRYPTION`/`SMTP_USERNAME`/`SMTP_PASSWORD` set to a real transactional provider (or your host's SMTP relay) — verification and reset links are security-sensitive, and PHP's native `mail()` has weak deliverability with no visibility into failures. `MAIL_DRIVER=mail` remains available for hosts like Hostinger where PHP mail is already configured and SMTP is impractical. The `log` driver writes links to `storage/logs/mail.log` and is development-only.
8. Set `APP_MARKETING_URL` to the public platform landing page used by the “Powered by” link.
9. Serve over HTTPS and keep `SESSION_SECURE=true`.
10. Keep `BILLING_PROVIDER=manual` until a real provider adapter is implemented. Run `php bin/process-subscriptions.php` every five minutes from cron so scheduled changes and lifecycle states are persisted promptly.
11. Configure independent database and uploaded-asset backup jobs. After a backup is created and verified by the job, record its heartbeat with `php bin/record-system-task.php backup_database success` or `php bin/record-system-task.php backup_uploads success`. Use `failed` instead of `success` when verification fails; never mark an unverified backup successful.
12. Run `php bin/production-check.php`; do not launch until every check passes.
13. Schedule `php bin/maintenance.php` daily and retain its heartbeat in the super-admin system page.

The full Hostinger/VPS procedure is in `docs/DEPLOYMENT_HOSTINGER.md`. Backup retention and restore verification are in `docs/BACKUP_RECOVERY.md`.

For manual billing, a merchant request remains `PENDING` and grants no paid access. After payment is verified outside this application, a trusted operator may run `php bin/activate-subscription.php <store-slug> <plan-code> [period-days] [provider-reference]`. The command is CLI-only. Do not expose it as a web endpoint.

For local development: `php -S 127.0.0.1:8080 -t public public/index.php`.

## Security model

- Merchant and super-admin login endpoints are separate, and both validate `platform_role` server-side.
- Store access is derived through `store_users.user_id` from the authenticated session. No form or query-string `store_id` is trusted.
- Sessions use strict mode, cookie-only IDs, HttpOnly, SameSite=Lax, secure cookies in production, ID rotation at login, and idle expiry.
- Every POST route is globally CSRF protected.
- Passwords use Argon2id when available, otherwise PHP bcrypt.
- Reset and verification tokens are random, stored only as SHA-256 hashes, expire, and are single use.
- Login, registration, password-reset, and verification resend flows are rate-limited.
- PDO uses native prepared statements. Views escape dynamic output.
- Checkout accepts only product IDs, variant IDs, and quantities; names, availability, currency, and prices are fetched and calculated server-side inside a database transaction.
- Per-store idempotency keys prevent browser retries and repeated taps from creating duplicate orders.
- Order and status queries always derive the store from the authenticated merchant membership.
- Store-design updates derive the tenant from authenticated membership, validate the 15-template allowlist/fonts/colors, and content-inspect branding uploads.
- Previous store slugs are reserved and issue permanent redirects to the store’s current address.
- SEO updates derive the store from authenticated membership; no submitted tenant identifier is accepted.
- Indexing opt-out is enforced in storefront metadata and sitemap queries, not merely hidden in the UI.
- Platform branding removal is derived from the active subscription feature JSON on the server.
- Product, category, import, analytics, branding, and store-count entitlements are derived from the effective server-side plan. UI visibility is never the authorization control.
- Catalog limits are checked while the subscription row and catalog transaction are locked, preventing concurrent requests from bypassing limits.
- Paid requests remain pending until a trusted activation path confirms payment. Repeated requests use a stable provider idempotency key.
- Store switching validates active membership server-side and persists only the validated workspace ID in the session.
- Every `/sa` controller enforces an active `SUPER_ADMIN` session; merchant credentials cannot cross that boundary.
- Privileged merchant suspension, store suspension/reactivation, plan changes, and subscription overrides are performed server-side and recorded in the audit log.
- Admin merchant queries explicitly omit password hashes and token material. No impersonation feature is present.
- Password changes invalidate older authenticated sessions, while login and reset protection combines account-level and IP-level throttles.
- Trusted proxy headers are accepted only from explicitly configured proxy IPs. Production sends CSP, HSTS on HTTPS, anti-framing, MIME-sniffing, referrer, permissions, and request-ID headers.
- Uploads are content-inspected, pixel/size limited, assigned random names, isolated by store, and protected from script execution at the web-server layer.
- Audit events cover authentication, store/catalog changes, merchant order status changes, and privileged Phase 9 administration.

## Tests

Run `php tests/run.php` and `php tests/tenant_isolation.php`. A runtime with Node.js can run `node tests/static_phase10.mjs`. The Phase 10 suite includes every earlier static regression plus production headers, proxy trust, session invalidation, abuse throttles, uploads, deterministic order locking, query optimization, maintenance, and tenant identity assertions. Complete the staging checklist before deployment. See `PHASE_10_REPORT.md` for exact verification status.

On a migrated disposable test database, run `php tests/tenant_isolation.php` for cross-store attacks, then complete `docs/PHASE_10_MANUAL_TESTS.md`.

## Upgrade policy

Add future changes as new numbered files under `database/migrations/`. Never edit an already-applied production migration. Back up the database before an upgrade. The included runner records applied versions in `schema_migrations`.
