# Ecommerce Platform — Architecture

Custom storefront + admin for **physical goods with variants**.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript | Server Components render product pages on the server: fast LCP and real SEO without a separate API tier. Server Actions cover cart/checkout mutations. |
| Database | Postgres | Orders, variants, and inventory are deeply relational and need real transactions. Non-negotiable. |
| ORM | Drizzle | SQL-shaped, typed, migrations are plain SQL you can read. Postgres row locking (`FOR UPDATE`) is reachable, which the inventory logic needs. Prisma is a fine swap if you prefer it. |
| Payments | **Cash on Delivery only** | Stripe does not operate in Lebanon, and COD is the only method for v1. No gateway, no PCI scope, no card data, no payment webhooks — a large amount of the usual ecommerce complexity simply does not exist here. |
| Auth | Auth.js v5 | Email+password and OAuth, sessions in Postgres. Guest checkout must work without an account. |
| UI | Tailwind + shadcn/ui | Own the components; no theme lock-in. |
| Images | Object storage (R2/S3) + `next/image` | Product photos are the bulk of page weight. |
| Hosting | Vercel + managed Postgres (Neon/Supabase) | Use a connection pooler — serverless functions exhaust direct Postgres connections. Pick an EU region: it is the closest low-latency option to Lebanon. |

## Surfaces

1. **Storefront** — catalog, product detail with variant picker, cart, checkout, order lookup.
2. **Admin** — products/variants, inventory, orders, fulfillment, discounts. Budget roughly half the total effort here; it always gets underestimated.
3. **Job layer** — inventory reservation expiry, confirmation-call queue,
   transactional email/SMS. No inbound webhooks: nothing calls us.

## Decisions that are load-bearing

### Money is integer minor units
Every amount is `integer` cents — no floats, no `decimal` in app code. The store's single currency lives in `store_settings`, but orders and payments still carry their own currency column, because those are snapshots that must survive a settings change and reconcile against the gateway. `19.99` becomes `1999`. This one is not up for debate — float arithmetic on money produces off-by-a-cent bugs that surface in reconciliation months later.

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

### Cash on Delivery removes the hard parts, and adds different ones
No gateway means no PCI scope, no tokenization, no card data, no
authorize-then-capture, no payment webhooks, and no idempotency guard for
callbacks. Checkout writes an order and ends. That deletes most of what makes
ecommerce checkout risky.

What replaces it is operational, and the schema has to carry it:

**An order is a promise, not a payment.** It is created `payment_status =
'unpaid'` and stays that way until a courier hands over cash, which is what
creates the `payments` row. The absence of a row is the meaningful state, so
never infer paid-ness from the order existing.

**Confirmation gates dispatch.** `order_status` runs `pending → confirmed →`
(dispatch), where confirming means someone phoned the customer.
`confirm_attempts` and `confirmed_by` exist because that call is a real queue
someone works through, and skipping it means paying couriers to deliver parcels
nobody accepts.

**Refused delivery is a normal path, not an edge case.** Goods come back, stock
returns via an `inventory_ledger` row with reason `refused_delivery`, and the
order is cancelled unpaid. Card-only stores never model this; here it is routine,
and it is the main cost of doing business this way.

**Fraud moves from cards to phone numbers.** There is no payment authorization to
lean on, so nothing stops a fake order except verifying the phone. Rate-limit
checkout per number, and treat SMS verification as the equivalent of a card
check.

**Money reconciles in batches.** Couriers remit periodically, so `payments`
carries `remittance_ref`, `courier` and `collected_by`. Refunds are cash out of a
till rather than a gateway call, so they record who issued them.

**Cash has no partial capture, so totals must be exact.** `total_cents` is what
the courier physically collects. `cod_fee_cents` is there if the courier's
collection fee is passed to the customer.

### Order state is three independent fields
`status` (pending/open/cancelled), `payment_status` (unpaid/authorized/paid/partially_refunded/refunded), and `fulfillment_status` (unfulfilled/partial/fulfilled). One combined enum collapses under the first partial refund of a partially shipped order.

## Selling in Lebanon

Market facts the design has to absorb, rather than discover late:

- **No Stripe, and no online payment at all in v1** — Cash on Delivery only.
  Wallets and transfer networks such as Whish Money and OMT, or card acquiring
  through a local gateway, are the natural later additions;
  `alter type payment_method add value` plus a gateway adapter is the whole
  schema cost, and `webhook_events` comes back with them.
- **Prices in USD**, matching the catalog. Some customers will want an LBP figure
  shown at a rate; that is a display-only conversion driven by a rate in
  `store_settings`, never a second price list, and never a second currency for
  settlement.
- **VAT is 11%.** A flat `tax_rate_bps` in `store_settings` covers a single-country
  store.
- **Shipping zones are governorates**, not countries: Beirut, Mount Lebanon,
  North, Akkar, South, Nabatieh, Bekaa, Baalbek-Hermel. So `shipping_zones` keys
  on regions within one country, and addresses need a usable region field —
  Lebanon has no reliable postal code coverage, so postal code cannot be
  required.
- **Delivery is local couriers**, so fulfillment needs a free-text carrier plus a
  tracking reference and, for COD, a remittance record.

## Deliberately deferred

Retail only, one currency, one country — decided, not deferred. That kills
multi-currency, customer groups and wholesale tiers from v1; the empty
`tiers_json` column in the export suggests trade pricing was once intended, so if
that comes back it is a real schema change (customer groups plus a per-tier price
table), not a config flag.

Tax is a flat 11% VAT in `store_settings`; it needs real work before selling
across borders. Search starts as Postgres full-text and moves to Typesense/Meilisearch
when the catalog outgrows it. No multi-vendor and no i18n in v1.

The Vape category (4 products, the only users of `flavors_json`) is excluded:
age-restricted. Nothing in the schema prevents adding it later.

## Build order

1. Schema + migrations
2. Seed reference data: categories, brands, device models, and the source lines
3. Admin product form — create a product with variants, quantity, price, images
4. Catalog and product detail (read-only storefront)
5. Cart with reservations
6. Checkout → order creation (COD), confirmation queue, dispatch
7. Admin: products, variants, inventory
8. Admin: orders and fulfillment
9. Accounts, order history, transactional email
10. Discounts, shipping rates, analytics
