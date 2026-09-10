# Catalog Analysis — DRPHONE export, 2026-09-10

Source: `DRPHONEcatalog20260910.csv` — 1,155 products, 23 columns, 9 category groups,
48 categories, 226 brands. Findings below drive the schema changes in Part 2 of
`schema.sql`.

## The taxonomy is already two levels

| Group | Products | Largest categories |
|---|---|---|
| Mobile Accessories & Power | 307 | Charge & Cable 90, Holder & Stand 75, Power Bank 45, Converter 40 |
| Audio & Wearables | 222 | Speaker 48, Airpods 44, Microphone 37, Smart Watch 32 |
| Gaming & Computers | 176 | Keyboard & Mouse 49, Gaming Accessories 49, Razer 34, HyperX 23 |
| Toys, Lifestyle & Misc | 143 | Mix Product 90, Bag 29, Toys 20, Vape 4 |
| Home & Personal Care | 142 | Light 59, Hair Trimmer 23, Blower & Fan 22 |
| Cameras, Security & Projection | 93 | Tripod & Gimbal 30, Digital & Action Camera 25, IP Camera 22 |
| Storage, Network & TV | 45 | Network 23, Flash & Memory 15, TV Box 7 |
| Car Electronics | 23 | FM Transmitter 12, Jump Starter 11 |
| Other | 4 | Tablet 4 |

`category` → `category_slug` is cleanly 1:1, so the existing groups and categories
import directly as a two-level tree. Depth 2 is enough today; the schema uses a
self-referencing `parent_id` so it isn't capped there.

## Findings that change the design

### 1. Price lives on the variant — the data proves it

44 products have a blank `price`. 43 products have a non-empty `options_json`.
The overlap is exact: **every blank-price product carries priced options, and no
product has both a price and options.** The existing system already treats price
as belonging to the sellable option, not the product. Our `variants.price_cents`
model matches this exactly, with one improvement: for the 1,111 single-price
products we generate one default variant instead of leaving price in two places.

(The 44th is `DR-000894` "Steam Controller" — no price, no options. That's a
data-entry gap, not a pattern; it needs a price before launch.)

### 2. `options_json` is four different axes flattened into one untyped list

The same column carries semantically distinct things:

| Real axis | Example values | Where |
|---|---|---|
| **Device fit** | `16 Pro Max`, `S25 Ultra`, `Ipad 11 A16`, `Redmi Note 14` | Cover, Screen Protector, Glass Tab |
| **Capacity** | `32GB` … `512GB`, `8GB/1Ram` | Flash & Memory, TV Box |
| **Connector** | `Lighting`, `Type-C`, `Micro` | Charge & Cable |
| **Color** | `Black`, `White`, `Pink` | HyperX, Fitbit |

Flattening these is why the current site can't filter by "fits my phone". The
schema gives `option_types` a `kind` enum, so the picker can render a color
swatch, a capacity dropdown, and a device selector differently, and the device
axis becomes filterable.

### 3. Device compatibility deserves its own taxonomy

101 distinct device-fit labels appear across the option lists — `16 Pro Max` (10
products), `15 Pro Max` (9), `S25 Ultra` (6). They're free text today, so
`17 Pro Max`, `17 pro Max`, and `17 PRO MAX` are three different values, and
`17 Pro / 18 Pro` is one string meaning two devices.

For a phone-accessory store this is the primary way customers shop: *"what fits my
phone?"* So device models become real rows (`device_brands` → `device_models`) and
a variant declares fitment via a join table. That gives you a "Shop by device"
landing page per model — high-intent, long-tail SEO — and lets one variant fit
several models without string parsing.

### 4. Two axes are genuinely needed

22 products have both multiple real colors and multiple options. `DR-001202`
"Cover - Silicon With Lens & Strap" has 15 colors × 4 device fits. A single flat
option list cannot express that; the `variant_options` matrix can. Projected
volume: **~1,900 variants from 1,155 products.**

