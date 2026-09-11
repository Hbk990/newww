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
  uniqueIndex,
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
  /**
   * Whether one product may carry several of this attribute's values —
   * "Compatible with: USB-C, Lightning".
   *
   * Constrained to `enum` types in the database: a set drawn from bounded
   * options is the only kind worth filtering on. Multi free text would be a
   * column of near-duplicates, and multi yes/no is a contradiction.
   */
  isMulti: boolean().notNull().default(false),
  position: integer().notNull().default(0),
}, (t) => [
  check(
    "attribute_definitions_multi_requires_enum",
    sql`not ${t.isMulti} or ${t.dataType} = 'enum'`,
  ),
]);

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
    // `id` is already unique alone; this pairing exists so product_attributes
    // can point a composite foreign key at (attribute_id, id).
    unique("attribute_options_attribute_id_key").on(t.attributeId, t.id),
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
    /**
     * A surrogate key, because (product_id, attribute_id) — the natural one —
     * is exactly what caps an attribute at a single value per product. The
     * unique index below takes over the job it was doing.
     */
    id: uuid().primaryKey().defaultRandom(),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    attributeId: uuid()
      .notNull()
      .references(() => attributeDefinitions.id, { onDelete: "cascade" }),
    valueText: text(),
    valueNumber: numeric(),
    valueBool: boolean(),
    /**
     * An `enum` value points at its option rather than copying its label, so
     * renaming "Silicone" to "Silicone gel" moves every product with it.
     *
     * The foreign key is composite — (attribute_id, option_id), declared in
     * migration 0015 — so an option can never be paired with a different
     * attribute than the one it belongs to. Drizzle has no composite-FK
     * builder, so it is not repeated here.
     */
    optionId: uuid(),
  },
  (t) => [
    /**
     * NULLS NOT DISTINCT is load-bearing. Postgres treats nulls as distinct by
     * default, which would let a text, number or boolean attribute — all of
     * which leave option_id null — collect unlimited rows. Declared in
     * migration 0015; Drizzle cannot express the modifier, so this entry
     * exists to stop a later `generate` from dropping the index.
     */
    uniqueIndex("product_attributes_value_uq").on(
      t.productId,
      t.attributeId,
      t.optionId,
    ),
    index("product_attributes_attribute_number_idx").on(
      t.attributeId,
      t.valueNumber,
    ),
    index("product_attributes_attribute_text_idx").on(t.attributeId, t.valueText),
    index("product_attributes_attribute_option_idx").on(t.attributeId, t.optionId),
    check(
      "product_attributes_exactly_one_value",
      sql`num_nonnulls(${t.valueText}, ${t.valueNumber}, ${t.valueBool}, ${t.optionId}) = 1`,
    ),
  ],
);
