# Phase 8 staging checklist

Use HTTPS and a migrated disposable database. Back up a copy of representative Phase 7 data first, run `php bin/migrate.php`, then run both PHP test suites.

## Migration and defaults

- Confirm migration 007 applies once and a second migration run is a no-op.
- Confirm existing users, stores, products, categories, orders, customers, analytics, themes, slugs, and SEO settings remain unchanged.
- Confirm FREE, PRO, and BUSINESS appear once with the intended prices, features, and limits.
- Register a new merchant and create a store; confirm it receives one ACTIVE FREE subscription.

## Server-side limits

- On FREE, create exactly 10 products and 3 categories. Attempt the next of each by normal form, direct POST, rapid double submission, product duplicate, and import; all over-limit creation must fail without partial writes.
- Edit, archive, and safely delete existing catalog data at the limit; confirm these non-creation operations still work.
- Activate PRO, then confirm up to 250 products, unlimited categories, imports, bulk image matching, advanced analytics, and branding removal.
- Downgrade an over-limit store to FREE. Confirm no data is deleted and new creation remains blocked until usage falls below the limit.
- Manipulate plan codes, feature fields, prices, limits, and store IDs in browser requests; confirm server-derived entitlement remains authoritative.

## Paid changes and lifecycle

- Request PRO twice. Confirm one pending change exists, the repeated request is idempotent, and paid features remain unavailable.
- Request a different paid plan while another request is pending; confirm the conflict is rejected. Cancel the first request, then confirm another can be created.
- Run the CLI activation command after simulated external payment confirmation; confirm plan/state/period update, request becomes APPLIED, and a subscription event is recorded.
- Verify the CLI activation and lifecycle scripts return 404 when invoked through HTTP.
- Schedule a paid-to-FREE downgrade. Before the period end, confirm paid access remains. At/after the boundary, confirm Free entitlements apply even before cron, then run the lifecycle command and confirm the persisted plan becomes FREE.
- Test TRIAL expiry, ACTIVE period expiry, PAST_DUE/GRACE access, grace expiry, EXPIRED fallback, and same-paid-plan renewal request.
- Configure cron for `php /absolute/path/bin/process-subscriptions.php` every five minutes and confirm repeated runs do not duplicate transitions/events.

## Multi-store and tenant isolation

- On FREE and PRO, attempt a second store through UI and direct POST; confirm rejection.
- On BUSINESS, create up to three stores and reject the fourth. Confirm each new store starts on FREE unless explicitly activated later.
- Switch between stores and confirm dashboard/catalog/orders/customers/analytics/settings all reflect only the selected membership-derived tenant.
- As Merchant A, submit Merchant B's store ID to the switch route and subscription change/cancel endpoints; confirm 404/denial and no mutation.
- Remove or deactivate membership for the selected workspace, reload, and confirm the session falls back only to another accessible store.

## Security and regression

- Submit every subscription, cancellation, switch, catalog, and import POST without/with an invalid CSRF token; confirm HTTP 419.
- Confirm merchants cannot access super-admin routes and super-admin credentials do not silently become merchant membership.
- Confirm SQL/log/UI output never reveals credentials, provider secrets, stack traces, or raw exceptions.
- Re-run registration, verification/login/logout, password reset, onboarding, publish/unpublish, catalog CRUD, uploads, storefront, cart, checkout, idempotent order creation, WhatsApp continuation, order status, customization/QR, analytics, CRM, import, SEO, sitemaps, sharing, and FREE branding.

## Responsive and browser quality

- Check Plan & Billing, analytics locks, import locks, store selector, dialogs, and onboarding at 360, 390, 412, 430, 768, 1024, and 1440 px.
- Confirm no accidental horizontal scrolling, clipped prices/usage meters, inaccessible controls, or touch targets below a comfortable size.
- Test current Chrome, Edge, Firefox, and Safari with keyboard-only use, visible focus, reduced motion, refresh/reload, and direct URLs.
