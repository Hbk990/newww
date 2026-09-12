# Where this stands — 11 Sep 2026

A snapshot of the backend. `README.md` covers setup; this file says what works,
what does not, and what to be careful of.

## Running it

```bash
npm install
cp .env.example .env          # then set DATABASE_URL
npm run db:migrate            # 20 migrations
npm run db:seed               # 361 reference rows: categories, brands, devices
npm run build && npm start    # the admin is tested against a production build
```

You need a staff account to reach `/admin`. Register at `/register`, then in
the database set `role = 'admin'` and `email_verified_at = now()` on your user.
With `MAIL_TRANSPORT=console` the verification code prints to the server log.

Test against a production build, not `next dev`. In a sandboxed environment the
dev server's HMR websocket often cannot connect and hydration appears broken
when nothing is wrong.

## What works

**Foundations** — 62 tables over 26 migrations; email and Google sign-in;
server-side sessions; 31 permissions over three roles (customer, staff, admin);
an append-only audit log the database refuses to update or delete; the admin
shell with navigation, breadcrumbs, mobile layout, toasts and an error boundary.

**Catalog** — the attribute builder with inheritance down the category tree;
the product form with its variant grid, bulk fill and SKU generation; editing
an existing product; the image pipeline; the device fitment picker; and the
Categories, Brands and Devices screens.

## What does not work yet

The shop sells. A visitor can fill a basket, check out, and the order arrives
awaiting its confirmation call — stock claimed, delivery priced by governorate,
the cart retired. Cancelling or refusing an order puts counted stock back.

What is still missing, in the order it matters:

**There is no catalog storefront.** No product pages, no category or search
pages, no "shop by device". `/cart` and `/checkout` exist and work, but nothing
yet puts anything into a basket except a test. The cart line shows a product
title as plain text because `/products/[slug]` does not exist for it to link
to. This is the frontend work, and it is waiting on the owner's notes.

**Email needs a key.** `MAIL_TRANSPORT=brevo` is implemented but unverified
against the live API — this environment cannot reach api.brevo.com. Set
`BREVO_API_KEY`, verify the `MAIL_FROM` domain with Brevo, and send one real
message before trusting it. With `MAIL_TRANSPORT=console` the app throws in
production rather than silently dropping verification emails.

**Seven admin screens are still placeholders:** the audit log viewer,
customers and customers/new, promotions, reviews, staff, and stock counts.
None of them block selling.

**No dispatch record.** An order moves to delivered without recording what
physically left, so partial shipments are not modelled. `fulfillments` and
`fulfillment_items` are untouched.

**No return after delivery.** `NEXT_STATUS` gives `delivered` no onward moves
and `refunds` is untouched. Money has changed hands by then, so it is a refund
rather than a stock return, and that flow does not exist. A refusal *before*
delivery is handled.

**Delivery prices are placeholders.** Migration 0023 seeded $2 Beirut, $3 Mount
Lebanon, $5 elsewhere. Nobody quoted those — replace them under Delivery zones.
`is_private` is also still on, so the shop sends `noindex` until someone turns
it off in Settings.

## Four things to be careful of

**Images do not survive a deploy.** The storage driver writes to
`public/uploads`, which serverless hosts wipe. The admin warns about this on
screen. Pick a provider before uploading a real catalog; it is one file in
`src/lib/storage/`.

**`drizzle-kit generate` produces a weaker schema than the migrations
installed.** It cannot express composite foreign keys, `NULLS NOT DISTINCT`,
triggers or `ON DELETE RESTRICT`, and it omits them silently. Always run
`generate` first and then edit the SQL — never the other way round.
`docs/ARCHITECTURE.md` has the full list under "Writing a migration".

**Never interpolate a column object into a correlated subquery.**
`${brands.id}` renders as bare `"id"`, which binds to the *inner* table's own
id column when it has one — a comparison between two unrelated columns that
silently returns zero. Name the outer table literally: `brands.id`. This bug
made the attributes page report "None yet" for attributes that had options.

**A committed hook rewrites every Bash command.** `.claude/settings.json`
registers rtk (github.com/rtk-ai/rtk) as a `PreToolUse` hook, so an agent
working in this repo sees `rtk git status` in place of `git status` and gets
filtered output. That is deliberate — it cuts tokens sharply — but it means
command output reaching the model is neither raw nor merely trimmed.
**rtk's filters can change which binary runs.** Its eslint filter invoked a
globally installed ESLint 10.1.0 instead of this repo's pinned 9.39.5, hit the
`getFilename` incompatibility `eslint.config.mjs` warns about, failed to parse
the crash as JSON and returned exit 2 — a clean lint reported as a broken one.
Reproduced here, not hypothetical; rtk issue #2176 is the open bug for the
related output-fidelity problem. The fix is `~/.config/rtk/config.toml`:

    [hooks]
    exclude_commands = ["npx", "npm", "eslint", "tsc", "vitest", "playwright", "psql", "pg_dump", "node"]

That file is per-machine and not in this repo, so **every developer and every
fresh container needs it** — those are the commands by which migrations, schema
state, both test suites, types and lint are verified, and rtk must not stand
between them and you.
`.claude/hooks/install-rtk.sh` installs the binary and exits 0 on every path,
so a session without rtk degrades to unfiltered output rather than failing.

## Open data questions

- 32 catalog items sat under `Mix Product` and need real categories.
- Two device labels are unidentified: `A3` and `X 11PRO`. The Devices screen
  flags them.
- `iPhone 15 Plus` is missing from the device list — the seed derived models
  from the catalog, so anything no product mentioned was never created. Add it
  from the Devices screen.

## Decisions settled, not pending

Retail only, one currency, one country. That rules out multi-currency,
customer groups and wholesale tiers — bringing any of them back is a schema
change, not a setting. Tax is zero and price-inclusive. No internationalisation
and no multi-vendor. The Vape category is excluded as age-restricted.

## `typedRoutes` needs `next typegen` after adding a route

`.next/types/routes.d.ts` is what makes `<Link href>` typecheck, and it is
**not** regenerated by `next dev` picking up a new page — visiting the new route
in a browser does not rewrite it either. A `npm run typecheck` straight after
adding a route fails with "not assignable to RouteImpl" for a path that plainly
exists.

Run `npx next typegen` (seconds, no build) and typecheck again.

A dynamic href still needs `as Route` even once the route exists: only string
literals are checked. `src/components/admin/orders-table.tsx` shows the idiom.

## The categories in `drphone` are not the seeded taxonomy

`npm run db:seed` never overwrites an existing row, by design — these tables are
curated in the admin. It reports what it left alone; when that count is not
zero, a category or brand with the same slug was already there and the file's
version was ignored. Pass `--force` to update them.
