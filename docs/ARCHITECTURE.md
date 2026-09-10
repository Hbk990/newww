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
Every amount is `integer` cents. The store's single currency lives in `store_settings`; No floats, no `decimal` in app code. orders and payments still carry their own currency column, because those are snapshots that must reconcile against Stripe. `19.99` becomes `1999`. This one is not up for debate — float arithmetic on money produces off-by-a-cent bugs that surface in reconciliation months later.

### Product vs Variant
The **variant** is the thing that has a price, a SKU, and stock. The **product** is a marketing wrapper (title, description, images, slug). A product with no options still has exactly one variant. Options (`Size`, `Color`) are modeled as `option_types` → `option_values`, with `variant_options` joining a variant to one value per type. This means the variant matrix is data, not code, and adding a third option later requires no migration.

### The CSV is reference data, not an import source
The 1,155-line export is wholesale stock with known gaps: no real quantities,
descriptions on 2% of rows, and some fields simply wrong. Products will be
created **one at a time by hand**, with quantities and copy written as they go.

So there is no bulk product importer. What the export is genuinely good for is
*reference data*, and that gets seeded:

- **48 categories under 9 groups** — the taxonomy, minus the fixes below
- **226 brands** — as real `brands` rows with their own pages
- **~101 device models** — normalized into `device_brands` / `device_models`, the
  vocabulary behind "Shop by device"
- **the 1,155 lines themselves** into `source_products`, purely so the admin's
  new-product form can search them and prefill name, brand, category, cost and
  image rather than retyping. Every prefilled field stays editable, because the
  source data is not trusted.

This makes the **admin product form the first thing worth building**, not the
storefront: nothing can be displayed until products exist, and they arrive one
by one. It needs to be fast to use — variant matrix generation, image upload,
device fitment picker, quantity, and price with margin shown against cost.

`variants` carries both `price_cents` and `cost_cents` for that reason: cost from
the wholesale line, retail price set by hand. Never expose `cost_cents` on the
storefront.

Two consequences for the storefront: category pages, menus and device pages must
be driven by "has published products", never by the tree existing, or the store
will show dozens of dead ends while the catalog fills up. And because real
quantities are coming, inventory tracks properly from day one —
`track = true, policy = 'deny'`, the schema defaults — rather than the
always-in-stock behaviour of the current site.

### Orders snapshot everything
`order_items` copies the product title, variant title, SKU, and unit price at purchase time. It keeps a nullable FK to the variant for reporting, but never joins to it for display. Products get renamed, repriced, and deleted; a two-year-old invoice must still render exactly what the customer bought.

### Inventory is on_hand minus reserved
`available = on_hand - reserved`. Adding to cart creates a row in `inventory_reservations` with an `expires_at`; a sweeper releases stale ones. Every decrement goes through the `claim_stock()` function in `schema.sql`, which guards the `UPDATE` on available quantity and chains the ledger insert off its `RETURNING`, so the two can't come apart. Do not write them as separate statements: the guard can filter the row out while the following insert still records a sale that never happened. Verified against Postgres 16 — two transactions racing for one unit give one sale, one ledger row, and one honest out-of-stock error, never a negative balance. All movements append to `inventory_ledger`, so stock is auditable rather than just a mutable number.

### Webhooks are idempotent
Stripe retries, and will deliver the same event twice. Every event's `provider_event_id` is inserted into `webhook_events` with a unique constraint before processing; a duplicate hits the constraint and is dropped. Order fulfillment is driven by `checkout.session.completed` / `payment_intent.succeeded` arriving at the webhook, **never** by the browser returning to the success page — the customer closes the tab, the network drops, and you'd lose the order.

### Order state is three independent fields
`status` (pending/open/cancelled), `payment_status` (unpaid/authorized/paid/partially_refunded/refunded), and `fulfillment_status` (unfulfilled/partial/fulfilled). One combined enum collapses under the first partial refund of a partially shipped order.

## Deliberately deferred

Retail only, one currency, one country — decided, not deferred. That kills
multi-currency, customer groups and wholesale tiers from v1; the empty
`tiers_json` column in the export suggests trade pricing was once intended, so if
that comes back it is a real schema change (customer groups plus a per-tier price
table), not a config flag.

Tax is a flat rate in `store_settings`; swap in Stripe Tax before selling across
borders. Search starts as Postgres full-text and moves to Typesense/Meilisearch
when the catalog outgrows it. No multi-vendor and no i18n in v1.

The Vape category (4 products, the only users of `flavors_json`) is excluded from
the import: age-restricted and commonly refused by payment processors. Nothing in
the schema prevents adding it later.

## Build order

1. Schema + migrations
2. Seed reference data: categories, brands, device models, and the source lines
3. Admin product form — create a product with variants, quantity, price, images
4. Catalog and product detail (read-only storefront)
5. Cart with reservations
6. Stripe Checkout + webhook → order creation
7. Admin: products, variants, inventory
8. Admin: orders and fulfillment
9. Accounts, order history, transactional email
10. Discounts, shipping rates, analytics
