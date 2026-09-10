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

## Notes

- **Pinned to ESLint 9.** `eslint-config-next@16` declares `eslint >=9` but
  bundles `eslint-plugin-react@7.37.5`, which still calls `context.getFilename()`
  — removed in ESLint 10. Revisit when that plugin updates.
- `npm audit` reports a moderate advisory against `esbuild` reachable only
  through `drizzle-kit`. It is a dev dependency and the advisory concerns a
  development server, so nothing ships to production; there is no fixed
  `drizzle-kit` release yet.
