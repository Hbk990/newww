import { and, asc, eq, gte, sql } from "drizzle-orm";

import { db } from "@/db";
import { priceHistory, variants } from "@/db/schema";

import { lowestOf, PRICE_FLOOR_DAYS, type PriceFloor } from "./price-window";

export type { PriceFloor };

/**
 * The lowest price a variant has been offered at recently.
 *
 * What it measures, precisely, because a figure like this is easy to overstate:
 * the lowest **list price** (`price_history.field = 'price'`) in force at any
 * point in the last 30 days. It does **not** account for sale windows — a
 * variant discounted through `sale_price_cents` for a weekend was cheaper than
 * this figure says.
 *
 * That matters if it is ever shown beside a discount claim: consumer rules in
 * several places require the lowest price *actually charged*, which would need
 * the sale windows folded in. Treat this as "cheapest it has listed at", not as
 * a compliance figure.
 *
 * The window's opening price comes from the `old_cents` of the earliest change
 * inside it, which is why this table keeps both sides of every change. Walking
 * forward from the first row ever recorded would work only if no write was ever
 * missed, and answering questions when one was is the point of the table.
 */
export async function priceFloor(
  variantId: string,
  days = PRICE_FLOOR_DAYS,
): Promise<PriceFloor | null> {
  const [variant] = await db
    .select({ priceCents: variants.priceCents })
    .from(variants)
    .where(eq(variants.id, variantId));
  if (!variant) return null;

  const since = new Date(Date.now() - days * 86_400_000);

  const changes = await db
    .select({
      oldCents: priceHistory.oldCents,
      newCents: priceHistory.newCents,
    })
    .from(priceHistory)
    .where(
      and(
        eq(priceHistory.variantId, variantId),
        eq(priceHistory.field, "price"),
        gte(priceHistory.createdAt, since),
      ),
    )
    // Earliest first: lowestOf reads changes[0] as the window's opening price.
    .orderBy(asc(priceHistory.createdAt));

  const lowestCents = lowestOf(variant.priceCents, changes);
  return {
    lowestCents,
    isCurrent: lowestCents >= variant.priceCents,
    days,
  };
}

/**
 * The floor across a whole product, for a page showing one figure rather than
 * one per variant.
 */
export async function productPriceFloor(
  productId: string,
  days = PRICE_FLOOR_DAYS,
): Promise<PriceFloor | null> {
  const rows = await db
    .select({ id: variants.id })
    .from(variants)
    .where(eq(variants.productId, productId));
  if (rows.length === 0) return null;

  const floors = await Promise.all(rows.map((r) => priceFloor(r.id, days)));
  const found = floors.filter((f): f is PriceFloor => f !== null);
  if (found.length === 0) return null;

  const lowestCents = Math.min(...found.map((f) => f.lowestCents));
  return {
    lowestCents,
    isCurrent: found.some((f) => f.isCurrent && f.lowestCents === lowestCents),
    days,
  };
}

/** Whether anything at all is recorded, so a page can show a "no data" state. */
export async function hasPriceHistory(variantId: string): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(priceHistory)
    .where(eq(priceHistory.variantId, variantId));
  return (row?.n ?? 0) > 0;
}
