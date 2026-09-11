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
 * Stock per variant, in one of two modes.
 *
 * **Untracked** (the default): `available` is a switch someone flips. Nothing
 * is counted and nothing is decremented by a sale. This suits a wholesaler
 * whose shelf stock is shared with trade customers, where a count on the
 * website would be misleading rather than useful.
 *
 * **Tracked**: `onHand` and `reserved` are real, a sale decrements them through
 * `claim_stock()`, and `policy` decides what happens at zero.
 *
 * Mixing the two per variant is deliberate — the handful of lines worth
 * counting can be counted without forcing a number onto the other 1,900.
 */
export const inventory = pgTable(
  "inventory",
  {
    variantId: uuid()
      .primaryKey()
      .references(() => variants.id, { onDelete: "cascade" }),
    /**
     * Whether this variant is counted in units.
     *
     * Defaults to FALSE, because this is a wholesale business: the physical
     * stock serves trade customers as well as the website, so a number here
     * would not mean "how many the website may sell". Availability is set by
     * hand instead.
     *
     * Turn it on per variant when a real count is worth keeping — then
     * `onHand`, `reserved`, `policy` and `lowStockThreshold` all come alive and
     * `available` is ignored.
     */
    track: boolean().notNull().default(false),
    /**
     * The manual in-stock switch, used when `track` is false. This is what the
     * admin actually toggles.
     *
     * Without it, an untracked variant has no way to be marked out of stock —
     * quantity zero cannot mean "none left" when quantity was never entered.
     */
    available: boolean().notNull().default(true),
    // Only meaningful when `track` is true.
    onHand: integer().notNull().default(0),
    reserved: integer().notNull().default(0),
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
    // Only tracked variants can be low: an untracked one has no quantity to
    // compare against a threshold.
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
    /**
     * A loose reference, with no foreign key, for the same reason
     * `auditLog.entityId` has none: the ledger has to outlive the variant it
     * describes.
     *
     * A cascade here would also be unenforceable — deleting a variant would try
     * to delete its ledger rows, which the append-only trigger refuses, so no
     * variant with any stock history could ever be removed. A deleted variant's
     * movements are still reconcilable, and the sale itself survives in
     * `orderItems`, which snapshots what was bought.
     */
    variantId: uuid().notNull(),
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
