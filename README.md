# DRPHONE

Ecommerce storefront and admin for phone accessories, audio, gaming and home
electronics. Lebanon, USD, Cash on Delivery.

## Design docs

Read these before changing anything structural:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — stack, the decisions that are
  expensive to reverse, and what selling in Lebanon on COD implies
- [`docs/schema.sql`](docs/schema.sql) — annotated Postgres schema, the source of
  truth for the data model
- [`docs/CATALOG_FINDINGS.md`](docs/CATALOG_FINDINGS.md) — analysis of the 1,155
  line wholesale catalog export and how it is used
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — the 58 feature decisions: what is in
  scope, what is explicitly out, and the schema changes they require
- [`docs/DECISIONS-PRODUCT-FORM.md`](docs/DECISIONS-PRODUCT-FORM.md) — the 45
  product-form decisions, and why inventory tracks availability rather than
  quantities
- [`docs/DECISIONS-AUTH-ADMIN.md`](docs/DECISIONS-AUTH-ADMIN.md) — the 50 auth
  and admin-shell decisions, the permission function, and the append-only
  audit log
- [`docs/DECISIONS-ADMIN-SHELL.md`](docs/DECISIONS-ADMIN-SHELL.md) — the 45
  shell behaviour decisions, and why the admin is tested against a production
  build rather than `next dev`

## Getting started

```bash
docker compose up -d       # Postgres 16 on :5432
cp .env.example .env       # then fill in DATABASE_URL
npm install
npm run dev                # http://localhost:3000
```

`/health` renders the database connection: server version, database name and
round-trip latency, or the driver error if it can't connect.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:generate` | Generate a migration from the Drizzle schema |
| `npm run db:migrate` | Apply pending migrations (via `scripts/migrate.mjs`) |
| `npm run db:seed` | Seed categories, brands and device models from `seed/` |
| `npm run db:studio` | Drizzle Studio |

Migrations are generated and reviewed as SQL before being applied — there is no
`db:push`, deliberately, so no schema change reaches a database unread.

`db:migrate` runs `scripts/migrate.mjs` rather than `drizzle-kit migrate`,
because the CLI exits non-zero without printing the failing statement. The
script prints the error, the Postgres code and the offending query.

A fresh database applies **every pending migration in one transaction**. That
means a migration must not use an enum value that an earlier pending migration
added with `ALTER TYPE ... ADD VALUE` — Postgres refuses ("unsafe use of new
value"), and the failure appears only on fresh databases, never in development
where the earlier migration already committed. Compare as `status::text` when
this comes up.

## Layout

```
app/            Next.js App Router
src/db/         Drizzle client and schema
src/env.ts      Validated environment access
docs/           Design docs (above)
drizzle/        Generated migrations
```

## Build order

1. **Scaffold and database wiring** — done
2. Port `docs/schema.sql` to Drizzle, generate the first migration
3. Seed reference data: categories, brands, device models
4. Auth and admin shell
5. Product form: create with variants and the matrix generator
6. Images, device fitment picker, quantity grid
7. Bulk paste-entry for hand-corrected rows
8. Cart, checkout, COD order and the confirmation queue

## Authentication

Cookie sessions in Postgres, Argon2id passwords, and Google One Tap. See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for why each piece is shaped the
way it is.

Running it locally needs nothing configured: with `MAIL_TRANSPORT=console` the
verification code is printed to the server log instead of emailed, so
registration works end to end before an email provider exists. That transport
refuses to run in production.

Google sign-in is hidden unless `GOOGLE_CLIENT_ID` is set. Create an OAuth 2.0
Client ID (type: Web application) in Google Cloud — free — and add your origin
under "Authorized JavaScript origins".

Permission checks go through `can(user, permission)` in
`src/lib/auth/permissions.ts` — never `user.role === "admin"`. That is
deliberate: it keeps the choice of three roles from being baked into every page.

To make yourself staff after registering:

```sql
update users set role = 'admin' where email = 'you@example.com';
```

## Testing the admin

Client interactivity does not work under `next dev` in some sandboxed
environments: the HMR WebSocket cannot connect, hydration never finishes, and no
event handler attaches. Test the admin against a production build:

```bash
npm run build && npm run start
```

The login throttle allows eight attempts per identifier per fifteen minutes and
counts successes, so a test run that cannot sign in has usually tripped it.
Clear it with `delete from auth_attempts;`.

## Notes

- **Pinned to ESLint 9.** `eslint-config-next@16` declares `eslint >=9` but
  bundles `eslint-plugin-react@7.37.5`, which still calls `context.getFilename()`
  — removed in ESLint 10. Revisit when that plugin updates.
- `npm audit` reports a moderate advisory against `esbuild` reachable only
  through `drizzle-kit`. It is a dev dependency and the advisory concerns a
  development server, so nothing ships to production; there is no fixed
  `drizzle-kit` release yet.
