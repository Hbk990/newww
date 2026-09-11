import { and, eq, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";

import { db } from "@/db";
import { cartItems, carts, inventory, products, variants } from "@/db/schema";
import { env } from "@/env";
import { newSessionToken } from "@/lib/auth/tokens";
import { effectivePrice } from "@/lib/orders/pricing";

export const CART_COOKIE = "drphone_cart";

/**
 * How long a hold survives without the shopper touching the cart.
 *
 * Long enough to finish a checkout on a slow phone connection, short enough
 * that a browsed-and-abandoned cart does not keep the last unit off the shelf
 * for an afternoon. Every cart write pushes the expiry out again, so an active
 * shopper never loses their hold mid-session.
 */
export const RESERVATION_TTL_MINUTES = 30;

/**
 * The cart token is stored as-is, not hashed like a session token.
 *
 * Deliberate, and the reason is the blast radius: a session token grants
 * someone's identity, a cart token grants the ability to change what is in a
 * basket. The schema declares `carts.token` as the opaque address with a unique
 * index on it, and hashing would need a column rename to stay honest for no
 * meaningful gain.
 */
function cartCookieOptions(proto: string) {
  return {
    httpOnly: true,
    secure: proto === "https",
    sameSite: "lax" as const,
    path: "/",
    // Matches nothing in particular on the server — the cart row's own
    // `expiresAt` is what decides — but stops the cookie outliving any plausible
    // interest in the basket.
    maxAge: 60 * 60 * 24 * 30,
  };
}

async function requestProto(): Promise<string> {
  const requestHeaders = await headers();
  return (
    requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim() ??
    (env.isProduction ? "https" : "http")
  );
}

/** The active cart for this browser, or null. Never creates one. */
export async function currentCart() {
  const store = await cookies();
  const token = store.get(CART_COOKIE)?.value;
  if (!token) return null;

  const [cart] = await db
    .select()
    .from(carts)
    .where(and(eq(carts.token, token), eq(carts.status, "active")));
  return cart ?? null;
}

/**
 * The active cart, created if this browser has none.
 *
 * Only call this from a write path. Creating a cart row on every page view
 * would fill the table with empty carts from crawlers, and the abandoned-cart
 * worklist indexes `active` carts — it would be mostly noise.
 */
export async function getOrCreateCart(userId?: string | null) {
  const existing = await currentCart();
  if (existing) return existing;

  const token = newSessionToken();
  const [cart] = await db
    .insert(carts)
    .values({ token, userId: userId ?? null })
    .returning();
  if (!cart) throw new Error("cart insert returned no row");

  const store = await cookies();
  store.set(CART_COOKIE, token, cartCookieOptions(await requestProto()));
  return cart;
}

export type CartLine = {
  variantId: string;
  productId: string;
  productSlug: string;
  productTitle: string;
  variantTitle: string;
  sku: string | null;
  quantity: number;
  /** What it cost when it went in the basket. */
  addedPriceCents: number;
  /** What it costs now. This is what checkout will charge. */
  unitPriceCents: number;
  lineTotalCents: number;
  /** True when the two differ, so the cart can say so rather than surprise them. */
  priceChanged: boolean;
  tracked: boolean;
  /** Units a shopper could still take, for a tracked variant. Null when untracked. */
  sellable: number | null;
  /** False once a product is archived or its variant switched off. */
  purchasable: boolean;
};

export type LoadedCart = {
  id: string;
  lines: CartLine[];
  subtotalCents: number;
  count: number;
};

/**
 * The cart as the shopper should see it, priced at today's prices.
 *
 * `cart_items.unitPriceCents` is what it cost when added and is shown beside
 * the current price when they differ; it is never what gets charged. A cart
 * left open for a week would otherwise be a way to buy at last week's price.
 */
export async function loadCart(): Promise<LoadedCart | null> {
  const cart = await currentCart();
  if (!cart) return null;

  const rows = await db
    .select({
      variantId: cartItems.variantId,
      quantity: cartItems.quantity,
      addedPriceCents: cartItems.unitPriceCents,
      productId: products.id,
      productSlug: products.slug,
      productTitle: products.title,
      productStatus: products.status,
      variantTitle: variants.title,
      sku: variants.sku,
      priceCents: variants.priceCents,
      salePriceCents: variants.salePriceCents,
      saleStartsAt: variants.saleStartsAt,
      saleEndsAt: variants.saleEndsAt,
      track: inventory.track,
      available: inventory.available,
      onHand: inventory.onHand,
      reserved: inventory.reserved,
      policy: inventory.policy,
    })
    .from(cartItems)
    .innerJoin(variants, eq(variants.id, cartItems.variantId))
    .innerJoin(products, eq(products.id, variants.productId))
    // Left join: a variant with no inventory row should show as unpurchasable
    // rather than vanish from the basket with no explanation.
    .leftJoin(inventory, eq(inventory.variantId, cartItems.variantId))
    .where(eq(cartItems.cartId, cart.id))
    .orderBy(cartItems.createdAt);

  const now = new Date();
  const lines: CartLine[] = rows.map((row) => {
    const unitPriceCents = effectivePrice(row, now);
    const tracked = row.track === true;
    /*
     * Sellable excludes this cart's own hold, because `inventory.reserved`
     * includes it. Showing "0 left" to the shopper holding all of them would
     * read as an error. The number is only meaningful under 'deny' — a
     * backorder variant has no ceiling.
     */
    const sellable =
      tracked && row.policy !== "continue"
        ? (row.onHand ?? 0) - (row.reserved ?? 0) + row.quantity
        : null;

    return {
      variantId: row.variantId,
      productId: row.productId,
      productSlug: row.productSlug,
      productTitle: row.productTitle,
      variantTitle: row.variantTitle,
      sku: row.sku,
      quantity: row.quantity,
      addedPriceCents: row.addedPriceCents,
      unitPriceCents,
      lineTotalCents: unitPriceCents * row.quantity,
      priceChanged: row.addedPriceCents !== unitPriceCents,
      tracked,
      sellable,
      purchasable:
        row.productStatus === "active" &&
        row.available !== null &&
        (tracked || row.available === true),
    };
  });

  return {
    id: cart.id,
    lines,
    subtotalCents: lines.reduce((sum, line) => sum + line.lineTotalCents, 0),
    count: lines.reduce((sum, line) => sum + line.quantity, 0),
  };
}

/**
 * Hands a guest cart to the user who just signed in.
 *
 * Without this, signing in at checkout empties the basket, which is the moment
 * a shopper is least forgiving. Both carts can exist: they browsed as a guest,
 * and they already had a cart from a previous visit on another device.
 *
 * The guest lines win on conflict. They are what the shopper was looking at a
 * second ago; the older cart's contents may be weeks stale.
 */
export async function adoptGuestCart(userId: string): Promise<void> {
  const guest = await currentCart();
  if (!guest) return;

  // Already theirs — signing in again on the same browser.
  if (guest.userId === userId) return;

  const [existing] = await db
    .select()
    .from(carts)
    .where(and(eq(carts.userId, userId), eq(carts.status, "active")));

  if (!existing || existing.id === guest.id) {
    await db
      .update(carts)
      .set({ userId, updatedAt: new Date() })
      .where(eq(carts.id, guest.id));
    return;
  }

  const merged = await db.transaction(async (tx) => {
    /*
     * Holds are not moved between carts, they are dropped and retaken.
     *
     * Moving one would mean rewriting `cart_id` on the reservation and hoping
     * the two carts never both held the same variant. Dropping both sides and
     * re-reserving from the surviving lines gets the same holds by the same
     * code path that takes them normally.
     */
    await tx.execute(sql`select release_cart_reservations(${existing.id})`);

    const incoming = await tx
      .select()
      .from(cartItems)
      .where(eq(cartItems.cartId, guest.id));

    for (const line of incoming) {
      await tx
        .insert(cartItems)
        .values({
          cartId: existing.id,
          variantId: line.variantId,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
        })
        .onConflictDoUpdate({
          target: [cartItems.cartId, cartItems.variantId],
          set: { quantity: line.quantity, unitPriceCents: line.unitPriceCents },
        });
    }

    await tx.execute(sql`select release_cart_reservations(${guest.id})`);
    await tx
      .update(carts)
      .set({ status: "abandoned", updatedAt: new Date() })
      .where(eq(carts.id, guest.id));
    await tx
      .update(carts)
      .set({ updatedAt: new Date() })
      .where(eq(carts.id, existing.id));

    return tx.select().from(cartItems).where(eq(cartItems.cartId, existing.id));
  });

  /*
   * Retaking the holds happens after the merge commits, one line at a time,
   * and a failure is swallowed.
   *
   * This runs immediately after a successful sign-in. If a line can no longer
   * be held — the shopper's guest cart wanted three and there are two left —
   * then raising here would fail the sign-in itself, which is an absurd
   * outcome for a basket problem. The line stays in the cart unheld, `loadCart`
   * reports what is actually available, and checkout refuses it with a message
   * about that line rather than about signing in.
   *
   * Per line rather than in one transaction for the same reason: one
   * unholdable line must not cost the others their holds.
   */
  for (const line of merged) {
    await db
      .execute(
        sql`select reserve_stock(${line.variantId}, ${line.quantity}, ${existing.id},
              make_interval(mins => ${RESERVATION_TTL_MINUTES}))`,
      )
      .catch(() => {});
  }

  const store = await cookies();
  store.set(CART_COOKIE, existing.token, cartCookieOptions(await requestProto()));
}
