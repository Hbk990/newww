"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { inventory, orderItems, orders, products, variants } from "@/db/schema";
import { currentUser } from "@/lib/auth/session";

import { setCartLine } from "@/lib/cart/actions";

export type ReorderResult =
  | { ok: true; added: number; skipped: string[] }
  | { ok: false; error: string };

/**
 * Puts a past order back in the basket.
 *
 * Half of what this shop sells is consumable — cables fray, chargers get left
 * at someone's house — so "the same again" is a real request, and it is the
 * reason an order history is worth more than a receipt.
 *
 * What it deliberately does not do is promise the same order. Prices move,
 * variants get archived and stock runs out, so lines are added one at a time
 * through the ordinary `setCartLine` — the same path, the same validation, the
 * same stock hold as tapping "Add to basket" — and anything it refuses is
 * named rather than silently dropped. A basket that quietly contains less than
 * was asked for is worse than one that says what is missing.
 *
 * `variantId` is nullable on an order line and is never used for display, only
 * here: a line whose variant has since been deleted cannot be reordered at
 * all, and says so.
 */
export async function reorderIntoBasket(
  orderNumber: string,
): Promise<ReorderResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Sign in to use a past order." };

  // Ownership in the where clause: an order number is guessable, so it
  // identifies an order without authorising anything.
  const [order] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(eq(orders.orderNumber, orderNumber), eq(orders.userId, user.id)),
    );

  if (!order) return { ok: false, error: "We cannot find that order." };

  const lines = await db
    .select({
      variantId: orderItems.variantId,
      productTitle: orderItems.productTitle,
      variantTitle: orderItems.variantTitle,
      quantity: orderItems.quantity,
      productStatus: products.status,
      available: inventory.available,
    })
    .from(orderItems)
    .leftJoin(variants, eq(variants.id, orderItems.variantId))
    .leftJoin(products, eq(products.id, variants.productId))
    .leftJoin(inventory, eq(inventory.variantId, variants.id))
    .where(eq(orderItems.orderId, order.id))
    .orderBy(sql`${orderItems.totalCents} desc`);

  const skipped: string[] = [];
  let added = 0;

  for (const line of lines) {
    const name =
      line.variantTitle && line.variantTitle !== line.productTitle
        ? `${line.productTitle} (${line.variantTitle})`
        : line.productTitle;

    // Gone, archived, or switched off: nothing to add, and worth naming.
    if (!line.variantId || line.productStatus !== "active") {
      skipped.push(name);
      continue;
    }

    const result = await setCartLine(line.variantId, line.quantity);
    if (result.ok) {
      added += 1;
    } else {
      // setCartLine already knows why — out of stock, unavailable, over the
      // per-line cap — and its message is the one worth passing on.
      skipped.push(`${name}: ${result.error}`);
    }
  }

  if (added === 0) {
    return {
      ok: false,
      error:
        skipped.length > 0
          ? "Nothing from that order is available right now."
          : "That order had nothing in it.",
    };
  }

  revalidatePath("/cart");
  return { ok: true, added, skipped };
}
