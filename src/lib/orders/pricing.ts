/**
 * The arithmetic of an order, with nothing else attached.
 *
 * Split out of `create.ts` because that module imports `@/db`, which opens a
 * connection the moment it is loaded. Pricing and the idempotency fingerprint
 * are pure functions over their arguments, and keeping them here means they
 * can be read, reasoned about and tested without a database anywhere near
 * them.
 */
import type { CreateOrderRequest } from "./create";

/**
 * A sale price counts only inside its window.
 *
 * The window is always complete when a sale price is set — the
 * `variants_sale_window_complete` check makes the price and both dates all
 * null or all present — so there is no "sale with no end date" to handle. The
 * null guards below are for the no-sale case only.
 */
export function effectivePrice(
  row: {
    priceCents: number;
    salePriceCents: number | null;
    saleStartsAt: Date | null;
    saleEndsAt: Date | null;
  },
  now: Date,
): number {
  if (row.salePriceCents === null || !row.saleStartsAt || !row.saleEndsAt) {
    return row.priceCents;
  }
  const live = row.saleStartsAt <= now && now <= row.saleEndsAt;
  return live ? row.salePriceCents : row.priceCents;
}

/**
 * A stable fingerprint of the order being asked for.
 *
 * Not a cryptographic hash — it only has to differ when the request differs,
 * so that reusing a key for a different basket is caught.
 */
export function hashRequest(request: CreateOrderRequest): string {
  const lines = [...request.lines]
    .map((l) => `${l.variantId}:${l.quantity}`)
    .sort()
    .join("|");
  return [
    request.email.trim().toLowerCase(),
    request.phone.replace(/\s+/g, ""),
    request.shippingCents,
    lines,
  ].join("::");
}
