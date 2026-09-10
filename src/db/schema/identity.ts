import {
  boolean,
  char,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { userRole } from "./enums";

export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull().unique(),
  // Null when the account is OAuth-only.
  passwordHash: text(),
  name: text(),
  role: userRole().notNull().default("customer"),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/**
 * The customer's saved address book. Orders do not reference this — they
 * snapshot the address into jsonb, because a customer editing or deleting an
 * address must not rewrite where a past parcel went.
 *
 * Shaped for Lebanon: `region` is the governorate and drives the shipping zone,
 * `phone` is required because couriers call ahead, and `postalCode` is nullable
 * because coverage is not reliable. `directions` exists because that is how
 * deliveries are actually found.
 */
export const addresses = pgTable(
  "addresses",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text().notNull(),
    line1: text().notNull(),
    line2: text(),
    building: text(),
    floor: text(),
    city: text().notNull(),
    region: text().notNull(),
    postalCode: text(),
    // ISO 3166-1 alpha-2
    country: char({ length: 2 }).notNull(),
    phone: text().notNull(),
    directions: text(),
    // Optional map pin. Stored as plain numerics rather than PostGIS: we only
    // ever hand these to a map, never compute distances with them.
    latitude: numeric({ precision: 10, scale: 7 }),
    longitude: numeric({ precision: 10, scale: 7 }),
    isDefault: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("addresses_user_idx").on(t.userId)],
);
