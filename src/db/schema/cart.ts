import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { variants } from "./catalog";
import { cartStatus } from "./enums";
import { users } from "./identity";

/**
 * Server-side cart, addressed by an opaque token in an httpOnly cookie.
 *
 * Server-side rather than in the cookie itself so stock can be reserved against
 * it and so a cart survives a device change once the user signs in. `userId` is
 * null for guests, which must work: guest checkout is the common path.
 */
export const carts = pgTable(
  "carts",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    token: text().notNull().unique(),
    status: cartStatus().notNull().default("active"),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index("carts_user_idx")
      .on(t.userId)
      .where(sql`${t.userId} is not null`),
  ],
);

export const cartItems = pgTable(
  "cart_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    cartId: uuid()
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    variantId: uuid()
      .notNull()
      .references(() => variants.id, { onDelete: "cascade" }),
    quantity: integer().notNull(),
    /**
     * The price when the item was added, so the cart can show a price change
     * honestly. It is not what the customer is charged: checkout re-reads the
     * variant, or a stale cart becomes a way to buy at last month's price.
     */
    unitPriceCents: integer().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Adding the same variant twice bumps the quantity instead of duplicating.
    unique("cart_items_cart_variant_key").on(t.cartId, t.variantId),
    check("cart_items_quantity_positive", sql`${t.quantity} > 0`),
  ],
);
