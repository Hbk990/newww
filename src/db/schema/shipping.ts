import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";

/**
 * Single-country store, so a zone is a set of governorates rather than
 * countries: Beirut, Mount Lebanon, North, Akkar, South, Nabatieh, Bekaa,
 * Baalbek-Hermel. An address's `region` is matched against these.
 */
export const shippingZones = pgTable("shipping_zones", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  regions: text().array().notNull(),
  position: integer().notNull().default(0),
});

export const shippingRates = pgTable(
  "shipping_rates",
  {
    id: uuid().primaryKey().defaultRandom(),
    zoneId: uuid()
      .notNull()
      .references(() => shippingZones.id, { onDelete: "cascade" }),
    // "Standard (3-5 days)"
    name: text().notNull(),
    priceCents: integer().notNull(),
    // Free over this subtotal.
    minSubtotalCents: integer(),
    maxWeightGrams: integer(),
    position: integer().notNull().default(0),
  },
  (t) => [check("shipping_rates_price_nonneg", sql`${t.priceCents} >= 0`)],
);
