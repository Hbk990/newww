import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  uuid,
} from "drizzle-orm/pg-core";

import { products, variants } from "./catalog";

/**
 * Device compatibility — "what fits my phone?" — which is the primary shopping
 * intent for an accessory store and something the current site cannot answer.
 *
 * The export has 101 free-text fit labels, so "17 Pro Max", "17 pro Max" and
 * "17 PRO MAX" are three distinct values, and "17 Pro / 18 Pro" is one string
 * meaning two phones. These tables give those labels identity, which is what
 * makes a per-model landing page and a fitment filter possible.
 */

export const deviceBrands = pgTable("device_brands", {
  id: uuid().primaryKey().defaultRandom(),
  slug: text().notNull().unique(),
  // Apple, Samsung, Xiaomi, Infinix, Tecno
  name: text().notNull(),
  position: integer().notNull().default(0),
});

export const deviceModels = pgTable(
  "device_models",
  {
    id: uuid().primaryKey().defaultRandom(),
    deviceBrandId: uuid()
      .notNull()
      .references(() => deviceBrands.id, { onDelete: "cascade" }),
    // 'iphone-17-pro-max'
    slug: text().notNull().unique(),
    // 'iPhone 17 Pro Max'
    name: text().notNull(),
    // 'iPhone', 'Galaxy S', 'iPad Air'
    family: text(),
    releaseYear: integer(),
    isActive: boolean().notNull().default(true),
    position: integer().notNull().default(0),
  },
  (t) => [
    index("device_models_brand_year_idx").on(
      t.deviceBrandId,
      t.releaseYear.desc(),
    ),
  ],
);

/**
 * Which variant physically fits which device. "17 Pro / 18 Pro" becomes two
 * rows here rather than one unparseable string.
 */
export const variantDeviceFit = pgTable(
  "variant_device_fit",
  {
    variantId: uuid()
      .notNull()
      .references(() => variants.id, { onDelete: "cascade" }),
    deviceModelId: uuid()
      .notNull()
      .references(() => deviceModels.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.variantId, t.deviceModelId] }),
    index("variant_device_fit_model_idx").on(t.deviceModelId),
  ],
);

/**
 * Denormalized rollup of the above, so a "Shop by device" page is one indexed
 * lookup instead of a join through every variant of every product.
 *
 * Derived data: it must be maintained from `variantDeviceFit`, never written
 * directly. Step 2b adds the trigger that keeps it honest.
 */
export const productDeviceFit = pgTable(
  "product_device_fit",
  {
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    deviceModelId: uuid()
      .notNull()
      .references(() => deviceModels.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.productId, t.deviceModelId] }),
    index("product_device_fit_model_idx").on(t.deviceModelId),
  ],
);
