# Phase 4 completion report

## Existing architecture inspected

Phase 3 already provided authenticated tenant resolution, catalog ownership, active-only public reads, exact minor-unit money utilities, global POST CSRF enforcement, store publishing, product variants, and a store-scoped local-storage cart. Phase 4 extends those components; it does not duplicate the catalog, authentication, or storefront layers.

## Database changes

Migration `003_phase4_orders.sql` adds:

- `orders` with store ownership, public reference, hashed idempotency key, customer/delivery snapshot, currency, exact totals, fulfillment state, WhatsApp-open-attempt timestamp, and stock-release guard
- `order_items` with immutable product, SKU, variant, price, quantity, and line-total snapshots
- `order_status_history` with store ownership, actor, state, and timestamp
- Composite tenant foreign keys, unique reference/idempotency constraints, and store/status/date/customer indexes

The migration is additive and does not destroy existing merchant data.

## Implemented

- Customer-information and delivery checkout with accessible validation and mobile layouts
- Server-authoritative product, variant, availability, stock, price, currency, and total validation
- Transactional order/item/history creation before WhatsApp opens
- Session-bound, store-bound, hashed idempotency keys for double taps and retries
- Human-readable random order references such as `ORD-20260918-7KQ2MW`
- Stock decrement for finite variants and one-time restoration when an order is cancelled
- Saved-order transition screen, cart clearing, formatted WhatsApp message, and manual fallback link
- Honest `whatsapp_opened_at` semantics without sent/delivered/read claims
- Merchant order search, filters, pagination, detail snapshots, customer/delivery information, status history, controlled transitions, cancellation confirmation, and audit logging
- Real dashboard orders-today, order-value-today, and recent-order data
- Public checkout throttling and no-referrer protection for continuation credentials

## Security and integrity review

- Client names, prices, availability, stock, currency, line totals, and totals are ignored.
- Product/variant locks and order writes share one database transaction.
- Duplicate cart lines are combined before quantity and stock checks.
- Public continuation requires both the random order reference and the original session-bound token whose hash matches the order.
- All merchant order operations derive `store_id` from authenticated membership and scope reads/writes by it.
- Global CSRF enforcement protects checkout and status POST routes.
- Status transitions are explicit; completed and cancelled orders are terminal.
- Historical order display uses snapshots rather than current catalog data.

## Verification status

**TESTED:** storefront JavaScript syntax with Node; archive/file integrity; route and source assertions; Phase 4 schema/security/static checks; secret-pattern scan; duplicate/dead Phase 4 placeholder review.

**CODE-REVIEWED:** transaction rollback paths, idempotency race handling, cross-store predicates, price tampering defense, finite/unlimited stock behavior, one-time cancellation restoration, terminal status rules, output escaping, continuation access, WhatsApp wording, responsive CSS, and Phase 1–3 regressions.

**NOT TESTED IN THIS WORKSPACE:** PHP execution, MySQL migration/runtime behavior, email, real WhatsApp deep-link behavior, and interactive browser screenshots. PHP and MySQL binaries are not installed in this container. Run the included automated suite and `docs/PHASE_4_MANUAL_TESTS.md` in staging before production.

## Known limitations

- The initial WhatsApp link can record only an open attempt; it cannot prove message sent, delivered, or read.
- Customer accounts, CRM merging, analytics events, online payments, taxes, delivery zones, and WhatsApp Business API automation remain outside Phase 4.
- Inventory exists at variant level only. Base products without variants have availability but no numeric stock field.
- Order timestamps and dashboard “today” use UTC consistently; configurable store time zones are a future extension.
- Phase 5 store customization has not started.
