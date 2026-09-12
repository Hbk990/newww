import { asc } from "drizzle-orm";

import { db } from "@/db";
import { shippingRates, shippingZones, storeSettings } from "@/db/schema";

import { priceAfterFreeDelivery } from "./regions";

export type ShippingQuote = {
  zoneId: string;
  zoneName: string;
  rateId: string;
  rateName: string;
  /** What to charge, after any free-delivery threshold has been applied. */
  priceCents: number;
  free: boolean;
};

/**
 * What delivery costs to every region we cover, for a basket of this size.
 *
 * One function rather than a per-region lookup, because the checkout page needs
 * all of them at once: the fee changes as the shopper picks their governorate,
 * and a round trip per change would either lag behind the select or need the
 * price computed in the browser, where it could be edited.
 *
 * Regions absent from the result are not delivered to. That distinction has to
 * survive to the caller — falling back to a default fee is how a shop delivers
 * to Akkar for the Beirut price and loses money on every such order with
 * nothing in the record to explain it.
 */
export async function quotesByRegion(
  subtotalCents: number,
): Promise<Record<string, ShippingQuote>> {
  const zones = await db
    .select({
      id: shippingZones.id,
      name: shippingZones.name,
      regions: shippingZones.regions,
    })
    .from(shippingZones)
    .orderBy(asc(shippingZones.position));

  const rates = await db
    .select({
      id: shippingRates.id,
      zoneId: shippingRates.zoneId,
      name: shippingRates.name,
      priceCents: shippingRates.priceCents,
      minSubtotalCents: shippingRates.minSubtotalCents,
      position: shippingRates.position,
    })
    .from(shippingRates)
    .orderBy(asc(shippingRates.position));

  /*
   * store_settings has no row until someone saves the settings screen, so a
   * missing row reads as "no shop-wide threshold" rather than throwing. That is
   * the state the shop is in today.
   */
  const [settings] = await db
    .select({ threshold: storeSettings.freeDeliveryThresholdCents })
    .from(storeSettings)
    .limit(1);

  // Lowest position wins per zone. Adding an express option later means
  // inserting at a higher position, not editing this.
  const cheapestByZone = new Map<string, (typeof rates)[number]>();
  for (const rate of rates) {
    if (!cheapestByZone.has(rate.zoneId)) cheapestByZone.set(rate.zoneId, rate);
  }

  const byRegion: Record<string, ShippingQuote> = {};
  for (const zone of zones) {
    const rate = cheapestByZone.get(zone.id);
    // A zone with no rate is a half-finished configuration. Its regions are
    // left out, so checkout refuses rather than inventing a price for them.
    if (!rate) continue;

    const { priceCents, free } = priceAfterFreeDelivery(
      rate.priceCents,
      subtotalCents,
      rate.minSubtotalCents,
      settings?.threshold ?? null,
    );

    for (const region of zone.regions) {
      /*
       * First zone wins. A region should belong to exactly one zone and nothing
       * in the schema enforces it, so zones are read in `position` order and a
       * region already claimed is not overwritten — the outcome is at least
       * deterministic rather than depending on row order.
       */
      if (region in byRegion) continue;
      byRegion[region] = {
        zoneId: zone.id,
        zoneName: zone.name,
        rateId: rate.id,
        rateName: rate.name,
        priceCents,
        free,
      };
    }
  }

  return byRegion;
}

/**
 * The quote for one region, or null when we do not deliver there.
 *
 * A lookup into `quotesByRegion` rather than its own query, so the price the
 * order is charged cannot drift from the price the checkout page displayed.
 */
export async function quoteShipping(
  region: string,
  subtotalCents: number,
): Promise<ShippingQuote | null> {
  const quotes = await quotesByRegion(subtotalCents);
  return quotes[region] ?? null;
}
