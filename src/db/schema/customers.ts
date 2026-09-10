import {
  boolean,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { products } from "./catalog";
import { deviceModels } from "./devices";
import { users } from "./identity";

/**
 * The phones a customer tells us they own, so fitment filtering happens without
 * them choosing a device on every visit.
 *
 * `label` exists because people own more than one and think of them by name —
 * "my phone", "work phone", "wife's iPhone".
 */
export const customerDevices = pgTable(
  "customer_devices",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deviceModelId: uuid()
      .notNull()
      .references(() => deviceModels.id, { onDelete: "cascade" }),
    label: text(),
    isPrimary: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.deviceModelId] })],
);

/** Favourites. Also the count behind a "Most Wishlisted" section. */
export const wishlistItems = pgTable(
  "wishlist_items",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.productId] }),
    index("wishlist_items_product_idx").on(t.productId),
    index("wishlist_items_user_recent_idx").on(t.userId, t.createdAt.desc()),
  ],
);

/**
 * Recently viewed, one row per customer per product.
 *
 * A viewing *log* would grow without limit and need pruning; this upserts
 * `viewedAt` instead, so the table stays proportional to customers times
 * products they care about. It is not analytics — it is a convenience strip on
 * the homepage.
 */
export const recentlyViewed = pgTable(
  "recently_viewed",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    viewedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.productId] }),
    index("recently_viewed_user_idx").on(t.userId, t.viewedAt.desc()),
  ],
);
