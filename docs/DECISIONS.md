# Feature Decisions

Answers to all 58 feature questions, taken 2026-09-10 from the decision
questionnaire. This is the build contract: if something is marked **Out**, it is
not being built, and the schema should not carry tables for it.

**44 in, 14 out.**

## What was cut, and why it matters

Four of the fourteen were the expensive ones:

- **Point of sale** (Q37) — a second application on the same database. Cut.
- **Suppliers, purchase orders and stock receiving** (Q8) — a second admin app. Cut.
- **Loyalty points and referrals** (Q27) — a subsystem customers audit themselves. Cut.
- **Bilingual Arabic/English** (Q53) — English only, so no translation tables and
  no right-to-left layout. This is the one cut that is materially more expensive
  to reverse later; noted rather than argued.

Also out: barcodes and scanning (Q5, Q38), reorder recommendations (Q7),
printable invoices (Q22), one-click reorder (Q26), warranty tracking (Q28),
product Q&A (Q30), receipts and cash reconciliation (Q40), store pickup (Q41),
QR codes (Q54), two-factor auth (Q57).

Four answers confirmed what is already built, with no change needed: retail-only
pricing (Q1), Cash on Delivery everywhere (Q39), courier companies rather than
own drivers (Q42), and `customer` / `staff` / `admin` roles (Q55).

## Schema changes these answers require

### Enum changes

| Enum | Change | Driven by |
|---|---|---|
| `order_status` | Expand to the nine-status lifecycle | Q19 |
| `discount_kind` | Add `buy_x_get_y` and `quantity_break` | Q33 |

`payment_method` stays `['cod']` (Q39) and `user_role` stays three values (Q55).

### New columns

| Table | Column | Driven by |
|---|---|---|
| `inventory` | `low_stock_threshold` | Q4 |
| `products` | `sales_count` — read model, trigger-maintained from `order_items` | Q13, Q35 |
| `orders` | `customer_note` | Q17 |
| `orders` | `source` — `web` or `whatsapp`, so WhatsApp orders are countable | Q15 |
| `addresses` | `building`, `floor`, `latitude`, `longitude` | Q43 |
| `carts` | `reminder_sent_at` — so a cart is chased once, not nightly | Q16 |
| `store_settings` | `is_private` — the noindex switch | Q51 |

### New tables

| Table | Purpose | Driven by |
|---|---|---|
| `customer_devices` | The phones a customer saves, for automatic fitment | Q10 |
| `wishlists` | Favourites, and the count behind "Most Wishlisted" | Q25 |
| `recently_viewed` | Per-customer view history | Q25 |
| `reviews`, `review_images` | Verified-purchaser reviews with moderation state | Q29 |
| `product_relations` | Manual "goes with this" pairings | Q31 |
| `bundles`, `bundle_items` | Protection Pack, Car Bundle | Q32 |
| `stock_alerts` | Back-in-stock and price-drop subscriptions | Q36 |
| `stock_counts`, `stock_count_items` | Physical counting sessions | Q6 |
| `audit_log` | Who changed a price, stock, order or setting, and the old value | Q21, Q56 |
| `notifications` | Queued and sent email, with delivery state | Q44, Q45 |

### Functions and extensions

- `next_order_number()` rewritten to produce `DR-YYYYMMDD-#####` (Q20). Still
  gapless, still from `store_settings`, but the sequence resets per day.
- `pg_trgm` extension plus GIN trigram indexes on product title, SKU and brand,
  for autocomplete and typo tolerance (Q12).
- A trigger maintaining `products.sales_count` from `order_items`, on the same
  pattern as the existing read model (Q13).

### Already built, no change

`product_attributes` for spec filters (Q14), device fitment and its rollup
(Q9, Q11), `users` and `addresses` for accounts (Q24), refunds and stock return
for the returns workflow (Q23), `starts_at` / `ends_at` for flash sales (Q34),
and smart collections for New Arrivals (Q35).

## The one answer that conflicts with the current design

Q19 asked for all nine order statuses: New, Confirmed, Preparing, Ready, Out for
Delivery, Delivered, Cancelled, Returned, Refunded.

The schema currently splits order state three ways — `status`, `payment_status`,
`fulfillment_status` — precisely so that a partial refund of a partially shipped
order stays expressible. Four of the nine requested values overlap those other
two fields: Preparing, Ready, Out for Delivery and Delivered are fulfillment
progress, and Refunded is a payment state.

Collapsing all nine into one enum would reintroduce the problem the split
avoids. So:

- **`order_status` carries the eight operational values** — `new`, `confirmed`,
  `preparing`, `ready`, `out_for_delivery`, `delivered`, `cancelled`,
  `returned`. That is the status staff set and see, and it covers the whole
  physical journey.
- **`payment_status` keeps `refunded`**, because it is a fact about money, not
  about where the parcel is. A refunded order also carries `returned` or
  `cancelled`, which is what actually happened to the goods.
- **`fulfillment_status` stays** for the partial-shipment case, which
  `fulfillment_items` already supports.

The result is all nine labels available to staff, with money and goods still
tracked separately. If the preference is genuinely one flat nine-value enum,
say so and it changes.

## Consequences worth stating plainly

**Exporting without importing (Q46).** Bulk import and bulk edits were declined
in favour of export only, so all 200+ products are entered by hand, one at a
time. Duplicate-a-product (Q47) was accepted and helps considerably for
near-identical covers, but this remains the largest single time cost in the
project. The offer stands if it starts to hurt.

**No printable delivery slip (Q22).** Couriers taking Cash on Delivery normally
carry a slip showing the items and the amount to collect. Worth revisiting the
first time a courier asks for one.

**No two-factor auth (Q57).** An admin login reaches the whole business. Rate
limiting and login throttling are still in scope and mitigate the common attack;
this is noted, not disputed.

**SEO needs content (Q50).** Full SEO groundwork was accepted, but only 27 of
1,155 products have any description. Sitemaps and structured data cannot rank
pages that have nothing on them.

**Email-only notifications (Q44).** Chosen over WhatsApp templates and SMS. It
is free and simple; open rates in this market are lower than WhatsApp, so
abandoned-cart recovery (Q16) and back-in-stock alerts (Q36) will convert less
well than they would on WhatsApp. Adding a channel later is additive — the
`notifications` table is not email-specific.

## Revised build order

1. ~~Scaffold and database wiring~~ — done
2. ~~Schema: catalog, taxonomy, commerce~~ — done
3. **Schema amendments from these answers** — the enums, columns and tables above
4. Seed reference data: categories, brands, device models
5. Auth and admin shell
6. Product form, duplicate-product, basic image upload
7. Storefront: catalog, product pages, "Choose your device"
8. Cart, COD checkout, WhatsApp order link, confirmation queue
9. Admin: orders, returns, stock adjustments and counts, audit log
10. Accounts, My Devices, wishlist, recently viewed
11. Promotions: bundles, Buy X Get Y, flash sales, cross-sell
12. Reviews, notifications, alerts, dashboard KPIs
13. SEO, image pipeline and CDN, PWA
14. Backups with a tested restore, and the health panel
