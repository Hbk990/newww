# Ecommerce Platform — Architecture

Custom storefront + admin for **physical goods with variants**.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript | Server Components render product pages on the server: fast LCP and real SEO without a separate API tier. Server Actions cover cart/checkout mutations. |
| Database | Postgres | Orders, variants, and inventory are deeply relational and need real transactions. Non-negotiable. |
| ORM | Drizzle | SQL-shaped, typed, migrations are plain SQL you can read. Postgres row locking (`FOR UPDATE`) is reachable, which the inventory logic needs. Prisma is a fine swap if you prefer it. |
| Payments | **Cash on Delivery only** | Stripe does not operate in Lebanon, and COD is the only method for v1. No gateway, no PCI scope, no card data, no payment webhooks — a large amount of the usual ecommerce complexity simply does not exist here. |
| Auth | Hand-rolled cookie sessions + Google One Tap | A handful of staff and email/Google customers do not need Auth.js's machinery. Argon2id passwords, opaque session tokens stored hashed in Postgres, Google identity verified from an ID token. Guest checkout must keep working without an account. |
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

### Inventory is availability first, quantities only where they are wanted
This is a wholesale business, and the shelf stock serves trade customers as well
as the website — so a number on a product would not mean "how many the site may
sell". `inventory.track` therefore defaults to **false**, and `available` is a
switch someone flips. Nothing is counted, a sale decrements nothing, and selling
something switched off is refused.

Turning `track` on for a variant brings the counted machinery below to life for
that variant alone. Both modes coexist per variant on purpose: the few lines
worth counting can be counted without forcing a number onto the other 1,900.

### Where quantities are tracked, inventory is on_hand minus reserved
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

## Authentication

Server-side sessions in Postgres, not a signed stateless cookie. A JWT cannot be
revoked, and both "sign out on all devices" and locking out a compromised staff
account need a row to delete. That is the whole reason for the choice.

**The cookie holds an opaque random token; the database holds its SHA-256.** A
leaked backup then contains no usable sessions. SHA-256 rather than Argon2 here
because the token is 256 bits of randomness — there is nothing to brute-force,
and every request would otherwise pay for a deliberately slow hash. Passwords
are the opposite case and use Argon2id.

**Two ways in, one account.** Email plus password, and Google One Tap. Google
Identity Services is free at any volume and returns an ID token we verify
against Google's JWKS — no redirect flow, no refresh tokens, because we only
ever want identity. `userIdentities` is a separate table rather than a
`google_id` column so someone who registered by email and later clicks Sign in
with Google lands in the same account instead of a duplicate. Identity is keyed
on Google's `sub`, never on email: people change addresses, and `sub` is the
only durable handle.

**Username is mandatory in the app, nullable in the database.** Google gives an
email and a display name, never a username, so a Google account exists for the
moment between verifying the ID token and the person choosing one. The
alternatives are worse — holding a half-authenticated identity in a cookie, or
generating a placeholder that leaks into URLs and then has to be changed. The
row is created without one and every authenticated route is gated until it is
set, so anything reading `username` must handle null.

**Email verification is mandatory for email registration and skipped for
Google.** Google's ID token carries `email_verified`; emailing a code to confirm
what Google already confirmed proves nothing and costs sign-ups.

**A six-digit code is protected by attempts and expiry, not by its hash.** Ten
to the sixth is exhaustible instantly by anyone holding the database, so the
hash only keeps codes out of backups and logs in usable form. The controls are
the attempt counter, a ten-minute expiry, and rate limiting on the endpoint.

**Case-insensitive uniqueness is enforced by the database**, on `lower(email)`
and `lower(username)`. Relying on the application to lowercase first means one
missed path creates `Ali` and `ali` as separate accounts — and lets a victim's
address be re-registered in different case, which is an account-takeover
vector, not just a support annoyance.

**Throttling counts attempts per identifier and per IP.** They are different
attacks: many passwords against one account, versus one common password against
many accounts. Throttling by account alone misses the second completely.

## Keeping it fast

