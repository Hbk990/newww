import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { products } from "./catalog";
import { attributeType } from "./enums";
import { categories } from "./taxonomy";

/**
 * Specs that are filterable but are *not* variant axes: wattage, mAh, RGB,
 * wireless, material.
 *
 * Today these live inside product names — "Green Lion - Thoofan 20W" — which
 * makes faceted filtering impossible. Pulling them into rows is what turns
 * "power banks over 10000mAh" into a query instead of a text search.
 */
export const attributeDefinitions = pgTable("attribute_definitions", {
  id: uuid().primaryKey().defaultRandom(),
  // 'capacity_mah', 'wattage_w'
  code: text().notNull().unique(),
  // 'Battery capacity'
  label: text().notNull(),
  dataType: attributeType().notNull(),
  // 'mAh', 'W'
  unit: text(),
  isFilterable: boolean().notNull().default(true),
  isComparable: boolean().notNull().default(false),
  position: integer().notNull().default(0),
});

/** Which attributes make sense where: mAh for Power Bank, not for Gaming Chair. */
/**
 * The choices for an `enum` attribute — Silicone / TPU / Leather / PC.
 *
 * This is what makes the attribute builder work without a developer: the owner
 * defines an attribute and its options in the admin, and the product form
 * renders a dropdown from these rows. A free-text field instead would fill the
 * database with "silicone", "Silicone" and "silicon", and nothing would filter.
 */
export const attributeOptions = pgTable(
  "attribute_options",
  {
    id: uuid().primaryKey().defaultRandom(),
    attributeId: uuid()
      .notNull()
      .references(() => attributeDefinitions.id, { onDelete: "cascade" }),
    value: text().notNull(),
    // Optional swatch, so a colour attribute can render as colour.
    colorHex: text(),
    position: integer().notNull().default(0),
  },
  (t) => [
    unique("attribute_options_value_key").on(t.attributeId, t.value),
    index("attribute_options_ordered_idx").on(t.attributeId, t.position),
  ],
);

export const categoryAttributes = pgTable(
  "category_attributes",
  {
    categoryId: uuid()
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    attributeId: uuid()
      .notNull()
      .references(() => attributeDefinitions.id, { onDelete: "cascade" }),
    isRequired: boolean().notNull().default(false),
    position: integer().notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.categoryId, t.attributeId] })],
);

/**
 * One typed value per product per attribute.
 *
 * Three nullable value columns with a check that exactly one is populated,
 * rather than a single text column: it keeps numbers sortable and range-
 * filterable in the database. A text column holding "20" and "9" sorts wrongly
 * and cannot answer "over 10000mAh".
 */
export const productAttributes = pgTable(
  "product_attributes",
  {
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    attributeId: uuid()
      .notNull()
      .references(() => attributeDefinitions.id, { onDelete: "cascade" }),
    valueText: text(),
    valueNumber: numeric(),
    valueBool: boolean(),
  },
  (t) => [
    primaryKey({ columns: [t.productId, t.attributeId] }),
    index("product_attributes_attribute_number_idx").on(
      t.attributeId,
      t.valueNumber,
    ),
    index("product_attributes_attribute_text_idx").on(t.attributeId, t.valueText),
    check(
      "product_attributes_exactly_one_value",
      sql`num_nonnulls(${t.valueText}, ${t.valueNumber}, ${t.valueBool}) = 1`,
    ),
  ],
);
