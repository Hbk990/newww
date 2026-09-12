/**
 * Lebanon's eight governorates, as the delivery zones match them.
 *
 * A closed list rather than a free-text field, because the zone lookup is an
 * exact match against `shipping_zones.regions`. Left free, "Mt Lebanon", "Jabal
 * Loubnan" and "mount lebanon" would all fail to match and the shopper would be
 * told the shop does not deliver to them — while the admin screen showed a zone
 * that plainly covers it.
 *
 * The order is the one a Lebanese shopper expects to scan: the two most likely
 * first, then the rest roughly north to south.
 */
export const LEBANON_REGIONS = [
  "Beirut",
  "Mount Lebanon",
  "North",
  "Akkar",
  "Beqaa",
  "Baalbek-Hermel",
  "South",
  "Nabatieh",
] as const;

export type Region = (typeof LEBANON_REGIONS)[number];

export function isRegion(value: string): value is Region {
  return (LEBANON_REGIONS as readonly string[]).includes(value);
}

/**
 * Whether delivery is free, and the price to charge.
 *
 * Pure, and separate from the database lookup, because this is the part with
 * the rules in it: two independent thresholds can make a delivery free and
 * either is enough. The rate's own `minSubtotalCents` is a per-zone offer
 * ("free over $50 to Beirut"); `store_settings.freeDeliveryThresholdCents` is a
 * shop-wide one. Whichever the basket clears, the shopper pays nothing.
 */
export function priceAfterFreeDelivery(
  priceCents: number,
  subtotalCents: number,
  rateMinSubtotalCents: number | null,
  storeThresholdCents: number | null,
): { priceCents: number; free: boolean } {
  const clears = (threshold: number | null) =>
    threshold !== null && subtotalCents >= threshold;

  if (clears(rateMinSubtotalCents) || clears(storeThresholdCents)) {
    return { priceCents: 0, free: true };
  }
  return { priceCents, free: false };
}
