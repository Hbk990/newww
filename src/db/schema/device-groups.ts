import { index, integer, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";

import { deviceModels } from "./devices";

/**
 * A saved set of device models — "iPhone 15/16/17 Pro Max", "Samsung S24/S25
 * Ultra".
 *
 * Your export proves the need: one screen protector is listed against 22
 * models. Picking 22 models by hand, for every protector, is the kind of task
 * people stop doing properly. A group is chosen once and expands to its members
 * when fitment is saved.
 *
 * Groups are an admin convenience, not a storefront concept: fitment is still
 * stored per model in `variant_device_fit`, so a group changing later does not
 * silently rewrite what an existing product claims to fit.
 */
export const deviceGroups = pgTable("device_groups", {
  id: uuid().primaryKey().defaultRandom(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  position: integer().notNull().default(0),
});

export const deviceGroupModels = pgTable(
  "device_group_models",
  {
    deviceGroupId: uuid()
      .notNull()
      .references(() => deviceGroups.id, { onDelete: "cascade" }),
    deviceModelId: uuid()
      .notNull()
      .references(() => deviceModels.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.deviceGroupId, t.deviceModelId] }),
    index("device_group_models_model_idx").on(t.deviceModelId),
  ],
);
