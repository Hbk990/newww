import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Postgres enums. Only the ones the catalog and taxonomy tables need are here;
 * the commerce enums arrive with step 2b.
 *
 * Adding a value later is `alter type ... add value`, which Postgres allows
 * without rewriting tables. Removing or reordering one is not, so treat the
 * order as fixed once a migration has shipped.
 */

export const productStatus = pgEnum("product_status", [
  "draft",
  "active",
  "archived",
]);

/**
 * What an option axis actually means.
 *
 * The catalog export flattens four different axes into one untyped list (see
 * docs/CATALOG_FINDINGS.md), which is why the current site cannot filter by
 * "fits my phone". Typing them lets the variant picker render a colour swatch,
 * a capacity dropdown and a device selector differently.
 */
export const optionKind = pgEnum("option_kind", [
  "color",
  "size",
  "capacity",
  "device_fit",
  "connector",
  "power",
  "flavor",
  "other",
]);

export const attributeType = pgEnum("attribute_type", [
  "text",
  "number",
  "boolean",
  "enum",
]);

export const collectionKind = pgEnum("collection_kind", ["manual", "smart"]);
