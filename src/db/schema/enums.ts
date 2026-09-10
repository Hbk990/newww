import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Postgres enums.
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

export const userRole = pgEnum("user_role", ["customer", "staff", "admin"]);

/** Whether a variant can be sold past zero stock. */
export const inventoryPolicy = pgEnum("inventory_policy", ["deny", "continue"]);

export const cartStatus = pgEnum("cart_status", [
  "active",
  "converted",
  "abandoned",
]);

/**
 * The Cash on Delivery lifecycle. An order stays `pending` until someone phones
 * the customer to confirm it, and only a `confirmed` order is dispatched.
 * Skipping that call means paying couriers to deliver parcels nobody accepts.
 */
export const orderStatus = pgEnum("order_status", [
  "pending",
  "confirmed",
  "cancelled",
]);

/**
 * No gateway, so there is no `authorized` step: cash is either collected or it
 * is not.
 */
export const paymentStatus = pgEnum("payment_status", [
  "unpaid",
  "paid",
  "partially_refunded",
  "refunded",
]);

export const fulfillmentStatus = pgEnum("fulfillment_status", [
  "unfulfilled",
  "partial",
  "fulfilled",
]);

export const discountKind = pgEnum("discount_kind", [
  "percent",
  "fixed",
  "free_shipping",
]);

/**
 * Cash on Delivery is the only method. Kept as an enum rather than dropped
 * because it documents intent, and because adding one later is a one-line
 * `alter type payment_method add value 'whish'` with no table migration.
 */
export const paymentMethod = pgEnum("payment_method", ["cod"]);
