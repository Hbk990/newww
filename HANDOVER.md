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

**Foundations** — 62 tables over 20 migrations; email and Google sign-in;
server-side sessions; 31 permissions over three roles (customer, staff, admin);
an append-only audit log the database refuses to update or delete; the admin
shell with navigation, breadcrumbs, mobile layout, toasts and an error boundary.

**Catalog** — the attribute builder with inheritance down the category tree;
the product form with its variant grid, bulk fill and SKU generation; editing
an existing product; the image pipeline; the device fitment picker; and the
Categories, Brands and Devices screens.

## What does not work yet

Nothing sells. There is no storefront, no cart, no checkout and no order
screen. Twelve admin screens are still placeholders: orders, customers,
reviews, promotions, stock, stock counts, staff, settings and the audit log
viewer.

Most importantly: **`claim_stock`, `return_stock` and `next_order_number` are
written and tested but have no callers.** The database can already reserve
stock, number an order and return a refused delivery. Nothing asks it to. That
is the next phase, and the largest remaining piece.

`markReauthenticated` and `requireRecentAuth` also exist unused — the
sensitive-operations list they were built for is not enforced yet.

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
