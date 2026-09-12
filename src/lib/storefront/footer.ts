import { asc } from "drizzle-orm";

import { db } from "@/db";
import { shippingRates, shippingZones } from "@/db/schema";

export type DeliveryZone = {
  name: string;
  /** The governorates this zone covers, in the order they were configured. */
  regions: string[];
  /** The cheapest rate in the zone, which is what a footer should quote. */
  fromCents: number;
};

/**
 * What delivery costs, by zone, for the footer.
 *
 * Separate from `quotesByRegion`, which prices a specific basket: this answers
 * "what does delivery cost to my area" for someone who has not chosen anything
 * yet, which is a question worth answering before they start rather than at
 * the last screen. A shop that hides its delivery fee until checkout is a shop
 * people abandon at checkout.
 *
 * The cheapest rate per zone, described as "from", because a zone can hold
 * several (express, heavy) and the lowest is the honest headline for one. The
 * free-delivery threshold is deliberately not applied — there is no basket to
 * apply it to — and the footer names the threshold separately instead.
 *
 * A zone with no rate is left out: it cannot be quoted, and the checkout would
 * refuse to deliver there anyway.
 */
export async function deliveryZones(): Promise<DeliveryZone[]> {
  const [zones, rates] = await Promise.all([
    db
      .select({
        id: shippingZones.id,
        name: shippingZones.name,
        regions: shippingZones.regions,
      })
      .from(shippingZones)
      .orderBy(asc(shippingZones.position)),
    db
      .select({
        zoneId: shippingRates.zoneId,
        priceCents: shippingRates.priceCents,
      })
      .from(shippingRates),
  ]);

  const cheapest = new Map<string, number>();
  for (const rate of rates) {
    const current = cheapest.get(rate.zoneId);
    if (current === undefined || rate.priceCents < current) {
      cheapest.set(rate.zoneId, rate.priceCents);
    }
  }

  return zones
    .filter((zone) => cheapest.has(zone.id))
    .map((zone) => ({
      name: zone.name,
      regions: zone.regions,
      fromCents: cheapest.get(zone.id)!,
    }));
}
