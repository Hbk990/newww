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
    /**
     * Basis points, and zero by default.
     *
     * Prices are entered tax-inclusive, so nothing is added at checkout: the
     * figure on the product page is what the courier collects. Set a rate here
     * only if tax ever needs showing as a separate line, and then
     * `pricesIncludeTax` decides whether it is added to the total or broken out
     * of it.
     */
    taxRateBps: integer().notNull().default(0),
    pricesIncludeTax: boolean().notNull().default(true),
    /**
     * Display-only secondary currency, e.g. an LBP figure shown next to a USD
     * price. Never a second price list and never used for settlement — the rate
     * moves, and a stored LBP price would silently become wrong.
     */
    displayCurrency: char({ length: 3 }),
    displayRate: numeric({ precision: 18, scale: 6 }),
    displayRateUpdatedAt: timestamp({ withTimezone: true }),
    storeName: text().notNull(),
    /**
     * While true the storefront sends `noindex` and blocks crawlers, so a
     * half-finished catalog never gets indexed. Turn it off at launch.
     */
    isPrivate: boolean().notNull().default(true),
  },
  (t) => [check("store_settings_single_row", sql`${t.id}`)],
);
