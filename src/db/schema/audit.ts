import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./identity";

/**
 * Who changed what, when, and what it was before.
 *
 * `inventoryLedger` already does this for stock; this covers prices, orders,
 * products and settings. Append-only, and never deleted — an audit trail you
 * can edit is not one.
 *
 * `entityType` and `entityId` are a loose reference rather than a foreign key
 * on purpose: the log has to outlive the row it describes. A deleted product's
 * history is exactly the history you want most.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid().primaryKey().defaultRandom(),
    actorId: uuid().references(() => users.id, { onDelete: "set null" }),
    // 'product' | 'variant' | 'order' | 'inventory' | 'store_settings' | ...
    entityType: text().notNull(),
    entityId: uuid(),
    // 'create' | 'update' | 'delete' | 'publish' | 'cancel' | ...
    action: text().notNull(),
    // Set when one field changed; null for a whole-row create or delete.
    field: text(),
    oldValue: jsonb(),
    newValue: jsonb(),
    // Free-form context: the reason for a price change, a note on a refund.
    note: text(),
    ipAddress: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // "What happened to this order?" — the common query.
    index("audit_log_entity_idx").on(t.entityType, t.entityId, t.createdAt.desc()),
    // "What did this person change?"
    index("audit_log_actor_idx").on(t.actorId, t.createdAt.desc()),
    index("audit_log_recent_idx").on(t.createdAt.desc()),
  ],
);

/**
 * One row per day, holding that day's order counter.
 *
 * Order numbers are `DR-YYYYMMDD-#####` and restart each day, so the counter
 * has to be per-day rather than the single running total in `store_settings`.
 * A row is created on the first order of the day and locked while incrementing,
 * which is what keeps the sequence gapless.
 */
export const orderNumberCounters = pgTable("order_number_counters", {
  day: date().primaryKey(),
  seq: integer().notNull().default(0),
});
