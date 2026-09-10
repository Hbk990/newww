import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { products } from "./catalog";

/**
 * Reference copy of the wholesale catalog export.
 *
 * Products are created one at a time by hand, so nothing here is ever promoted
 * automatically. This table exists so the admin's new-product form can search
 * 1,155 known lines and prefill name, brand, category, cost and image instead
 * of retyping them. The export is known to be incomplete and partly wrong, so
 * every prefilled field stays editable, and nothing here is customer-visible.
 *
 * The searchable columns are extracted from `raw` on load: filtering and
 * sorting a jsonb column cannot use a plain index, so the lookup would get
 * slower as the table grows.
 */
export const sourceProducts = pgTable(
  "source_products",
  {
    id: uuid().primaryKey().defaultRandom(),
    // 'DRPHONEcatalog20260910.csv'
    source: text().notNull(),
    // Original sku, e.g. 'DR-001202'
    sourceRef: text().notNull(),
    // The untouched CSV row.
    raw: jsonb().notNull(),

    // Extracted for browsing.
    name: text().notNull(),
    brandName: text(),
    categoryName: text(),
    categoryGroup: text(),
    // The catalog price: what you pay.
    costCents: integer(),
    imageUrl: text(),
    optionCount: integer().notNull().default(0),
    colorCount: integer().notNull().default(0),

    // Set when a hand-created product was prefilled from this line, so the
    // lookup can show what has already been used.
    promotedProductId: uuid().references(() => products.id, {
      onDelete: "set null",
    }),
    promotedAt: timestamp({ withTimezone: true }),
    excluded: boolean().notNull().default(false),
    // 'age-restricted', 'no price', ...
    excludedReason: text(),
    needsReview: boolean().notNull().default(false),
    // 'ambiguous option axis', ...
    reviewReason: text(),
    // The curator's own note.
    note: text(),

    importedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Re-running the load updates costs in place instead of duplicating rows.
    unique("source_products_source_ref_key").on(t.source, t.sourceRef),
    index("source_products_group_category_idx").on(t.categoryGroup, t.categoryName),
    index("source_products_brand_idx").on(t.brandName),
    index("source_products_promoted_idx")
      .on(t.promotedProductId)
      .where(sql`${t.promotedProductId} is not null`),
    index("source_products_needs_review_idx")
      .on(t.needsReview)
      .where(sql`${t.needsReview}`),
    // The default lookup view: lines not yet used for a product.
    index("source_products_unused_idx")
      .on(t.importedAt.desc())
      .where(sql`${t.promotedProductId} is null and not ${t.excluded}`),
  ],
);