Note the overlap: for the HyperX and Fitbit rows, `colors_json` and `options_json`
hold the *same* values, because color was the priced axis. Import must collapse
those into one Color axis rather than producing a 2×2 matrix of which half is
invalid.

### 5. "Standard" is a null in disguise

`colors_json` is populated on all 1,155 rows, but 901 (78%) are exactly
`["Standard"]` — a placeholder meaning "no color choice". Import drops it: those
products get one option-less default variant. Real colors: Black 148, White 104,
Blue 55, Pink 37. 156 products offer more than one.

### 6. There is no inventory data at all

`stock` is `in-stock` on all 1,155 rows. `stock_quantity` is 0 or blank on all of
them. `tiers_json`, `variant_stock_json`, and `variant_quantity_json` are empty on
every row — declared columns that were never used. `restocked_at` is empty
throughout.

So the reservation and ledger machinery in the schema starts from zero: import
seeds `on_hand = 0` with `policy = 'continue'` (keep selling), which preserves
today's behaviour exactly. Switching a category to `policy = 'deny'` is then a
per-product decision you make as real counts arrive, not a migration.

### 7. Content is the real launch blocker

`details` is non-empty on **27 of 1,155** products (2%). Every product has a main
image, but only 152 have any additional images, and the one populated `details`
example is a bare compatibility list: `"Ipad 11 Ipad 10 A9+ A9 A11 S10FE"`.

No product descriptions means no organic search traffic and weak conversion. The
schema is ready for it; someone has to write it. The device-fit taxonomy helps
here — a fitment table renders better than prose and generates itself.

### 8. Taxonomy problems worth fixing during import

- **Brands used as categories.** `Razer` (34 products, all brand Razer) and
  `HyperX` (23, all brand HyperX) are categories. They're brands. Their products
  are really Headphones, Microphones, and Keyboard & Mouse. Two Razer products are
  already filed outside the Razer category, so the tree is inconsistent with
  itself. Fix: promote brands to first-class entities with their own pages, and
  refile these 57 products by product type.
- **`Mix Product` is a junk drawer** — 90 products (8% of the catalog): humidifiers,
  night lights, walkie-talkies, seat cushions, camping chairs, makeup mirrors. It
  is unbrowsable and unfilterable. It needs splitting into real categories.
- **67 products have no brand** and 13 product names are duplicated.
- **`Vape`** (4 products, the only users of `flavors_json`) is age-restricted in
  most jurisdictions and often blocked outright by payment processors. Confirm
  Stripe will accept it before building an age gate, or drop the category.

### 9. Money confirms the integer-cents rule

Prices run $0.14 to $430.00, median $15.00. All are exact cents. One row,
`DR-001148` at `16.35`, fails a naive float equality check (`16.35 * 100` is
`1634.9999…` in IEEE 754) — a live demonstration of why every amount is stored as
an integer number of cents.

The low price points and the unused `tiers_json` column both suggest wholesale or
tiered pricing was intended. Confirm before v1: retail-only, or B2B tiers?

## Import plan

1. Load `category_group` as 9 parent categories, `category` as 48 children.
2. Promote the 226 `brand` strings to `brands` rows; refile Razer/HyperX products
   by product type.
3. One product row per CSV row; `slug` from name, deduped against the 13 collisions.
4. Classify each `options_json` list into an axis kind by inspecting its labels
   (`\d+GB` → capacity; a device pattern → device fit; a colour word → color;
   otherwise `other`), flagging low-confidence cases for review.
5. Normalize device labels into `device_brands` / `device_models`, splitting
   `"17 Pro / 18 Pro"` into two fitment rows.
6. Drop `["Standard"]`; build the color axis from the rest.
7. Generate the variant matrix (~1,900 rows), collapsing the 22 duplicate
   colour/option cases into one axis.
8. Seed inventory at `on_hand = 0`, `policy = 'continue'`.
9. Copy `image` to `product_images` position 0, append `images_json`.
10. Report per-step counts and every skipped row. The import must be re-runnable
    and idempotent, keyed on `sku`.
