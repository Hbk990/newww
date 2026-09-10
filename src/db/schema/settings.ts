import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Store configuration — exactly one row, enforced by a boolean primary key with
 * a check that it is true. A second row is a constraint violation rather than a
 * silent ambiguity about which settings apply.
 *
 * Currency lives here rather than on every variant and cart: with a single
 * currency those columns only create drift. Orders and payments keep their own
 * currency column because they are snapshots that must survive a change here.
 */
export const storeSettings = pgTable(
  "store_settings",
  {
    id: boolean().primaryKey().default(true),
    currency: char({ length: 3 }).notNull(),
    // The one country we ship to.
    country: char({ length: 2 }).notNull(),
    // Basis points. Lebanon VAT is 11%.
    taxRateBps: integer().notNull().default(1100),
    pricesIncludeTax: boolean().notNull().default(false),
    /**
     * Display-only secondary currency, e.g. an LBP figure shown next to a USD
     * price. Never a second price list and never used for settlement — the rate
     * moves, and a stored LBP price would silently become wrong.
     */
    displayCurrency: char({ length: 3 }),
    displayRate: numeric({ precision: 18, scale: 6 }),
    displayRateUpdatedAt: timestamp({ withTimezone: true }),
    orderNumberSeq: integer().notNull().default(1000),
    storeName: text().notNull(),
  },
  (t) => [check("store_settings_single_row", sql`${t.id}`)],
);
