import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  cartItems,
  categories,
  productCategories,
  products,
} from "@/db/schema";

import { currentCart } from "@/lib/cart/cart";

export type NavCategory = {
  slug: string;
  name: string;
  productCount: number;
};

export type NavGroup = {
  slug: string;
  name: string;
  categories: NavCategory[];
};

/**
 * The shop's menu: five groups, each with the categories that have something
 * in them.
 *
 * A category with no active products is left out rather than deleted. Eight of
 * them exist today — Kitchen & Drinkware, Grooming, Cleaning and the rest were
 * created for products that were never moved into them — and a menu entry
 * leading to an empty page is worse than no entry. The day one is stocked it
 * appears on its own, with no code change.
 *
 * Counts come back with the names because the dropdown shows them, and because
 * a category that has quietly emptied is then visible in the admin rather than
 * only in a customer's dead end.
 */
export async function loadNav(): Promise<NavGroup[]> {
  const rows = await db
    .select({
      groupSlug: sql<string>`parent.slug`,
      groupName: sql<string>`parent.name`,
      groupPosition: sql<number>`parent.position`,
      slug: categories.slug,
      name: categories.name,
      position: categories.position,
      productCount: sql<number>`count(distinct ${products.id})::int`,
    })
    .from(categories)
    .innerJoin(
      sql`categories parent`,
      sql`parent.id = ${categories.parentId} and parent.is_active`,
    )
    .innerJoin(
      productCategories,
      eq(productCategories.categoryId, categories.id),
    )
    .innerJoin(
      products,
      and(
        eq(products.id, productCategories.productId),
        eq(products.status, "active"),
      ),
    )
    .where(eq(categories.isActive, true))
    .groupBy(
      sql`parent.slug`,
      sql`parent.name`,
      sql`parent.position`,
      categories.slug,
      categories.name,
      categories.position,
    )
    .orderBy(sql`parent.position`, asc(categories.position));

  const groups: NavGroup[] = [];
  for (const row of rows) {
    let group = groups.find((g) => g.slug === row.groupSlug);
    if (!group) {
      group = { slug: row.groupSlug, name: row.groupName, categories: [] };
      groups.push(group);
    }
    group.categories.push({
      slug: row.slug,
      name: row.name,
      productCount: row.productCount,
    });
  }
  return groups;
}

/**
 * How many items are in this visitor's basket, for the badge.
 *
 * Sums quantities rather than counting lines: three of one cable is three
 * items to a shopper, and a badge reading "1" over a basket holding three is
 * the kind of small lie that makes people re-check the basket.
 *
 * Returns 0 rather than throwing when there is no cart — the header renders on
 * every page, including for a visitor who has never touched anything.
 */
export async function basketCount(): Promise<number> {
  const cart = await currentCart();
  if (!cart) return 0;

  const [row] = await db
    .select({ n: sql<number>`coalesce(sum(${cartItems.quantity}), 0)::int` })
    .from(cartItems)
    .where(eq(cartItems.cartId, cart.id));

  return row?.n ?? 0;
}
