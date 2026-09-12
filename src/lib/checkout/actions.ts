"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";

import { db } from "@/db";
import { cartItems } from "@/db/schema";
import { currentUser } from "@/lib/auth/session";
import { CART_COOKIE, currentCart, loadCart } from "@/lib/cart/cart";
import { createOrder } from "@/lib/orders/create";
import { LEBANON_REGIONS } from "@/lib/shipping/regions";
import { quoteShipping } from "@/lib/shipping/quote";

export type CheckoutResult =
  | { ok: true; orderNumber: string; id: string; replayed: boolean }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const details = z.object({
  email: z.email("A valid email address is needed."),
  /** Lebanese mobiles are +961 then 7 or 8 digits; kept loose for landlines. */
  phone: z
    .string()
    .trim()
    .min(7, "A phone number is needed — this is how your order gets confirmed.")
    .max(30),
  line1: z.string().trim().min(3, "A street address is needed."),
  city: z.string().trim().min(2, "Which city?"),
  /**
   * A closed list, not free text: the zone lookup is an exact match against
   * `shipping_zones.regions`, so "Mt Lebanon" would find no zone and the
   * shopper would be told the shop does not deliver to them.
   */
  region: z.enum(LEBANON_REGIONS, "Choose your governorate."),
  note: z.string().trim().max(500).nullable(),
});

export type CheckoutDetails = z.input<typeof details>;

/**
 * Turns the basket into an order.
 *
 * Deliberately thin. Everything that could go wrong about an order — pricing
 * from the database rather than the client, claiming stock, the single
 * transaction, idempotency — already lives in `createOrder`, which the admin's
 * manual order form has been using since it was written. Reimplementing any of
 * it here would mean a web order and a phone order could disagree about the
 * same basket.
 *
 * What this does own: reading the lines out of the cart, validating the
 * delivery details, and deciding the fee.
 */
export async function placeOrder(
  idempotencyKey: string,
  raw: CheckoutDetails,
): Promise<CheckoutResult> {
  const parsed = details.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the highlighted fields.",
      fieldErrors,
    };
  }
  const input = parsed.data;

  const cart = await currentCart();
  if (!cart) {
    return { ok: false, error: "Your basket is empty." };
  }

  /*
   * Lines come from the cart table, not from the page that submitted.
   *
   * The form could post any basket it liked otherwise — including items the
   * shopper never added, at quantities nothing ever reserved.
   */
  const lines = await db
    .select({ variantId: cartItems.variantId, quantity: cartItems.quantity })
    .from(cartItems)
    .where(eq(cartItems.cartId, cart.id));

  if (lines.length === 0) {
    return { ok: false, error: "Your basket is empty." };
  }

  /*
   * The subtotal for the free-delivery test is priced here rather than taken
   * from the form, for the same reason the lines are. loadCart prices every
   * line at today's price, which is what createOrder will charge.
   */
  const priced = await loadCart();
  if (!priced) return { ok: false, error: "Your basket is empty." };

  const quote = await quoteShipping(input.region, priced.subtotalCents);
  if (!quote) {
    return {
      ok: false,
      error: `We do not deliver to ${input.region} yet. Call us and we will sort something out.`,
      fieldErrors: { region: "Not covered by a delivery zone." },
    };
  }

  const user = await currentUser();

  const result = await createOrder(idempotencyKey, {
    email: input.email,
    phone: input.phone,
    shippingAddress: {
      line1: input.line1,
      city: input.city,
      region: input.region,
      country: "LB",
    },
    lines,
    // Server-quoted from the zone, never sent by the client.
    shippingCents: quote.priceCents,
    customerNote: input.note,
    source: "web",
    userId: user?.id ?? null,
    // The cart's own holds sit inside inventory.reserved, so createOrder
    // releases them before claiming or the order is refused its own stock.
    cartId: cart.id,
  });

  if (!result.ok) return { ok: false, error: result.error };

  /*
   * The cookie goes once the cart is converted.
   *
   * Not strictly required — `currentCart` only matches carts still marked
   * active, so a converted one already reads as no cart. Clearing it anyway
   * means the shopper's next visit starts clean rather than carrying a stale
   * token that resolves to nothing.
   */
  const store = await cookies();
  store.delete(CART_COOKIE);

  return {
    ok: true,
    orderNumber: result.orderNumber,
    id: result.id,
    replayed: result.replayed,
  };
}
