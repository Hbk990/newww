import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { users } from "./identity";

/**
 * Every price and cost change, with who and when.
 *
 * The audit log records that a change happened; this makes prices *queryable* —
 * "what did this cost in March", "which products went up last week", "who
 * discounted this". Written by trigger, so a price cannot change without being
 * recorded, including from a script or psql.
 *
 * Both old and new are kept on the row. Reconstructing a price by walking
 * forward from the first row works only if no write was ever missed, and the
 * whole point of this table is answering questions when something did go wrong.
 */
export const priceHistory = pgTable(
  "price_history",
  {
    id: uuid().primaryKey().defaultRandom(),
    // Loose reference, like the stock ledger: price history outlives the
    // variant, and a cascade could not run against an append-only table.
    variantId: uuid().notNull(),
    // 'price' | 'cost' | 'sale_price'
    field: text().notNull(),
    oldCents: integer(),
    newCents: integer(),
    changedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    reason: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("price_history_variant_idx").on(t.variantId, t.createdAt.desc()),
    index("price_history_recent_idx").on(t.createdAt.desc()),
  ],
);
