# Phase 9 staging checklist

Use HTTPS, a migrated disposable database, separate merchant and super-admin browser sessions, and representative Phase 8 data. Back up the database and uploaded assets before migration 008. Run `php bin/migrate.php`, `php tests/run.php`, and `php tests/tenant_isolation.php` first.

## Migration and regression

- Confirm migration 008 applies once and a second migration run is a no-op.
- Confirm existing users, memberships, stores, publication states, subscriptions, products, orders, customers, analytics, branding, slugs, and SEO remain unchanged.
- Confirm the three `system_tasks` rows exist once and previously applied migrations remain recorded.
- Re-run registration, verification/login/logout, reset, onboarding, catalog/images/variants, storefront/cart/checkout/WhatsApp, orders, themes/QR, analytics/CRM/import, SEO/sharing, and plan/workspace flows.

## Role boundary and direct access

- As a logged-out user, open each `/sa` URL and confirm redirect to `/sa/login`.
- As Merchant A, request dashboard, merchant, store, plan, audit, and system admin URLs directly; all must fail without leaking data.
- As a super-admin, try merchant dashboard/catalog/order URLs without a store membership; no tenant access should be inferred from the admin role.
- Suspend a super-admin directly in the database on staging, retain its session, and confirm subsequent admin access is denied.
- Confirm no admin screen, response, log rendering, or HTML source exposes password hashes, reset/verification tokens, provider secrets, raw environment values, stack traces, or error-log contents.

## Merchant administration

- Search by merchant name, email, store name, and slug; filter active/suspended; paginate and test empty/no-result states.
- Inspect a merchant with multiple store memberships and confirm counts/roles/status/plans/usage are correct and not distorted by search terms.
- Suspend Merchant A and confirm their current session is denied on the next protected request while Merchant B remains active.
- Repeat the POST, omit/alter CSRF, submit a super-admin ID as the merchant ID, and use invalid status values; confirm idempotence or rejection with no unintended mutation.
- Reactivate Merchant A and confirm the audit event identifies the acting super-admin and exact merchant target.

## Store administration and tenant isolation

- Search/filter stores by name, slug, owner, status, and plan; confirm product/order counts and pagination.
- Inspect Merchant A's store and compare members, customers, order value, recent orders, plan, and subscription events with authoritative database rows.
- Suspend an ACTIVE store and confirm its public URL shows the neutral unavailable page; reactivate and confirm it returns ACTIVE.
- Suspend a DRAFT store and reactivate it; confirm it returns DRAFT and never becomes public.
- Repeat suspension/reactivation, omit/alter CSRF, submit nonexistent/invalid IDs, and verify Merchant B's store never changes.
- Apply an active plan override and confirm subscription/event/audit rows are atomic. Attempt an inactive or invented plan code and confirm rejection.

## Plans, metrics, and audit

- Edit every configurable plan field with valid and invalid values. Confirm inline feedback, unchecked boxes remain unchecked after validation errors, and unknown JSON keys survive.
- Attempt to deactivate/hide FREE, set a nonzero FREE price, remove its basic storefront, or set its store limit below one; confirm the protected baseline remains valid.
- Confirm lower limits do not delete catalog data and Phase 8 server checks block only new over-limit creation.
- Compare dashboard counts and order value with SQL results. Confirm cancelled orders are excluded and currencies are never combined.
- Confirm configured MRR includes active paid subscriptions only, excludes Free/trial/expired/past-due records, and is labeled as not proof of payment collection.
- Filter the audit log by event and search terms; confirm pagination and escaping with malicious-looking actor/target values.

## System, tasks, and backups

- Confirm database/migration/runtime/HTTPS/writable-path values are accurate without exposing configuration secrets.
- Compare storage totals with the application directories and verify missing/unreadable paths fail safely.
- Run `php bin/process-subscriptions.php`; confirm RUNNING then SUCCESS/FAILED heartbeat behavior and no duplicated lifecycle transition.
- Create and independently verify a staging database backup, then run `php bin/record-system-task.php backup_database success`. Repeat for uploaded assets.
- Record a failed backup and confirm the admin page reports FAILED. Never mark a backup successful without a restore/verification check.
- Attempt to execute both task scripts over HTTP and confirm they are unavailable.

## Security, responsive, and browser quality

- Send all privileged POSTs without/with an invalid CSRF token; confirm HTTP 419. Alter route IDs, hidden values, plan codes, status/action values, and periods; confirm server validation remains authoritative.
- Try stored/reflected XSS strings in merchant/store names, email/search, order/customer fields, plan descriptions, audit-related metadata, and URLs; confirm output remains escaped.
- Test destructive confirmations with keyboard only, Escape/cancel, confirm, double-click, refresh, and back navigation.
- Check all Phase 9 pages at 360, 390, 412, 430, 768, 1024, and 1440 px for overflow, readable tables, scrollable navigation, dialog access, focus visibility, and comfortable touch targets.
- Test current Chrome, Edge, Firefox, and Safari, including direct URLs, empty states, reduced motion, session expiry, and two-tab refresh behavior.
