"use server";

import { and, desc, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import { products, recentlyViewed } from "@/db/schema";
import { currentUser } from "@/lib/auth/session";

/**
 * Records that this customer looked at this product.
 *
 * An upsert on `viewedAt`, not an append. A viewing log would grow without
 * limit and need pruning; this keeps the table proportional to customers times
 * products they actually care about.
 *
 * Silent for guests, and silent on failure. This is a convenience strip, and a
 * product page must not fail to render because a nicety could not be recorded —
 * so it is safe to call without awaiting the outcome.
 */
export async function recordView(productId: string): Promise<void> {
  const user = await currentUser();
  if (!user) return;

  await db
    .insert(recentlyViewed)
    .values({ userId: user.id, productId })
    .onConflictDoUpdate({
      target: [recentlyViewed.userId, recentlyViewed.productId],
      set: { viewedAt: new Date() },
    })
    .catch(() => {});
}

export type ViewedEntry = {
  productId: string;
  slug: string;
  title: string;
  primaryImageUrl: string | null;
  minPriceCents: number | null;
  viewedAt: Date;
};

/**
 * What this customer looked at lately, newest first.
 *
 * `exclude` leaves out the product being viewed right now — a "recently viewed"
 * strip on a product page that leads with the page you are on looks broken.
 */
export async function loadRecentlyViewed(options?: {
  exclude?: string;
  limit?: number;
}): Promise<ViewedEntry[]> {
  const user = await currentUser();
  if (!user) return [];

  const filters = [
    eq(recentlyViewed.userId, user.id),
    eq(products.status, "active"),
  ];
  if (options?.exclude) {
    filters.push(ne(recentlyViewed.productId, options.exclude));
  }

  return db
    .select({
      productId: products.id,
      slug: products.slug,
      title: products.title,
      primaryImageUrl: products.primaryImageUrl,
      minPriceCents: products.minPriceCents,
      viewedAt: recentlyViewed.viewedAt,
    })
    .from(recentlyViewed)
    .innerJoin(products, eq(products.id, recentlyViewed.productId))
    .where(and(...filters))
    .orderBy(desc(recentlyViewed.viewedAt))
    .limit(Math.min(options?.limit ?? 12, 50));
}
