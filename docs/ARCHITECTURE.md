# Ecommerce Platform — Architecture

Custom storefront + admin for **physical goods with variants**.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript | Server Components render product pages on the server: fast LCP and real SEO without a separate API tier. Server Actions cover cart/checkout mutations. |
| Database | Postgres | Orders, variants, and inventory are deeply relational and need real transactions. Non-negotiable. |
| ORM | Drizzle | SQL-shaped, typed, migrations are plain SQL you can read. Postgres row locking (`FOR UPDATE`) is reachable, which the inventory logic needs. Prisma is a fine swap if you prefer it. |
| Payments | Stripe | Hosted Checkout first (fastest path to PCI-safe), Payment Elements later for an on-site flow. Webhooks are the source of truth for payment state. |
| Auth | Auth.js v5 | Email+password and OAuth, sessions in Postgres. Guest checkout must work without an account. |
| UI | Tailwind + shadcn/ui | Own the components; no theme lock-in. |
| Images | Object storage (R2/S3) + `next/image` | Product photos are the bulk of page weight. |
| Hosting | Vercel + managed Postgres (Neon/Supabase) | Use a connection pooler — serverless functions exhaust direct Postgres connections. |

## Surfaces

1. **Storefront** — catalog, product detail with variant picker, cart, checkout, order lookup.
2. **Admin** — products/variants, inventory, orders, fulfillment, discounts. Budget roughly half the total effort here; it always gets underestimated.
3. **Webhook + job layer** — Stripe events, email, inventory reservation expiry.

## Decisions that are load-bearing

### Money is integer minor units
Every amount is `integer` cents plus an ISO currency code. No floats, no `decimal` in app code. `19.99` becomes `1999`. This one is not up for debate — float arithmetic on money produces off-by-a-cent bugs that surface in reconciliation months later.

### Product vs Variant
The **variant** is the thing that has a price, a SKU, and stock. The **product** is a marketing wrapper (title, description, images, slug). A product with no options still has exactly one variant. Options (`Size`, `Color`) are modeled as `option_types` → `option_values`, with `variant_options` joining a variant to one value per type. This means the variant matrix is data, not code, and adding a third option later requires no migration.

### Orders snapshot everything
`order_items` copies the product title, variant title, SKU, and unit price at purchase time. It keeps a nullable FK to the variant for reporting, but never joins to it for display. Products get renamed, repriced, and deleted; a two-year-old invoice must still render exactly what the customer bought.

### Inventory is on_hand minus reserved
`available = on_hand - reserved`. Adding to cart creates a row in `inventory_reservations` with an `expires_at`; a sweeper releases stale ones. Every decrement goes through the `claim_stock()` function in `schema.sql`, which guards the `UPDATE` on available quantity and chains the ledger insert off its `RETURNING`, so the two can't come apart. Do not write them as separate statements: the guard can filter the row out while the following insert still records a sale that never happened. Verified against Postgres 16 — two transactions racing for one unit give one sale, one ledger row, and one honest out-of-stock error, never a negative balance. All movements append to `inventory_ledger`, so stock is auditable rather than just a mutable number.

### Webhooks are idempotent
Stripe retries, and will deliver the same event twice. Every event's `provider_event_id` is inserted into `webhook_events` with a unique constraint before processing; a duplicate hits the constraint and is dropped. Order fulfillment is driven by `checkout.session.completed` / `payment_intent.succeeded` arriving at the webhook, **never** by the browser returning to the success page — the customer closes the tab, the network drops, and you'd lose the order.

### Order state is three independent fields
`status` (pending/open/cancelled), `payment_status` (unpaid/authorized/paid/partially_refunded/refunded), and `fulfillment_status` (unfulfilled/partial/fulfilled). One combined enum collapses under the first partial refund of a partially shipped order.

## Deliberately deferred

Tax starts as a flat per-zone rate; swap in Stripe Tax or TaxJar before you sell across borders for real. Search starts as Postgres full-text and moves to Typesense/Meilisearch when the catalog outgrows it. No multi-currency, no multi-vendor, no i18n in v1 — each is a schema change, so they are noted here as known future work rather than pretended away.

## Build order

1. Schema + migrations, seeded with real-looking products
2. Catalog and product detail (read-only storefront)
3. Cart with reservations
4. Stripe Checkout + webhook → order creation
5. Admin: products, variants, inventory
6. Admin: orders and fulfillment
7. Accounts, order history, transactional email
8. Discounts, shipping rates, analytics
