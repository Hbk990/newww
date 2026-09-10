import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  uuid,
} from "drizzle-orm/pg-core";

import { products, variants } from "./catalog";
import { relationKind } from "./enums";

/**
 * "Goes with this" — a case suggests a screen protector and a charger.
 *
 * Chosen by hand rather than inferred, because it works from day one and there
 * is no order history to learn from yet. Automatic pairing from co-purchase
 * data can be added later as a second `kind` without touching this table.
 *
 * Deliberately one-directional: a phone case suggesting a charger does not mean
 * the charger should lead with that case.
 */
export const productRelations = pgTable(
  "product_relations",
  {
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    relatedProductId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    kind: relationKind().notNull().default("cross_sell"),
    position: integer().notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.productId, t.relatedProductId, t.kind] }),
    index("product_relations_ordered_idx").on(t.productId, t.kind, t.position),
    check("product_relations_not_self", sql`${t.productId} <> ${t.relatedProductId}`),
  ],
);

/**
 * A bundle — Protection Pack, Car Bundle — is itself a product, with
 * `products.is_bundle` set. That means it has a slug, images, a price and a
 * place in the catalog like anything else, instead of being a special case
 * every storefront query has to know about.
 *
 * Its components are variants, so a bundle can specify "this exact cable", not
 * merely "a cable". Bundle availability is the minimum over its components
 * (`floor(available / quantity)`) and is computed at read time rather than
 * stored: a stored value would need invalidating on every component's stock
 * change, and a bundle page is rare compared to a stock movement.
 */
export const bundleItems = pgTable(
  "bundle_items",
  {
    bundleProductId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    variantId: uuid()
      .notNull()
      .references(() => variants.id, { onDelete: "restrict" }),
    quantity: integer().notNull().default(1),
    position: integer().notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.bundleProductId, t.variantId] }),
    index("bundle_items_variant_idx").on(t.variantId),
    check("bundle_items_quantity_positive", sql`${t.quantity} > 0`),
  ],
);
