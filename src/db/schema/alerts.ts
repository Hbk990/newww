import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { variants } from "./catalog";
import { alertKind, notificationChannel, notificationStatus } from "./enums";
import { users } from "./identity";
import { orders } from "./orders";

/**
 * Someone waiting to hear that a variant is back, or cheaper.
 *
 * `email` rather than a required account, because the person who wants telling
 * is often not signed in — and requiring registration loses most of them.
 *
 * The unique index covers only un-notified rows, so subscribing twice is
 * refused while a wait is outstanding but allowed again after being told.
 */
export const stockAlerts = pgTable(
  "stock_alerts",
  {
    id: uuid().primaryKey().defaultRandom(),
    variantId: uuid()
      .notNull()
      .references(() => variants.id, { onDelete: "cascade" }),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    email: text().notNull(),
    kind: alertKind().notNull(),
    // Price-drop alerts only: notify below this. Null means any drop.
    targetPriceCents: integer(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    notifiedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex("stock_alerts_pending_key")
      .on(t.variantId, t.email, t.kind)
      .where(sql`${t.notifiedAt} is null`),
    // The sweep that fires them: outstanding alerts for one variant.
    index("stock_alerts_outstanding_idx")
      .on(t.variantId)
      .where(sql`${t.notifiedAt} is null`),
  ],
);

/**
 * Outbound messages, queued then sent — customer notifications and admin
 * alerts through the same table.
 *
 * A queue rather than sending inline: an order must not fail because a mail
 * server is slow, and a failed send needs retrying without re-running whatever
 * caused it. `attempts` and `error` are what make a stuck message findable
 * instead of silently lost.
 *
 * `channel` is email-only today. Adding WhatsApp or SMS is a new enum value and
 * a new sender — this table does not change.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid().primaryKey().defaultRandom(),
    channel: notificationChannel().notNull().default("email"),
    // Address rather than a user reference: guests get order emails too.
    recipient: text().notNull(),
    // 'order_confirmed' | 'back_in_stock' | 'low_stock' | 'abandoned_cart' | ...
    template: text().notNull(),
    payload: jsonb(),
    status: notificationStatus().notNull().default("queued"),
    orderId: uuid().references(() => orders.id, { onDelete: "set null" }),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    attempts: integer().notNull().default(0),
    error: text(),
    scheduledFor: timestamp({ withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // What the sender job claims: due and not yet sent, oldest first.
    index("notifications_due_idx")
      .on(t.scheduledFor)
      .where(sql`${t.status} = 'queued'`),
    index("notifications_failed_idx")
      .on(t.createdAt.desc())
      .where(sql`${t.status} = 'failed'`),
    index("notifications_order_idx").on(t.orderId),
  ],
);
