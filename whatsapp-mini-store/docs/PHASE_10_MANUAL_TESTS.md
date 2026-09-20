# Phase 10 production acceptance checklist

Run this on an HTTPS staging deployment using a migrated disposable copy of realistic data. Use at least two merchants, two stores, a super-admin, products with/without variants, and independent browser sessions. Critical or high-severity failures block release.

## Automated and deployment gates

- Run `php bin/migrate.php` twice; migration 009 applies once and the second run is a no-op.
- Run `php tests/run.php` and `php tests/tenant_isolation.php`; both must exit 0.
- Run `node tests/static_phase10.mjs` if Node is available locally/CI.
- Run `php bin/production-check.php`; every line must be OK.
- Verify `.env`, logs, migrations, source, tests, and backup archives are inaccessible over HTTP.
- Verify `public/uploads/.htaccess` is deployed or the equivalent Nginx rule is active.

## New merchant end to end

- Register with invalid/valid/duplicate email and weak/valid passwords; verify generic login/reset errors and rate limits.
- Verify email, log in, create a business, set WhatsApp/country/currency/unique slug/theme, and confirm FREE subscription creation.
- Confirm direct protected URLs before login/verification fail correctly.
- Create categories and products, upload valid images, reject mismatched/executable/oversized/over-pixel files, add variants/stock, customize design, configure SEO, and publish.
- Confirm setup progress, public URL, QR downloads, sharing, tasteful FREE branding, and plan limits.

## Customer end to end

- Test public home, category browse, search/no-results, product gallery, variants, quantity, add/remove/update cart, persistence, empty cart, and responsive navigation.
- Submit a valid order and confirm authoritative server prices, historical snapshots, customer merge, unique reference, saved order before WhatsApp, correct message, and `whatsapp_opened` terminology only.
- Double-tap/retry the checkout request with the same idempotency token; exactly one order must exist.
- Manipulate client names, prices, totals, currency, product/variant/store IDs, quantity, availability, stock, and token; the server must ignore/reject unauthorized values without partial data.
- Reorder after product price changes, variant removal, discontinuation, and stock reduction; show safe skips and current authoritative values.

## Merchant and tenant isolation

- As Merchant A, submit Merchant B IDs to every product, category, image, order, customer, analytics, import, design, SEO, subscription, store-switch, and publication endpoint. Reads and writes must fail with no B data in response/log/UI.
- Modify hidden fields, query strings, route IDs, multipart paths, and duplicate submissions; tenant identity must remain membership-derived.
- Test product/category CRUD, duplicate/archive/delete, image removal, ordering, import preview/commit, bulk image matching, order status transitions, stock restoration on cancellation, CRM, analytics, SEO, themes, subscriptions, and multi-store switching.
- Reduce plan limits below existing usage; no existing data is deleted and new creation is blocked server-side.

## Super-admin boundary

- As a merchant and logged-out visitor, request every `/sa` endpoint; access must fail without data leakage.
- Search/inspect/suspend/reactivate merchants and stores, change plans, edit plan limits/features/prices, browse audit events, and inspect system status.
- Verify each privileged mutation is CSRF-protected, confirmed in UI, transactionally applied, and audited with the correct actor/target.
- Confirm password hashes, reset/verification tokens, environment values, provider secrets, raw logs, stack traces, and SQL errors never appear.
- Confirm there is no impersonation action.

## Authentication and session attacks

- Test session fixation by setting a pre-login cookie; session ID must rotate after login.
- Reset a password in one browser and confirm existing authenticated sessions in other browsers are rejected on their next request.
- Suspend an account and confirm existing sessions lose protected access.
- Exercise login spraying across many emails from one IP and repeated attempts for one email; both limits must activate.
- Exercise reset requests across many emails and repeated requests for one email; responses must not reveal account existence.
- While logged into Account A, open Account B's email-verification link; receive denial without consuming B's link. Then verify B successfully.
- Test missing/invalid/reused/expired CSRF, reset, verification, checkout, import, and reorder tokens.

## Web and upload security

- Confirm CSP, HSTS on HTTPS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, COOP, and X-Request-ID headers.
- Attempt framing, inline-script injection, stored/reflected XSS, `javascript:` URLs, malicious social URLs, CRLF/header injection, path traversal, and open redirects.
- Upload renamed PHP, double extensions, SVG, HTML, malformed images, polyglots, files over 5 MB, dimensions outside limits, and images over 16 megapixels. All must fail or remain non-executable.
- Directly request an uploaded `.php`, `.phtml`, `.phar`, `.cgi`, `.pl`, `.py`, or `.sh` test file placed by an administrator; it must never execute.
- Test requests through the configured reverse proxy and directly to origin. Spoofed forwarded headers from untrusted sources must not affect rate-limit/audit IP or HTTPS detection.

## Data integrity and concurrency

- Submit two concurrent carts containing the same products in reverse client order. Confirm no persistent deadlock, oversell, duplicate order, or partial rows.
- Race product/category creation at a plan limit and store creation at a store limit; the limit must hold.
- Race cancellation/status updates; stock restores at most once and terminal states remain terminal.
- Compare old order snapshots/totals/currency after editing or deleting products.
- Verify database foreign keys, unique constraints, DECIMAL values, new indexes, and query plans for storefront catalog and recent store orders.

## Error, maintenance, and recovery

- Trigger controlled 400/403/404/419/500 cases. Production shows neutral error pages only; the protected log has a request ID and no control-character/log injection.
- Run `php bin/maintenance.php` twice. Confirm non-overlap lock, heartbeat, expired import payload cleanup, configured analytics retention, stale rate/session cleanup, and no active-session deletion.
- Run lifecycle cron repeatedly and confirm idempotent state transitions.
- Create, checksum, transfer, and restore both database and upload backups according to `BACKUP_RECOVERY.md`. Do not accept file existence as a successful restore test.
- Record success/failure heartbeats only after validation and confirm truthful system-page status.

## Responsive, accessibility, and browsers

- Test 360, 390, 412, 430, 768, 1024, and 1440 px across auth, onboarding, merchant dashboard/tables/forms/dialogs, admin pages, storefront/product/gallery/cart/checkout/order continuation.
- Confirm no accidental horizontal page scroll, clipped controls, unusable tables, distorted images, or inaccessible dialogs/navigation.
- Test current Chrome, Edge, Firefox, and Safari with keyboard only, visible focus, screen-reader labels/landmarks, reduced motion, zoom to 200%, slow network, refresh/back, and direct URLs.

## Release decision

Release only when all automated gates pass, every critical end-to-end/security item passes, backups are restored successfully, and remaining low-risk defects have owners and documented acceptance. Record the tested commit/archive hash, database migration version, PHP/MySQL versions, date, and tester.
