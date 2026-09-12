# Reference seed data

Categories, brands, device brands and device models, derived once from
`DRPHONEcatalog20260910.csv` and committed here.

Derived once and checked in, rather than parsed from the CSV at seed time, for
three reasons: the export is not in the repository and will not exist later; the
taxonomy fixes below are visible in a diff instead of buried in parsing code;
and re-seeding a new environment must not depend on finding a spreadsheet.

Apply with `npm run db:seed`.

## What the seeder does and does not do

**Idempotent, and it will not overwrite what already exists.** These tables are
curated in the admin — renaming a category or reordering the sidebar is a
decision someone made, and a re-run must not silently undo it. Pass `--force`
to update existing rows from these files.

Verified: on an empty database it inserts 361 rows; a second run changes
nothing and leaves a hand-edited category name intact; `--force` updates all
361 back to the seed values.

## Taxonomy fixes applied while seeding

| Fix | Why |
|---|---|
| `Razer` and `HyperX` dropped as categories | They are brands, and they are seeded as brands. Their 57 products are Headphones, Microphones and Keyboard & Mouse, which all exist as categories. |
| `Mix Product` dropped | A 90-item junk drawer. Nobody browses one, and it cannot be filtered. |
| Eight new categories added | Derived from the clusters actually inside Mix Product: Kitchen & Drinkware, Grooming, Cleaning, Humidifier & Air, Night Light, Furniture & Comfort, Stationery & Print, Travel & Outdoor. |
| `Tablet` moved under `Gaming & Computers` | It sat under a group called `Other`, which is not a name for a menu. Tablets are computing devices; this was a judgement call and is easy to change. |
| `Vape` dropped | Age-restricted, and declined earlier. |

Result: 8 groups and 52 categories, down from 9 groups and 48 categories, with
the junk drawer replaced by things people would actually browse.

## Merged down to five groups, for the menu

Eight groups do not fit a centred menu bar beside a search field and a basket,
and three of them held 117 products between them. Their categories moved to the
group a shopper would look in first:

| Moved | To | Why |
|---|---|---|
| FM Transmitter, Jump Starter | Phones & Power | An FM transmitter plays a phone through a car radio; a jump starter is a power bank for a car. |
| Network, Flash & Memory | Gaming & Computers | Both are computer accessories. |
| Bag, Toys, TV Box | Home & Lifestyle | Nothing about them is a phone accessory. |

Three groups were then empty and are gone: Toys/Lifestyle/Miscellaneous,
Storage/Network/TV, Car Electronics. Two were renamed to fit a menu:
`Mobile Accessories & Power` → **Phones & Power**, `Home & Personal Care` →
**Home & Lifestyle** (it now holds bags and toys).

Groups and categories are both ordered by how much of the catalog they hold, so
Charge & Cable leads its group rather than Airtag.

**Result: 5 groups, 52 categories, 44 of which have products.** The empty eight
are kept, not deleted — `loadNav` leaves a category with no active products out
of the menu, so each appears by itself the day it is stocked.

## What still needs your judgement

**About 32 of the 90 `Mix Product` items do not cluster.** A treadmill, a
pressure washer, a gaming table, a mosquito zapper, a pocket calculator, a
wood cutter. No keyword rule produces a sensible category for them, and
inventing eight more categories for 32 items would only rebuild the drawer
under new names. Tell me what categories you want and I will add them; until
then those products have nowhere obvious to go.

**Two device labels could not be classified** — see
`devices-needs-review.json`:

- `A3` — appears in "Cover - Transperent Android" alongside Infinix and Tecno
  models, so it is probably an Itel or Infinix A3, but the export does not say.
- `X 11PRO` — appears in a Samsung/Infinix screen-protector list. Unclear.

Both are excluded rather than guessed. A wrong fitment claim means a customer
buys a case that does not fit.

## Device model normalisation

108 free-text fit labels became **79 models** across Apple, Samsung, Xiaomi,
Infinix and Tecno. The reduction is case variants and typos collapsing:

- `16 Pro Max`, `16 PRO MAX`, `16 Pro MAX`, `16 pro MAX` → **iPhone 16 Pro Max**
- `14 Pro Max`, `14 PRO MAX`, `14 Pro Mac` → **iPhone 14 Pro Max**
- `A9+`, `A9 Plus`, `A9 +` → **Galaxy Tab A9+**

Two things worth knowing about how this was done:

**`+` is preserved in slugs.** An early version stripped it, which collapsed
Galaxy Tab A9+, Tab A11+, Tab S9 FE+ and Hot 50 Pro+ onto their non-plus
siblings and silently dropped four real devices. A Tab A9 case does not fit a
Tab A9+.

**`A9` is a tablet and `A16` is a phone.** Samsung uses overlapping names, so
the classifier reads the product's category: `A8`/`A9`/`A11` appear only in
Tab and iPad products and become Galaxy Tab A, while `A05s` through `A55`
appear in phone products and become Galaxy A. Getting this from the label alone
is impossible.

iPad Pro generations are kept apart — `iPad Pro 11 (2020)` and
`iPad Pro 11 (2024)` are separate rows, because a case for one need not fit the
other.

## Files

| File | Contents |
|---|---|
| `categories.json` | 8 groups, 52 children, with the export's product counts for reference |
| `brands.json` | 217 brands, deduplicated case-insensitively from 225 spellings — `SanDisk` beats `Sandisk` because it is the more common one |
| `devices.json` | 5 device brands, 79 models, each listing the raw labels it absorbed |
| `devices-needs-review.json` | The two labels that could not be classified |
