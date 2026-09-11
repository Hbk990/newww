# Product Form Decisions

Answers to all 45 product-form questions, taken 2026-09-11. Read alongside
[`DECISIONS.md`](DECISIONS.md), which this amends in places.

## The correction that matters most

> *"No quantities will be added, only availability, but keep quantity as
> optional. I am a wholesaler so not all the quantity available is only for
> retail."*

This reverses a decision made in step 3. Told then that real quantities were
coming, inventory was set to `track = true, policy = 'deny'` — count units, stop
selling at zero.

With quantities never entered, every variant sits at `on_hand = 0` with
`policy = 'deny'`, and `claim_stock` refuses **every sale**. The store would
have accepted zero orders. The bug was not visible in any test that seeded
stock by hand, which is every test written until this answer arrived.

Inventory now has two modes, chosen per variant:

- **Untracked** (the new default) — `available` is a switch someone flips.
  Nothing is counted, a sale decrements nothing, and no ledger entry is written
  because no counted stock moved. Selling something switched off is still
  refused. This is the right model for shelf stock shared with trade customers,
  where a number on the website would mislead rather than inform.
- **Tracked** — `on_hand` and `reserved` are real, a sale decrements them, and
  `policy` decides what happens at zero. Unchanged from before.

Mixing them per variant is deliberate: the handful of lines worth counting can
be counted without forcing a number onto the other 1,900. `low_stock_threshold`
and the automatic stock bands only apply to tracked variants — an uncounted one
has no quantity to compare.

Migration 0010 flips existing rows, because `ALTER COLUMN ... SET DEFAULT` only
affects new ones. Verified against a database already in the broken state: the
variant became untracked and sellable, and a sale that would have been refused
now succeeds.

## The other two notes

> *"What if variants are storage options, each storage has a different price?"*

Right, and the catalog proves it — Kingston flash at $4.50 for 32GB up to $29
for 512GB. So the sale price is **per variant**, not per product, and
copy-down-the-column is an action you choose rather than a rule the form
applies. The variant grid keeps a price per row.

> *"Don't add tax, it is already added in the selling price."*

`tax_rate_bps` is now 0 and `prices_include_tax` is true. The figure on the
product page is what the courier collects; nothing is added at checkout.

## Confirmed out, again

All six carried over unchanged: wholesale pricing, barcodes, suppliers,
warranty, CSV import, and field-level permissions. Also declined: shelf/bin
location, in-browser cropping, scheduled publishing, minimum/maximum order
quantity, product rollback, weight and dimensions, and auto-generated SKUs.

`variants.weight_grams` and `shipping_rates.max_weight_grams` are now unused —
delivery is a flat fee per zone. Left in place rather than dropped; they cost
nothing and weight-based rates are a plausible later change.

## Schema changes from these answers

| Change | Driven by |
|---|---|
| `inventory.available`, `track` defaults to false | the wholesaler note |
| `claim_stock` and `refresh_product_stock` rewritten for both modes | same |
| `product_status` gains `discontinued` | Q35 |
| `relation_kind` gains `alternative` | Q40 |
| `variants.sale_price_cents` + `sale_starts_at` + `sale_ends_at` | Q20 |
| `products.is_featured`, `tags`, `internal_note`, `min_allowed_price_cents` | Q42, Q43, Q19 |
| `device_groups`, `device_group_models` | Q14 |
| `attribute_options` | Q16 |
| `price_history` + its trigger | Q37 |
| `store_settings` tax to 0 and inclusive | Q21 |
| GIN index on `products.tags` | Q43 |

A sale window must have all three columns or none — a check constraint, because
a start with no end is ambiguous about when the price applies. Sale prices are
resolved at read time rather than by a job rewriting `price_cents`, so a sale
that ends cannot leave a stale price behind.

`price_history` is written by trigger, so a price cannot change without being
recorded — including from a script or psql. The actor comes from a session
variable the application sets inside the transaction:

```sql
select set_config('app.actor_id', $1, true);
```

`SET LOCAL app.actor_id = ...` will not do: it takes a literal, not an
expression. A change with no actor set still records, with no attribution,
rather than failing.

## Two answers that will cost you time

**Q27, fast-entry mode: declined.** One full form for all 200+ products.

**Q10, SKUs typed by hand**, combined with **Q07, the bulk variant generator**.
Generating 60 variants for a 15-colour × 4-device cover means typing 60 SKUs.
`variants.sku` is nullable and uniquely indexed, so the generator will leave it
blank and let you fill in only the ones you care about — but if you want every
variant to carry a SKU, that is 60 fields per product like that one.

Both are recorded, not disputed. Raise it again if entry starts to hurt and
either is a small change.

## Q16 — the attribute builder is being built

Chosen against the recommendation, with a reason: *"Keep the easiest way for
admin to use this feature."* So the bar is ease of use, not
configurability-for-its-own-sake. `attribute_definitions`,
`category_attributes`, `attribute_options` and `product_attributes` already
carry the data model; what remains is an admin screen where defining
"Material → dropdown → Silicone / TPU / Leather" takes a few seconds and the
product form picks it up with no further work.
