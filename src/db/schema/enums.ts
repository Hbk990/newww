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
 * Where the order physically is. An order stays `new` until someone phones the
 * customer to confirm it, and only a `confirmed` order is dispatched — skipping
 * that call means paying couriers to deliver parcels nobody accepts.
 *
 * Eight operational values, not the nine that were asked for: `refunded` is a
 * fact about money and lives on `paymentStatus`. A refunded order is also
 * `returned` or `cancelled`, which is what happened to the goods. Keeping the
 * two apart is what lets a partial refund of a partial shipment stay
 * expressible.
 */
export const orderStatus = pgEnum("order_status", [
  "new",
  "confirmed",
  "preparing",
  "ready",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "returned",
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
  // "buy a case, get a protector free"
  "buy_x_get_y",
  // "3 cables for $5"
  "quantity_break",
]);

/**
 * Cash on Delivery is the only method. Kept as an enum rather than dropped
 * because it documents intent, and because adding one later is a one-line
 * `alter type payment_method add value 'whish'` with no table migration.
 */
export const paymentMethod = pgEnum("payment_method", ["cod"]);

/** How an order reached us, so WhatsApp volume is countable rather than guessed. */
export const orderSource = pgEnum("order_source", ["web", "whatsapp", "admin"]);

/** Reviews are held until a person approves them. */
export const reviewStatus = pgEnum("review_status", [
  "pending",
  "approved",
  "rejected",
]);

/** Why two products are linked. */
export const relationKind = pgEnum("relation_kind", [
  "cross_sell",
  "accessory",
  "similar",
]);

export const alertKind = pgEnum("alert_kind", ["back_in_stock", "price_drop"]);

/**
 * Email only for now. Kept as an enum so adding WhatsApp or SMS later is
 * `alter type` plus a sender, with no change to the notifications table.
 */
export const notificationChannel = pgEnum("notification_channel", ["email"]);

export const notificationStatus = pgEnum("notification_status", [
  "queued",
  "sent",
  "failed",
]);

export const stockCountStatus = pgEnum("stock_count_status", ["open", "closed"]);
