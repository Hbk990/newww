"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { cartItems, carts, inventory, products, variants } from "@/db/schema";
import { currentUser } from "@/lib/auth/session";
import { effectivePrice } from "@/lib/orders/pricing";

import { getOrCreateCart, RESERVATION_TTL_MINUTES } from "./cart";

export type CartResult =
  | { ok: true; count: number }
  | { ok: false; error: string };

/**
 * Quantity ceiling per line.
 *
 * Not a stock limit — an untracked variant has no count to check against, and
 * this is a wholesaler where large orders are normal. It exists so a typo or a
 * scripted request cannot put 900,000 of something in a basket and have the
 * reservation arithmetic and the order total carry it.
 */
const MAX_PER_LINE = 999;

const lineInput = z.object({
  variantId: z.uuid("That is not a product we recognise."),
  quantity: z.coerce
    .number()
    .int("Whole numbers only.")
    .min(0)
    .max(MAX_PER_LINE, `${MAX_PER_LINE} is the most of one item per order.`),
});

/**
 * Puts a variant in the basket, or changes how many are in it.
 *
 * One function for add and update because they are the same operation: the
 * cart holds one line per variant and the caller says how many should be on
 * it. `quantity: 0` removes the line, so the storefront needs no separate
 * delete path.
 *
 * The hold is taken in the same transaction as the line. A line without a hold
 * is a promise the shop cannot keep, and a hold without a line is stock held
 * for nobody until it expires.
 */
export async function setCartLine(
  variantId: string,
  quantity: number,
): Promise<CartResult> {
  const parsed = lineInput.safeParse({ variantId, quantity });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check that quantity.",
    };
  }
  const input = parsed.data;

  const user = await currentUser();
  const cart = await getOrCreateCart(user?.id ?? null);

  // Priced here rather than trusted from the client, for the same reason
  // createOrder re-reads prices: a caller that names its own price buys cheap.
  const [row] = await db
    .select({
      priceCents: variants.priceCents,
      salePriceCents: variants.salePriceCents,
      saleStartsAt: variants.saleStartsAt,
      saleEndsAt: variants.saleEndsAt,
      productTitle: products.title,
      productStatus: products.status,
      variantTitle: variants.title,
      available: inventory.available,
      track: inventory.track,
    })
    .from(variants)
    .innerJoin(products, eq(products.id, variants.productId))
    .leftJoin(inventory, eq(inventory.variantId, variants.id))
    .where(eq(variants.id, input.variantId));

  if (!row) return { ok: false, error: "That item no longer exists." };

  if (input.quantity > 0) {
    // Distinguished from out-of-stock on purpose: no inventory row is a setup
    // fault, and telling someone it is unavailable sends them back tomorrow to
    // find it still unavailable.
    if (row.available === null) {
      return { ok: false, error: "That item is not set up for sale yet." };
    }
    if (row.productStatus !== "active") {
      return { ok: false, error: `${row.productTitle} is not on sale.` };
    }
  }

  try {
    await db.transaction(async (tx) => {
      if (input.quantity === 0) {
        await tx
          .delete(cartItems)
          .where(
            and(
              eq(cartItems.cartId, cart.id),
              eq(cartItems.variantId, input.variantId),
            ),
          );
      } else {
        await tx
          .insert(cartItems)
          .values({
            cartId: cart.id,
            variantId: input.variantId,
            quantity: input.quantity,
            unitPriceCents: effectivePrice(row, new Date()),
          })
          .onConflictDoUpdate({
            target: [cartItems.cartId, cartItems.variantId],
            /*
             * The quantity is replaced, and so is the snapshot price.
             *
             * Touching a line is the moment the shopper looked at it, so
             * re-snapshotting means the "price changed since you added this"
             * notice reflects a change they have not seen rather than one they
             * just acknowledged.
             */
            set: {
              quantity: input.quantity,
              unitPriceCents: effectivePrice(row, new Date()),
            },
          });
      }

      // Absolute, matching the line: reserve_stock sets the hold to exactly
      // this many, so a double-submitted form cannot hold twice the stock.
      await tx.execute(
        sql`select reserve_stock(${input.variantId}, ${input.quantity}, ${cart.id},
              make_interval(mins => ${RESERVATION_TTL_MINUTES}))`,
      );

      await tx
        .update(carts)
        .set({ updatedAt: new Date() })
        .where(eq(carts.id, cart.id));
    });
  } catch (error) {
    const stock = insufficientStock(error);
    if (stock) {
      return {
        ok: false,
        error: `There isn't that much ${row.productTitle} left.`,
      };
    }
    if (unavailable(error)) {
      return { ok: false, error: `${row.productTitle} has just gone off sale.` };
    }
    throw error;
  }

  revalidatePath("/cart");
  return { ok: true, count: await lineCount(cart.id) };
}

/** Empties the basket and gives every hold back. */
export async function clearCart(): Promise<CartResult> {
  const user = await currentUser();
  const cart = await getOrCreateCart(user?.id ?? null);

  await db.transaction(async (tx) => {
    await tx.execute(sql`select release_cart_reservations(${cart.id})`);
    await tx.delete(cartItems).where(eq(cartItems.cartId, cart.id));
    await tx
      .update(carts)
      .set({ updatedAt: new Date() })
      .where(eq(carts.id, cart.id));
  });

  revalidatePath("/cart");
  return { ok: true, count: 0 };
}

async function lineCount(cartId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`coalesce(sum(${cartItems.quantity}), 0)::int` })
    .from(cartItems)
    .where(eq(cartItems.cartId, cartId));
  return row?.n ?? 0;
}

/**
 * Both of these walk `error.cause`, because Drizzle wraps the driver error and
 * the SQLSTATE is not on the object it hands back. This has caught us out in
 * every actions file in the project.
 */
function insufficientStock(error: unknown): boolean {
  return matchesRaise(error, /insufficient stock to reserve/);
}

function unavailable(error: unknown): boolean {
  return matchesRaise(error, /marked unavailable/);
}

function matchesRaise(error: unknown, message: RegExp): boolean {
  for (let current = error, depth = 0; current && depth < 6; depth += 1) {
    if (typeof current === "object" && "code" in current) {
      const e = current as { code?: string; message?: string };
      if (e.code === "23514" && message.test(e.message ?? "")) return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
