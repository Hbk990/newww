import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { variants } from "./catalog";
import { inventoryPolicy } from "./enums";

/**
 * Stock per variant. `available = onHand - reserved`.
 *
 * Every write locks the row, and the only sanctioned path for a sale is
 * `claim_stock()` (see the migration), which decrements and writes the ledger
 * in one statement so the two cannot come apart.
 *
 * `policy = 'deny'` by default: real quantities are being entered, so the store
 * should stop selling at zero rather than accept backorders silently.
 */
export const inventory = pgTable(
  "inventory",
  {
    variantId: uuid()
      .primaryKey()
      .references(() => variants.id, { onDelete: "cascade" }),
    onHand: integer().notNull().default(0),
    reserved: integer().notNull().default(0),
    track: boolean().notNull().default(true),
    policy: inventoryPolicy().notNull().default("deny"),
    /**
     * Reorder point. `in_stock` already flips at zero; this is what warns you
     * before that, so the alert arrives while there is still time to rebuy.
     * Null means no threshold set.
     */
    lowStockThreshold: integer(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("inventory_reserved_nonneg", sql`${t.reserved} >= 0`),
    // The low-stock worklist: only variants actually at or under their point.
    index("inventory_low_stock_idx")
      .on(t.variantId)
      .where(
        sql`${t.track} and ${t.lowStockThreshold} is not null and (${t.onHand} - ${t.reserved}) <= ${t.lowStockThreshold}`,
      ),
  ],
);

/**
 * Soft holds taken while an item sits in a cart, so two shoppers cannot both
 * reach checkout believing they have the last unit.
 *
 * A hold expires rather than being released on abandonment: nobody tells you
 * they abandoned a cart. A sweeper deletes expired rows and decrements
 * `inventory.reserved`, which is why `expiresAt` is indexed.
 */
export const inventoryReservations = pgTable(
  "inventory_reservations",
  {
    id: uuid().primaryKey().defaultRandom(),
    variantId: uuid()
      .notNull()
      .references(() => variants.id, { onDelete: "cascade" }),
    // FK added in the migration: carts is declared after this table.
    cartId: uuid().notNull(),
    quantity: integer().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("inventory_reservations_expires_idx").on(t.expiresAt),
    index("inventory_reservations_cart_idx").on(t.cartId),
    check("inventory_reservations_quantity_positive", sql`${t.quantity} > 0`),
  ],
);

/**
 * Append-only record of every stock movement. Never updated, never deleted.
 *
 * Without it, stock is a mutable number nobody can explain: you can see that a
 * variant says 3 but not that 40 arrived, 36 sold and 1 came back refused. The
 * ledger is what makes a discrepancy investigable instead of a mystery.
 */
export const inventoryLedger = pgTable(
  "inventory_ledger",
  {
    id: uuid().primaryKey().defaultRandom(),
    variantId: uuid()
      .notNull()
      .references(() => variants.id, { onDelete: "cascade" }),
    // Signed: negative for a sale, positive for a restock or a return.
    delta: integer().notNull(),
    // 'sale' | 'restock' | 'adjustment' | 'refund' | 'shrinkage' | 'refused_delivery'
    reason: text().notNull(),
    // The order this movement belongs to, when there is one.
    referenceId: uuid(),
    note: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("inventory_ledger_variant_created_idx").on(
      t.variantId,
      t.createdAt.desc(),
    ),
  ],
);
