# What is left to build

Written after the storefront shell was finished. Ordered by what a customer
notices first, then by what the shop cannot run without.

For credentials, prices and content that only exist outside this repository,
see `LAUNCH.md` — none of that is in this file.

## Done

Enough to place a real order end to end:

| | |
|---|---|
| Catalog | products, variants, options, inventory in two modes, price history, attributes, devices and fitment |
| Storefront | homepage, header with mega-menu, category and group listings, search, shop-by-phone, product page, basket, checkout, thank-you |
| Accounts | register, verify, sign in, Google, forgotten password, addresses, saved phones, wishlist, recently viewed, order history, reorder |
| Orders | one-transaction creation with idempotency, stock claim, reservations with TTL, COD totals, shipping zones |
| Admin | products, variants, images, attributes, categories, brands, devices, orders, stock, shipping, settings, audit trail, staff permissions, re-auth |
| Gate | 73 browser tests, 84 unit tests, typecheck and lint clean, CI on every push |

## Frontend — customer-facing

### 1. The filter sheet

Chosen on the design review page and not yet built. Listings currently sort
four ways and filter on in-stock; there is no sheet.

The data supports phone model, brand, category, price band and in-stock. One
"Filter" button opening a sheet, per the decision — keep the state in the URL
as the sort already is, so a filtered listing can be shared and survives a
reload.

### 2. Reviews

Nothing in `src/lib` touches reviews; the `reviews` and `review_images` tables
exist and are empty. Three pieces:

- **Display** on the product page: the average is already on
  `products.rating_avg`, maintained by trigger.
- **Submission**, restricted to a customer with a delivered order containing
  that product — a "verified purchase" claim has to be true.
- **Moderation** in the admin: `/admin/reviews` is a stub.

Decide first: are reviews published immediately or held for approval? The
schema supports both.

### 3. Related products

Needs a rule before it needs code. Three candidates, in order of usefulness
for this catalog: same fitment (a case and a protector for the same phone),
same category and brand, and bought-together once there are orders to learn
from. Nothing is recorded for this yet.

### 4. Bundles

`products.is_bundle` and the bundle-component table exist;
`src/lib/merchandising` does not. A bundle is a product whose components are
variants, so the work is pricing (fixed or a discount off the sum), stock (a
bundle is only in stock when every component is), and the page treatment.

### 5. Product page leftovers

- The **recently viewed** strip: the loader takes an `exclude` argument that
  exists for this page, and only the homepage uses it.
- **Photo zoom** and a real gallery, which is worth doing only once photos
  exist.
- `next/image` instead of the plain `<img>` and its placeholder fallback, for
  the same reason — it needs dimensions, which the imported rows do not have.

### 6. Policy pages

Returns, delivery and privacy. The footer deliberately links to none of them
rather than pointing at pages that do not exist. The words are yours; the
pages are half an hour.

### 7. Self-service cancellation

Deliberately not built. The status machine allows a cancel while the parcel is
still with the shop, and the order page says "call us while it is still with
us" instead. Whether a customer may cancel their own order, and up to which
point, is a policy decision rather than a technical one.

## Backend — admin-facing

Nine screens, in the order the shop will feel their absence. Each has a stub
page and a permission already wired into the sidebar.

### 1. Dispatch records

Who is carrying which orders today. `orders.status` reaches
`out_for_delivery` with nothing recording who took it, so a customer asking
"where is it" cannot be answered.

### 2. Customers

`/admin/customers` and `/admin/customers/new` are stubs. One customer's
orders, addresses, saved phones and notes in one place — the screen someone
opens while on the phone to them.

### 3. Reviews moderation

Depends on the reviews decision above.

### 4. Staff

Invite, change role, deactivate. Roles and permissions exist and are enforced;
there is no screen, so staff are created in SQL today.

### 5. Audit viewer

The `audit_log` is append-only and enforced by the database, and has been
filling up since it was built. Nothing reads it.

### 6. Promotions

The `discounts` schema covers percent, fixed, free shipping, buy-x-get-y and
quantity breaks. None of it is reachable, and `orders.discount_cents` is
always zero.

### 7. Stock counts

The `stocktake` tables exist for counting shelves against the system and
writing the difference as an adjustment with a reason.

### 8. Dashboard, admin search, alerts

Today's orders, what needs calling, what is low on stock. The `alerts` table
exists for low-stock and failed-job notices.

### 9. Merchandising

Collections, homepage placement, featured products. `is_featured` is on every
product and set on none.

## Backend — plumbing, not screens

### Order confirmation email

**The biggest gap in the list.** A customer places an order and receives
nothing. `src/lib/mail` has exactly one template, for verification codes.
Needed: an order confirmation to the customer, and a notification to the shop
so nobody has to watch the admin to know a new order arrived.

### Catalog import

The real catalog needs a script: read the CSV, match against the seeded
categories, brands and devices, create products and variants, and report what
it could not place. `seed/derive-from-export.py` did this once for reference
data and is the starting point.

### Image storage driver

`STORAGE_DRIVER=local` writes to `public/uploads`, which a serverless host
wipes on deploy. One file in `src/lib/storage/` for S3 or R2. Also in
`LAUNCH.md`, because it blocks the catalog.

### Order events

`order_events` exists and nothing writes to it. It is what a customer-facing
timeline ("confirmed at 14:20, out for delivery at 16:05") and any dispute
would be built from.

### Reservation sweeping

`/api/cron/expire-reservations` works and needs a schedule and `CRON_SECRET`.
See `LAUNCH.md`.

## Suggested order

1. **Order confirmation email** — the shop currently goes quiet after the one
   moment a customer most wants to hear from it.
2. **Dispatch records** and the **customers screen** — the two things staff
   need to answer a phone call.
3. **The filter sheet** — 1,200 products with four sorts and no filters.
4. **Reviews**, end to end.
5. **Promotions**, once there is traffic to promote to.
6. Everything else.

Two of these are gated on you rather than on work: the reviews moderation
decision, and the real catalog CSV with photos.
