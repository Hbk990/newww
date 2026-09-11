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
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { optionKind, productStatus } from "./enums";
import { brands, categories } from "./taxonomy";

/**
 * A product is the marketing wrapper: title, copy, images, slug. It has no
 * price and no stock — those belong to the variant.
 *
 * `descriptionHtml` is stored as HTML and must be sanitized on write, never on
 * read: sanitizing on read means every render trusts whatever is in the column.
 */
export const products = pgTable(
  "products",
  {
    id: uuid().primaryKey().defaultRandom(),
    slug: text().notNull().unique(),
    title: text().notNull(),
    shortDescription: text(),
    descriptionHtml: text(),
    status: productStatus().notNull().default("draft"),
    // SEO overrides; fall back to title when null.
    metaTitle: text(),
    metaDescription: text(),
    // Nullable: 67 lines in the export have no brand.
    brandId: uuid().references(() => brands.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp({ withTimezone: true }),

    // --- Denormalized read model. Do not write these by hand. ---
    //
    // A listing row needs "from $4.50", a thumbnail and a variant count. Deriving
    // that per row means joining products -> variants -> product_images and
    // aggregating, which is the query that makes catalog pages slow: the cost
    // grows with total variants, not with the page size, and no index removes
    // the aggregate.
    //
    // These columns collapse it to a single indexed scan over products, with no
    // join at all for a listing page. They are maintained by database triggers
    // (see the migration), not application code, so they cannot drift when a
    // variant is changed by a script, a migration or psql.
    minPriceCents: integer(),
    maxPriceCents: integer(),
    variantCount: integer().notNull().default(0),
    primaryImageUrl: text(),
    // True when any variant is buyable. Without it, an "in stock only" filter
    // has to join inventory across every variant, which is the same aggregate
    // problem as the price — and stock changes far more often than price.
    inStock: boolean().notNull().default(false),
    // Units sold, excluding cancelled and returned orders. Drives Best Sellers.
    // Recomputed by trigger, never incremented from application code.
    salesCount: integer().notNull().default(0),
    // Approved reviews only, so a listing card can show stars without a join.
    reviewCount: integer().notNull().default(0),
    ratingAvg: numeric({ precision: 2, scale: 1 }),
    // True when this product is sold as a bundle of other variants.
    isBundle: boolean().notNull().default(false),
    // A manual homepage flag. "New arrival" is derived from publishedAt
    // instead, so it cannot go stale because nobody remembered to untick it.
    isFeatured: boolean().notNull().default(false),
    /**
     * Free-form tags, for grouping and for smart collections to match on.
     * An array rather than a join table: tags are read with the product on
     * every listing, and a GIN index (added in the migration) answers
     * "has this tag" without a join.
     */
    tags: text().array(),
    // Staff-only. Must never reach the storefront.
    internalNote: text(),
    /**
     * A price floor. The form warns rather than blocks — a hard stop gets in
     * the way of a genuine clearance — so this records intent, not a
     * constraint.
     */
    minAllowedPriceCents: integer(),
  },
  (t) => [
    index("products_status_published_idx").on(t.status, t.publishedAt.desc()),
    index("products_brand_idx").on(t.brandId),
    // Cheapest-first and price-range filters on a listing page, restricted to
    // what is actually visible.
    index("products_live_price_idx")
      .on(t.minPriceCents)
      .where(sql`${t.status} = 'active'`),
    // Newest-first, the default listing order.
    index("products_live_published_idx")
      .on(t.publishedAt.desc())
      .where(sql`${t.status} = 'active'`),
    // "In stock, newest first" — the default listing for most shoppers.
    index("products_buyable_idx")
      .on(t.publishedAt.desc())
      .where(sql`${t.status} = 'active' and ${t.inStock}`),
    // Best Sellers.
    index("products_bestselling_idx")
      .on(t.salesCount.desc())
      .where(sql`${t.status} = 'active'`),
    index("products_featured_idx")
      .on(t.publishedAt.desc())
      .where(sql`${t.status} = 'active' and ${t.isFeatured}`),
  ],
);

export const productImages = pgTable(
  "product_images",
  {
    id: uuid().primaryKey().defaultRandom(),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    url: text().notNull(),
    alt: text(),
    position: integer().notNull().default(0),
  },
  (t) => [index("product_images_product_position_idx").on(t.productId, t.position)],
);

/**
 * An option axis, per product: "Size", "Colour", "Device".
 *
 * Per-product rather than global, because products genuinely differ in their
 * axes — shoes need Size and Width, a screen protector needs only Device. That
 * also means adding a third axis to one product needs no migration.
 */
export const optionTypes = pgTable(
  "option_types",
  {
    id: uuid().primaryKey().defaultRandom(),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    name: text().notNull(),
    kind: optionKind().notNull().default("other"),
    position: integer().notNull().default(0),
  },
  (t) => [
    unique("option_types_product_name_key").on(t.productId, t.name),
    // `id` is unique alone; this pairing is the target of option_values'
    // composite key, which is what lets a row-level check there know whether
    // its parent axis is a device axis.
    unique("option_types_id_kind_key").on(t.id, t.kind),
  ],
);

/** A value on an axis: "M", "Red", "256GB", "17 Pro Max". */
export const optionValues = pgTable(
  "option_values",
  {
    id: uuid().primaryKey().defaultRandom(),
    optionTypeId: uuid()
      .notNull()
      .references(() => optionTypes.id, { onDelete: "cascade" }),
    value: text().notNull(),
    /**
     * Denormalised from the parent axis and held honest by a composite foreign
     * key on (option_type_id, kind), declared in migration 0017 with ON UPDATE
     * CASCADE. It exists so the check below can be a plain row-level rule
     * rather than a trigger reaching into option_types.
     */
    kind: optionKind().notNull().default("other"),
    /**
     * Set when this value names a real device.
     *
     * Selling a cover at a different price per phone size makes the device an
     * option axis — and "shop by device" reads product_device_fit, which rolls
     * up from variant_device_fit and wants a real device_models row. Without
     * this the same devices would be entered twice: once as axis text, once in
     * the fitment picker. Generating variants writes the fitment rows straight
     * from here.
     *
     * Nullable even on a device axis: the catalog still carries device labels
     * nobody has identified ("A3", "X 11PRO"), and those must not block a sale.
     * Such a variant simply never appears under "shop by device".
     * The reference to device_models is declared in migration 0017, not here:
     * devices.ts already imports from this file, so naming it would make the
     * two modules circular — and Drizzle resolves a `references` callback at
     * module-init time, where a cycle yields undefined rather than an error.
     */
    deviceModelId: uuid(),
    position: integer().notNull().default(0),
  },
  (t) => [
    unique("option_values_type_value_key").on(t.optionTypeId, t.value),
    // The same phone twice on one axis would generate duplicate variants.
    uniqueIndex("option_values_type_device_uq").on(
      t.optionTypeId,
      t.deviceModelId,
    ),
    check(
      "option_values_device_only_on_device_axis",
      sql`${t.deviceModelId} is null or ${t.kind} = 'device_fit'`,
    ),
  ],
);

/**
 * The sellable unit. Price, SKU and stock live here.
 *
 * The export proves this is right: every line with a blank price carries priced
 * options, and no line has both. A product with no options still has exactly
 * one variant.
 *
 * `costCents` is what you pay the wholesaler, `priceCents` what the customer
 * pays. Cost must never reach the storefront.
 */
export const variants = pgTable(
  "variants",
  {
    id: uuid().primaryKey().defaultRandom(),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    sku: text().unique(),
    // Denormalized for display: "Black / 17 Pro Max".
    title: text().notNull(),
    priceCents: integer().notNull(),
    costCents: integer(),
    compareAtCents: integer(),
    /**
     * A scheduled sale. Per variant, not per product, because your catalog
     * prices options separately — a 32GB flash drive at $4.50 and a 512GB at
     * $29 do not share a discount.
     *
     * Outside the window `priceCents` applies; inside it, this does. Resolved
     * at read time rather than by a job rewriting prices, so a sale that ends
     * cannot leave a stale price behind.
     */
    salePriceCents: integer(),
    saleStartsAt: timestamp({ withTimezone: true }),
    saleEndsAt: timestamp({ withTimezone: true }),
    weightGrams: integer(),
    imageId: uuid().references(() => productImages.id, { onDelete: "set null" }),
    position: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("variants_product_position_idx").on(t.productId, t.position),
    check("variants_price_cents_nonneg", sql`${t.priceCents} >= 0`),
    check("variants_cost_cents_nonneg", sql`${t.costCents} >= 0`),
    check("variants_compare_at_cents_nonneg", sql`${t.compareAtCents} >= 0`),
    check("variants_sale_price_nonneg", sql`${t.salePriceCents} >= 0`),
    // A window with only one end is ambiguous about when the sale applies.
    check(
      "variants_sale_window_complete",
      sql`(${t.salePriceCents} is null) = (${t.saleStartsAt} is null) and (${t.saleStartsAt} is null) = (${t.saleEndsAt} is null)`,
    ),
  ],
);

/**
 * A variant is the combination of option values it maps to — one row per axis.
 *
 * This is what makes a genuine matrix possible. 22 lines in the export need it:
 * DR-001202 is 15 colours x 4 device fits, which a flat option list cannot
 * express.
 */
export const variantOptions = pgTable(
  "variant_options",
  {
    variantId: uuid()
      .notNull()
      .references(() => variants.id, { onDelete: "cascade" }),
    optionValueId: uuid()
      .notNull()
      .references(() => optionValues.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.variantId, t.optionValueId] })],
);

/**
 * Many-to-many, because a Razer gaming headset belongs under Headphones and
 * should also be reachable from Gaming.
 *
 * Exactly one row per product may be primary — enforced by a partial unique
 * index, not by application code — and that row drives breadcrumbs and the
 * canonical URL.
 */
export const productCategories = pgTable(
  "product_categories",
  {
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    categoryId: uuid()
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    isPrimary: boolean().notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.productId, t.categoryId] }),
    index("product_categories_category_idx").on(t.categoryId),
    uniqueIndex("product_categories_one_primary_idx")
      .on(t.productId)
      .where(sql`${t.isPrimary}`),
  ],
);
