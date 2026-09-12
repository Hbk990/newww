# Before the shop goes live

Everything deliberately deferred while the site was built locally. Nothing
here is a bug: each one is a real value or credential that only exists outside
this repository, and each one is listed with the exact consequence of forgetting
it.

Work top to bottom. The first section will charge customers the wrong money or
send nothing at all; the second will make the shop look unfinished; the third
is housekeeping.

## 1. Will cost money or silently fail

### Delivery prices are placeholders

`shipping_rates` was seeded with **$2 Beirut / $3 Mount Lebanon / $5 rest of
Lebanon** to make the checkout work. These are invented. They are charged to
the customer at checkout, shown beside every governorate, and printed in the
footer.

Fix in **Admin → Shipping**. While they are wrong, every order loses or
overcharges the difference.

### Email is not connected

`MAIL_TRANSPORT=console` prints verification and password-reset codes to the
server log instead of sending them. Locally that is the point — the code is in
the `next dev` output. In production it means **nobody can confirm an email
address or recover a password**.

`sendMail` throws rather than silently dropping mail if `NODE_ENV=production`
and the transport is still `console`, so this cannot ship unnoticed — but it
will stop registration dead rather than degrade.

To connect it:

1. Brevo → account menu → **SMTP & API → API keys** → generate one.
2. Brevo → **Senders, Domains & Dedicated IPs → Domains** → add the domain and
   publish the DKIM and DMARC records they give you. Mail from a verified
   domain reaches inboxes; mail from an unverified one is refused, and mail
   "from" a Gmail address via another service is frequently marked spam.
3. Set, in the host's environment rather than a file:

   ```
   MAIL_TRANSPORT=brevo
   BREVO_API_KEY=xkeysib-…
   MAIL_FROM=DRPHONE <no-reply@yourdomain>
   ```

   `MAIL_FROM` must match the verified sender exactly or Brevo rejects the
   message.
4. Register a throwaway account against production and confirm the code
   arrives. Nothing in this repository has ever succeeded in talking to a mail
   provider — `src/lib/mail/brevo.ts` is written and unit tested, and its live
   path is unproven.

Free tier is 300 emails a day, which is far more than codes and resets need.

### `CRON_SECRET` is unset

`/api/cron/expire-reservations` releases stock holds from abandoned baskets.
With no secret it returns **503 and does nothing** — deliberately, because an
open sweeper endpoint lets anyone strip the holds off every live basket in the
shop.

Generate with `openssl rand -base64 32`, set `CRON_SECRET`, and schedule a GET
with `Authorization: Bearer <secret>` every five minutes. Until then, holds
expire only in the sense that `reserve_stock` ignores expired rows; the
`reserved` figures on `inventory` stay inflated and low-stock warnings read
wrong.

### Product images have nowhere to live

`STORAGE_DRIVER=local` writes to `public/uploads`. On a serverless host the
filesystem is read-only at runtime and wiped on every deploy, so uploads
succeed locally and vanish in production. Pick a provider and add a driver in
`src/lib/storage/` before uploading a real catalog. The admin shows a warning
until one is set.

## 2. Will make the shop look unfinished

### The catalog is synthetic

The 1,201 products currently in the database are generated load-test data —
`Product 811`, `Brand 134`, prices up to $430 — and **not one has a photo**.
The real reference data (52 categories, 217 brands, 79 phone models) is real
and committed in `seed/`.

To import the real catalog, `DRPHONEcatalog20260910.csv` is needed again; it
was read once to derive `seed/` and is not in the repository. Photos are the
other half: every product page and every listing card currently shows the grey
placeholder.

### `isPrivate` is on

`store_settings.is_private` adds `noindex` to every page, so the shop cannot be
found in search. Correct while it is half-built. Turn it off in **Admin →
Settings** on launch day, not before.

### Contact details are empty

`store_settings.phone` and `whatsapp_number` are null, so the footer's contact
rows, the product page's "Ask on WhatsApp" button and the homepage's WhatsApp
link do not render at all. They appear the moment the values are set — nothing
is hardcoded.

### There is no logo file

The header and footer use a wordmark set in Outfit. Drop in a logo and both
pick it up from one component each.

### Policies are unwritten

There is no returns, delivery or privacy page, and the footer deliberately does
not link to one — a footer link to a page that does not exist is worse than no
link. The admin supports returns operationally; the customer-facing terms are
yours to write.

## 3. Data still needing a decision

- **32 "Mix Product" items** from the export do not cluster into any category:
  a treadmill, a pressure washer, a gaming table, a mosquito zapper. They have
  nowhere sensible to go. See `seed/README.md`.
- **Two device labels** could not be identified — `A3` and `X 11PRO`. Excluded
  rather than guessed, because a wrong fitment claim means a customer buys a
  case that does not fit. See `seed/devices-needs-review.json`.
- **iPhone 15 Plus** is missing from the seeded phone list.
- **Eight categories have no products**: Kitchen & Drinkware, Grooming,
  Cleaning, Humidifier & Air, Night Light, Furniture & Comfort, Stationery &
  Print, Travel & Outdoor. They are hidden from the menu automatically until
  stocked — no action needed unless you want them gone.

## 4. Not built yet

Customer-facing:

- **Order history.** `/account` says so plainly rather than hiding it. A
  customer can see an order number on the thank-you page and nothing after.
- **Reviews** on the product page — display, submission and moderation.
- **Related products** and **bundles**.
- **The filter sheet** chosen on the design review page: listings currently
  sort and filter by stock, with no sheet for phone model, brand or price.

Admin-facing: dispatch records, the customer detail screens, review
moderation, staff management, the audit viewer, promotions, stock counts, the
dashboard, and merchandising.

## Every environment variable

`.env.example` is the source of truth and documents each one. Copy it to `.env`
locally; set the same names in the host's environment for production.

| Variable | Needed for | Consequence if unset |
|---|---|---|
| `DATABASE_URL` | everything | the app will not start |
| `MAIL_TRANSPORT`, `BREVO_API_KEY`, `MAIL_FROM` | verification, password reset | codes go to the log, not the customer |
| `CRON_SECRET` | releasing abandoned stock holds | the endpoint returns 503 |
| `GOOGLE_CLIENT_ID` | Google sign-in | the button is hidden; email sign-in still works |
| `STORAGE_DRIVER` | product photos | writes to a filesystem that does not persist |
