"use server";

import { and, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { products, wishlistItems } from "@/db/schema";
import { currentUser } from "@/lib/auth/session";

export type WishlistResult =
  | { ok: true; saved: boolean }
  | { ok: false; reason: "signed_out" | "missing" };

/**
 * Favourites, for signed-in customers only.
 *
 * No guest wishlist. A guest one would have to live in a cookie, and then
 * signing in raises the same merge question the cart already answers — except a
 * wishlist has no checkout to make the merge worth the complexity. "Sign in to
 * save this" is the honest prompt, and `reason: "signed_out"` is what lets the
 * page show it rather than failing silently.
 */
export async function toggleWishlist(
  productId: string,
): Promise<WishlistResult> {
  const user = await currentUser();
  if (!user) return { ok: false, reason: "signed_out" };

  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.id, productId));
  if (!product) return { ok: false, reason: "missing" };

  /*
   * Delete-then-insert rather than reading first and branching: two taps in
   * quick succession would otherwise both read "not saved" and both try to
   * insert, and the primary key would turn the second into an error instead of
   * the toggle the customer asked for.
   */
  const removed = await db
    .delete(wishlistItems)
    .where(
      and(
        eq(wishlistItems.userId, user.id),
        eq(wishlistItems.productId, productId),
      ),
    )
    .returning({ productId: wishlistItems.productId });

  if (removed.length > 0) {
    revalidatePath("/account/wishlist");
    return { ok: true, saved: false };
  }

  await db
    .insert(wishlistItems)
    .values({ userId: user.id, productId })
    .onConflictDoNothing();

  revalidatePath("/account/wishlist");
  return { ok: true, saved: true };
}

/** Whether this customer has saved this product. False for a guest. */
export async function isWishlisted(productId: string): Promise<boolean> {
  const user = await currentUser();
  if (!user) return false;

  const [row] = await db
    .select({ productId: wishlistItems.productId })
    .from(wishlistItems)
    .where(
      and(
        eq(wishlistItems.userId, user.id),
        eq(wishlistItems.productId, productId),
      ),
    );
  return row !== undefined;
}

export type WishlistEntry = {
  productId: string;
  slug: string;
  title: string;
  primaryImageUrl: string | null;
  minPriceCents: number | null;
  inStock: boolean;
  savedAt: Date;
};

/** The customer's saved products, newest first. */
export async function loadWishlist(): Promise<WishlistEntry[]> {
  const user = await currentUser();
  if (!user) return [];

  return db
    .select({
      productId: products.id,
      slug: products.slug,
      title: products.title,
      primaryImageUrl: products.primaryImageUrl,
      minPriceCents: products.minPriceCents,
      inStock: products.inStock,
      savedAt: wishlistItems.createdAt,
    })
    .from(wishlistItems)
    .innerJoin(products, eq(products.id, wishlistItems.productId))
    // Archived products stay saved but are not shown: a customer's list should
    // not silently lose entries, and a dead link is worse than an absence.
    .where(and(eq(wishlistItems.userId, user.id), eq(products.status, "active")))
    .orderBy(desc(wishlistItems.createdAt))
    .limit(200);
}

/**
 * How many customers saved this product.
 *
 * Backs a "Most saved" section. Counted on demand rather than denormalised onto
 * products: it changes often, matters little if slightly stale, and there is an
 * index on product_id for exactly this.
 */
export async function wishlistCount(productId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(wishlistItems)
    .where(eq(wishlistItems.productId, productId));
  return row?.n ?? 0;
}
