import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uuid,
} from "drizzle-orm/pg-core";

import { products } from "./catalog";
import { collectionKind } from "./enums";

/**
 * Merchandising groupings that cut across the category tree: Sale, New
 * Arrivals, Back to School.
 *
 * `manual` collections list their products explicitly. `smart` collections
 * match on `rules` — brand, category, price band — and are resolved at write
 * time into `collectionProducts` rather than evaluated on every request, so a
 * collection page stays a single indexed read.
 */
export const collections = pgTable("collections", {
  id: uuid().primaryKey().defaultRandom(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  kind: collectionKind().notNull().default("manual"),
  rules: jsonb(),
  imageUrl: text(),
  position: integer().notNull().default(0),
});

export const collectionProducts = pgTable(
  "collection_products",
  {
    collectionId: uuid()
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    position: integer().notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.collectionId, t.productId] }),
    index("collection_products_ordered_idx").on(t.collectionId, t.position),
  ],
);
