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

import { products } from "./catalog";
import { reviewStatus } from "./enums";
import { users } from "./identity";
import { orderItems } from "./orders";

/**
 * Reviews from verified purchasers only, held for moderation.
 *
 * `orderItemId` is the proof of purchase and is required — it is what makes
 * "verified" true rather than a claim. The unique constraint on it stops the
 * same purchase being reviewed twice.
 *
 * Nothing is customer-visible until `status` is `approved`. The aggregates on
 * `products` are computed from approved rows only, so a pending review never
 * moves a star rating.
 */
export const reviews = pgTable(
  "reviews",
  {
    id: uuid().primaryKey().defaultRandom(),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    orderItemId: uuid()
      .notNull()
      .references(() => orderItems.id, { onDelete: "cascade" }),
    rating: integer().notNull(),
    title: text(),
    body: text(),
    status: reviewStatus().notNull().default("pending"),
    moderatedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    moderatedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("reviews_order_item_key").on(t.orderItemId),
    // The product page: approved reviews, newest first.
    index("reviews_product_approved_idx")
      .on(t.productId, t.createdAt.desc())
      .where(sql`${t.status} = 'approved'`),
    // The moderation queue.
    index("reviews_pending_idx")
      .on(t.createdAt)
      .where(sql`${t.status} = 'pending'`),
    check("reviews_rating_range", sql`${t.rating} between 1 and 5`),
  ],
);

export const reviewImages = pgTable(
  "review_images",
  {
    id: uuid().primaryKey().defaultRandom(),
    reviewId: uuid()
      .notNull()
      .references(() => reviews.id, { onDelete: "cascade" }),
    url: text().notNull(),
    position: integer().notNull().default(0),
  },
  (t) => [index("review_images_review_idx").on(t.reviewId, t.position)],
);
