/**
 * The arithmetic of a price window, with no database attached.
 *
 * Split out for the same reason `orders/pricing.ts` was: `price-floor.ts`
 * imports `@/db`, which opens a connection the moment it is loaded, so nothing
 * in it can be tested without a database. This file holds the reasoning and can
 * be read and tested on its own.
 */

export const PRICE_FLOOR_DAYS = 30;

export type PriceFloor = {
  /** The lowest list price this variant has carried inside the window. */
  lowestCents: number;
  /** True when today's price is that low — there is nothing to boast about. */
  isCurrent: boolean;
  days: number;
};

/**
 * The lowest price among today's and every price the window held.
 *
 * Two things are easy to get wrong and both are tested:
 *
 *   Today's price is always a candidate. With no changes recorded it held the
 *   whole window; with changes it is the newest one. Omitting it would report a
 *   floor above the current price, which is nonsense.
 *
 *   The window's opening price is the `old_cents` of the *earliest* change in
 *   it — the price the first change moved away from. Without it, a variant that
 *   went 500 to 900 inside the window would report 900 as its floor.
 */
export function lowestOf(
  currentCents: number,
  changes: readonly { oldCents: number | null; newCents: number | null }[],
): number {
  const candidates = [currentCents];

  const opening = changes[0]?.oldCents;
  if (typeof opening === "number") candidates.push(opening);

  for (const change of changes) {
    if (typeof change.newCents === "number") candidates.push(change.newCents);
  }

  return Math.min(...candidates);
}
