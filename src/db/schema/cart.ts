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
 * null while a guest browses, which must keep working: ordering needs an
 * account, but filling a basket does not — asking for one before someone has
 * chosen anything loses the sale. `adoptGuestCart` moves the basket across at
 * sign-in.
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
    // Set once a recovery email goes out, so a cart is chased once rather than
    // every night until it expires.
    reminderSentAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index("carts_user_idx")
      .on(t.userId)
      .where(sql`${t.userId} is not null`),
    // The recovery worklist: active carts never yet chased.
    index("carts_abandoned_idx")
      .on(t.updatedAt)
      .where(sql`${t.status} = 'active' and ${t.reminderSentAt} is null`),
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
