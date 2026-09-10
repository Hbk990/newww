import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { variants } from "./catalog";
import { stockCountStatus } from "./enums";
import { users } from "./identity";

/**
 * A physical stock count — walking the shelves and writing down what is
 * actually there.
 *
 * Counting into a session rather than editing quantities directly matters
 * because a count takes time: stock moves while you are counting it. The
 * session records what was expected and what was found, and applying it writes
 * the difference through the ledger, so a correction is explainable afterwards
 * rather than an unaccountable jump.
 */
export const stockCounts = pgTable(
  "stock_counts",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    status: stockCountStatus().notNull().default("open"),
    startedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp({ withTimezone: true }),
    note: text(),
  },
  (t) => [
    index("stock_counts_open_idx")
      .on(t.startedAt.desc())
      .where(sql`${t.status} = 'open'`),
  ],
);

export const stockCountItems = pgTable(
  "stock_count_items",
  {
    stockCountId: uuid()
      .notNull()
      .references(() => stockCounts.id, { onDelete: "cascade" }),
    variantId: uuid()
      .notNull()
      .references(() => variants.id, { onDelete: "cascade" }),
    // What the system believed at the moment of counting.
    expectedQty: integer().notNull(),
    // What was actually on the shelf.
    countedQty: integer().notNull(),
    // Set once the difference has been written to the ledger, so applying a
    // count twice cannot double-adjust stock.
    applied: boolean().notNull().default(false),
    countedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    countedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.stockCountId, t.variantId] }),
    index("stock_count_items_unapplied_idx")
      .on(t.stockCountId)
      .where(sql`not ${t.applied}`),
    check("stock_count_items_counted_nonneg", sql`${t.countedQty} >= 0`),
  ],
);
