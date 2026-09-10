import { sql } from "drizzle-orm";
import {
  char,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { variants } from "./catalog";
import { carts } from "./cart";
import { discounts } from "./discounts";
import {
  fulfillmentStatus,
  orderStatus,
  paymentMethod,
  paymentStatus,
} from "./enums";
import { users } from "./identity";

/**
 * An order.
 *
 * On Cash on Delivery this is a promise, not a payment: it is created `unpaid`
 * and stays that way until a courier remits cash, which is what creates a
 * `payments` row. Never infer paid-ness from the order existing.
 *
 * The three status fields are independent on purpose. A single combined enum
 * collapses the first time you partially refund a partially shipped order.
 *
 * Addresses are snapshotted into jsonb rather than referenced: the customer may
 * edit or delete the address later, and that must not rewrite where a past
 * parcel went.
 */
export const orders = pgTable(
  "orders",
  {
    id: uuid().primaryKey().defaultRandom(),
    // Human-facing, e.g. "1042".
    orderNumber: text().notNull().unique(),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    // Standalone, because guest checkout has no user row to read it from.
    email: text().notNull(),

    status: orderStatus().notNull().default("pending"),
    paymentStatus: paymentStatus().notNull().default("unpaid"),
    fulfillmentStatus: fulfillmentStatus().notNull().default("unfulfilled"),

    currency: char({ length: 3 }).notNull().default("USD"),
    subtotalCents: integer().notNull(),
    discountCents: integer().notNull().default(0),
    shippingCents: integer().notNull().default(0),
    taxCents: integer().notNull().default(0),
    // What the courier must physically collect.
    totalCents: integer().notNull(),

    shippingAddress: jsonb().notNull(),
    billingAddress: jsonb(),
    shippingMethod: text(),

    paymentMethod: paymentMethod().notNull().default("cod"),
    // Not optional here: couriers call ahead, and with no card authorization
    // the phone number is the only thing standing between you and fake orders.
    phone: text().notNull(),
    // The courier's collection fee, when it is passed to the customer.
    codFeeCents: integer().notNull().default(0),

    // The confirmation call that gates dispatch.
    confirmedAt: timestamp({ withTimezone: true }),
    confirmedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    confirmAttempts: integer().notNull().default(0),

    cartId: uuid().references(() => carts.id, { onDelete: "set null" }),
    placedAt: timestamp({ withTimezone: true }),
    cancelledAt: timestamp({ withTimezone: true }),
    // 'refused_delivery' | 'customer_request' | ...
    cancelReason: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("orders_user_created_idx").on(t.userId, t.createdAt.desc()),
    index("orders_email_idx").on(t.email),
    index("orders_status_created_idx").on(t.status, t.createdAt.desc()),
    // The confirmation-call queue: the orders someone has to phone, oldest
    // first. Partial, so it holds only the work outstanding.
    index("orders_awaiting_confirmation_idx")
      .on(t.createdAt)
      .where(sql`${t.status} = 'pending'`),
    // The COD collection worklist: dispatched but not yet paid.
    index("orders_unpaid_idx")
      .on(t.createdAt)
      .where(sql`${t.paymentStatus} = 'unpaid' and ${t.status} = 'confirmed'`),
    check("orders_total_nonneg", sql`${t.totalCents} >= 0`),
  ],
);

/**
 * Immutable snapshot of what was bought. Render from these columns only.
 *
 * `variantId` is kept for reporting but nullable and never joined for display:
 * products get renamed, repriced and deleted, and a two-year-old invoice must
 * still show what the customer actually received.
 */
export const orderItems = pgTable(
  "order_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    variantId: uuid().references(() => variants.id, { onDelete: "set null" }),
    productTitle: text().notNull(),
    variantTitle: text().notNull(),
    sku: text(),
    unitPriceCents: integer().notNull(),
    quantity: integer().notNull(),
    totalCents: integer().notNull(),
  },
  (t) => [
    index("order_items_order_idx").on(t.orderId),
    check("order_items_quantity_positive", sql`${t.quantity} > 0`),
  ],
);

export const orderDiscounts = pgTable(
  "order_discounts",
  {
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    // Nullable: the discount may be deleted, but the order must keep its record.
    discountId: uuid().references(() => discounts.id, { onDelete: "set null" }),
    // Snapshotted, for the same reason.
    code: text().notNull(),
    amountCents: integer().notNull(),
  },
  (t) => [primaryKey({ columns: [t.orderId, t.code] })],
);

/**
 * Cash actually received. A row appears only when the courier remits, so an
 * unpaid order has none and the absence of a row is the meaningful state.
 */
export const payments = pgTable(
  "payments",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    method: paymentMethod().notNull().default("cod"),
    amountCents: integer().notNull(),
    currency: char({ length: 3 }).notNull(),
    // Couriers remit in batches; this is what a batch reconciles against.
    remittanceRef: text(),
    courier: text(),
    collectedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    collectedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    note: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("payments_order_idx").on(t.orderId),
    index("payments_remittance_idx").on(t.remittanceRef),
    check("payments_amount_positive", sql`${t.amountCents} > 0`),
  ],
);

/**
 * Cash refunds recorded by staff. There is no gateway to call, so this is
 * bookkeeping that must reconcile against the till — hence `issuedBy`.
 */
export const refunds = pgTable(
  "refunds",
  {
    id: uuid().primaryKey().defaultRandom(),
    paymentId: uuid()
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    amountCents: integer().notNull(),
    reason: text(),
    issuedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("refunds_payment_idx").on(t.paymentId),
    check("refunds_amount_positive", sql`${t.amountCents} > 0`),
  ],
);

/**
 * A dispatch. Local couriers have no APIs, so `carrier` is free text and there
 * is nothing to poll for tracking.
 *
 * `attempts` and `refusedAt` exist because a refused COD delivery is a routine
 * path, not an edge case: the goods come back, stock returns through the ledger,
 * and the order is cancelled unpaid.
 */
export const fulfillments = pgTable(
  "fulfillments",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    carrier: text(),
    trackingNumber: text(),
    trackingUrl: text(),
    shippedAt: timestamp({ withTimezone: true }),
    deliveredAt: timestamp({ withTimezone: true }),
    attempts: integer().notNull().default(0),
    refusedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("fulfillments_order_idx").on(t.orderId)],
);

/** Partial shipments: which items went in which box. */
export const fulfillmentItems = pgTable(
  "fulfillment_items",
  {
    fulfillmentId: uuid()
      .notNull()
      .references(() => fulfillments.id, { onDelete: "cascade" }),
    orderItemId: uuid()
      .notNull()
      .references(() => orderItems.id, { onDelete: "cascade" }),
    quantity: integer().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.fulfillmentId, t.orderItemId] }),
    check("fulfillment_items_quantity_positive", sql`${t.quantity} > 0`),
  ],
);

/**
 * Audit trail, rendered as the order timeline in the admin. Append-only.
 *
 * On COD this is the record of who phoned, who dispatched and who booked the
 * cash — the questions that actually get asked when an order goes wrong.
 */
export const orderEvents = pgTable(
  "order_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    // 'placed' | 'confirmed' | 'shipped' | 'collected' | 'refused' | 'note'
    type: text().notNull(),
    data: jsonb(),
    actorId: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_events_order_created_idx").on(t.orderId, t.createdAt)],
);
