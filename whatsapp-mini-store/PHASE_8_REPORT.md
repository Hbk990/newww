# Phase 8 completion report

## Architecture inspected

Phase 7 already used a lightweight PHP front controller, ordered routes, PDO repositories, membership-derived tenant context, one subscription per store, JSON plan configuration, global POST CSRF protection, and server-derived branding. Phase 8 extends those boundaries with a central entitlement service and billing adapter rather than scattering plan names or limits through controllers.

## Database changes

Migration `007_phase8_subscriptions.sql` additively expands plan metadata and subscription lifecycle/provider fields. It creates tenant-scoped `subscription_change_requests` and immutable `subscription_events`, with foreign keys and lifecycle indexes. FREE, PRO, and BUSINESS are seeded with JSON features and limits; `-1` represents unlimited. No catalog, order, customer, analytics, merchant, or store data is deleted. Existing applied migrations remain unchanged.

## Implemented

- Database-configured Free, Pro, and Business plan cards, pricing, features, resource limits, usage meters, and change history
- Central `PlanAccessService` with effective entitlement fallback, limit checks, feature gates, usage calculation, and grace handling
- Transactional product/category limits, including one preflight capacity check for atomic imports and duplicate-product creation through the same guarded path
- Server-enforced CSV/XLSX import, bulk-image matching, advanced analytics, and platform-branding gates
- Pending paid-plan requests that never self-activate, stable provider idempotency keys, cancellable pending requests, and a modular provider interface/factory
- Safe Free downgrade scheduling at the paid period boundary; existing data is retained when limits decrease
- Trial, active, past-due, grace, expired, cancelled, renewal, and scheduled-change lifecycle architecture
- CLI-only manual payment activation and lifecycle processor suitable for cron
- Effective-plan evaluation that remains safe if cron is late: grace is honored while due Free downgrades stop paid entitlements immediately
- Business multi-store limit architecture, transaction-serialized store creation, active workspace selection, and membership-authorized switching
- FREE fallback for expired paid access across branding, SEO plan display, catalog limits, analytics, and imports
- Feature hooks and limits for later staff-management and custom-domain modules without implementing those future modules early

## Files changed

- `database/migrations/007_phase8_subscriptions.sql`, `config/billing.php`, `.env.example`
- Subscription repository, plan access/lifecycle services, and billing provider interface/factory/manual adapter
- Product, category, import, storefront, SEO, and store repositories/services/controllers for server enforcement
- Subscription and workspace controllers, merchant subscription/import/analytics/layout views, routes, JavaScript, and dashboard CSS
- `bin/process-subscriptions.php`, `bin/activate-subscription.php`
- `tests/run.php`, `tests/tenant_isolation.php`, `tests/static_phase8.mjs`, README, and the Phase 8 staging checklist

## Verification status

**TESTED:** JavaScript syntax for both bundles; balanced application/storefront CSS; delimiter scanning across 118 PHP files; Phase 1–7 static regression assertions; Phase 8 source assertions for additive schema, plan seeds, transactional catalog gates, POST feature enforcement, pending/idempotent paid changes, lifecycle transitions, cron-independent entitlement safety, route ordering, and tenant-authorized workspace switching.

**CODE-REVIEWED:** effective-plan date/state logic, same-plan renewal behavior, scheduled Free downgrade behavior, provider trust boundary, transaction/row-lock ordering, import capacity preflight, existing-data preservation after downgrade, multi-store creation serialization, membership-derived switching, public branding fallback, SQL parameterization, CSRF coverage, output escaping, direct URL access, empty/locked states, and Phase 1–7 route regressions.

**NOT TESTED IN THIS WORKSPACE:** PHP execution/lint; MySQL/MariaDB migration or lifecycle execution; database tenant-isolation suite; cron; real email/auth flows; HTTP/browser behavior; manual activation against a real database; concurrent transaction behavior under load; responsive screenshots at the required widths; or a real payment provider. PHP and MySQL binaries are unavailable here. Run the automated PHP suites and `docs/PHASE_8_MANUAL_TESTS.md` on staging before production.

## Known limitations

- Manual billing is the only adapter. It stores no card data and requires trusted external payment verification followed by the CLI activation command.
- Phase 9 admin plan editing/merchant management UI is intentionally not implemented. Plan data is centralized in database rows and can later be managed without rewriting enforcement logic.
- Staff-management and custom-domain entitlements are modeled, but their operational modules are future work and are not represented as working UI features.
- Downgrading never deletes products/categories. If usage exceeds the new limit, existing data remains available and additional creation is blocked until usage is reduced or the plan changes.
- The lifecycle command must be scheduled for prompt persisted state transitions, although request-time entitlement checks prevent late cron from extending a due Free downgrade or removing configured grace.
- Payment-provider webhooks, proration, taxes, invoices, refunds, and dunning are deliberately outside this manual-provider phase.

Phase 8 is complete within the verification limits above. Phase 9 has not been started.