Speed here is mostly a data-access problem, not a rendering one. Four decisions
carry it:

### The listing read model
A category page row needs "from $4.50", a thumbnail and a variant count. Derived
per row, that means joining `products → variants → product_images` and
aggregating, and the aggregate's cost grows with the catalog rather than with
the page size — no index removes it. So `products` carries `min_price_cents`,
`max_price_cents`, `variant_count` and `primary_image_url`, maintained by
trigger.

Measured against 1,200 products and 1,900 variants — roughly the projected
catalog — averaged over 200 runs:

| Query | Naive join + aggregate | Read model |
|---|---|---|
| One category page, cheapest first | 0.765 ms | **0.236 ms** |
| Whole catalog, cheapest first | 1.379 ms | **0.040 ms** |

The absolute numbers are small either way at this size; the plan is the point.
The naive version aggregates every matching product before it can sort, so it
gets slower as the catalog grows. The read model walks a partial index and stops
at 24 rows — `Index Scan using products_live_price_idx`, no sort node — so it
costs the same at 1,200 products as at 50,000.

### Partial indexes on what is actually visible
A storefront query only ever looks at published products, so the indexes behind
listings are `where status = 'active'`. Drafts and archived rows stay out of the
index entirely, which keeps it small enough to stay cached.

### Rollups instead of traversals
`product_device_fit` exists so a "Shop by device" page is one indexed lookup
rather than a join through every variant of every product. Smart collections
resolve their rules into rows at write time rather than being evaluated per
request. In both cases the write side absorbs the work so the read side does
almost none.

### Category attributes are assigned once and inherit downward
`attribute_definitions` holds the specs that are filterable but are not variant
axes — wattage, mAh, material. `category_attributes` attaches them to a
category, and because the eight parent groups are themselves rows in
`categories`, an attribute attached to a group covers every child under it.
Resolution is the `attributes_for_category()` function: a recursive walk up
`parent_id` where the nearest assignment wins, so a child that re-declares an
attribute overrides its group's `is_required` and `position` instead of showing
it twice. The returned `inherited` flag is what lets the admin grey out a row
and say where it came from.

Without this the owner would attach every attribute to all 52 leaf categories
by hand and keep 52 rows in sync forever. The walk is bounded to ten levels:
`parent_id` is self-referencing with nothing preventing a cycle, and a cycle
would otherwise spin the query forever rather than return.

### Server rendering, and no client fetching for catalog pages
Product and category pages are Server Components reading Postgres directly —
no API round trip, no client-side data fetch, no loading spinner, and no JSON
payload for data that was already on the server. Cache them and revalidate on
publish rather than per request; the catalog changes when someone edits it, not
continuously. Ship as little client JavaScript as possible: interactivity is the
variant picker, the cart and search, and nothing else needs it.

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

## Writing a migration

Run `drizzle-kit generate` **first**, then edit the SQL it produced — never the
other way round. The generator diffs the TypeScript schema against
`drizzle/meta/*_snapshot.json`, not against the database, so a hand-written
migration leaves the snapshot stale and the next `generate` re-emits everything
it missed. That is what 0016 and 0018 exist to repair; generating first means
no such file is ever needed again.

Then add by hand what Drizzle cannot express, because it will silently omit all
of it:

- composite foreign keys — `product_attributes (attribute_id, option_id)` and
  `option_values (option_type_id, kind)`
- `NULLS NOT DISTINCT` on a unique index — load-bearing on
  `product_attributes_value_uq`
- triggers and functions, including every `trg_*` and `refresh_*` in the schema
- `ON DELETE RESTRICT` where the generator assumes the default

Read what it generates before applying it. Asked to regenerate these tables
from scratch it produces a weaker schema than the one installed, and the
difference is invisible until something that should have been refused succeeds.

Verify on two databases: one built from zero, and one upgraded over existing
rows. Several bugs here only appeared on one of the two — an enum value added
in an earlier migration is unusable in the same transaction on a fresh
database, and `SET DEFAULT` changes nothing for rows that already exist.

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
