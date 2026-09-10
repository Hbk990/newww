import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { discountKind } from "./enums";

/**
 * Discount codes.
 *
 * `value` is basis points when `kind` is 'percent' and cents otherwise — an
 * integer either way, so no float ever touches a price. 10% is 1000, not 0.1.
 *
 * `usedCount` is incremented in the same transaction that creates the order, so
 * a single-use code cannot be redeemed twice by two concurrent checkouts.
 */
export const discounts = pgTable("discounts", {
  id: uuid().primaryKey().defaultRandom(),
  code: text().notNull().unique(),
  kind: discountKind().notNull(),
  value: integer().notNull(),
  minSubtotalCents: integer(),
  startsAt: timestamp({ withTimezone: true }),
  endsAt: timestamp({ withTimezone: true }),
  // Null means unlimited.
  usageLimit: integer(),
  usedCount: integer().notNull().default(0),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
