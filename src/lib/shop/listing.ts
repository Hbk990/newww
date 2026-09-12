import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  brands,
  categories,
  productCategories,
  products,
} from "@/db/schema";

export const PAGE_SIZE = 24;

export type ListingCard = {
  slug: string;
  title: string;
  brandName: string | null;
  imageUrl: string | null;
  minPriceCents: number | null;
  maxPriceCents: number | null;
  inStock: boolean;
};

export type Listing = {
  cards: ListingCard[];
  total: number;
  page: number;
  pageCount: number;
};

const card = {
  slug: products.slug,
  title: products.title,
  brandName: brands.name,
  imageUrl: products.primaryImageUrl,
  minPriceCents: products.minPriceCents,
  maxPriceCents: products.maxPriceCents,
  inStock: products.inStock,
};

/**
 * Sort orders a shopper can pick, and the columns behind them.
 *
 * `featured` leads with what sells and breaks ties on newest, because a brand
 * new product has no sales and would otherwise sit at the very back of its own
 * category forever.
 */
export const SORTS = {
  featured: [desc(products.salesCount), desc(products.publishedAt)],
  cheapest: [asc(products.minPriceCents)],
  dearest: [desc(products.maxPriceCents)],
  newest: [desc(products.publishedAt)],
} as const;

export type Sort = keyof typeof SORTS;

export function isSort(value: string | undefined): value is Sort {
  return value !== undefined && value in SORTS;
}

export type CategoryPage = {
  name: string;
  slug: string;
  description: string | null;
  /** The group it sits under, for the breadcrumb. Null for a group itself. */
  groupName: string | null;
  groupSlug: string | null;
  /** Sibling categories, so a shopper can move sideways without going back. */
  siblings: { slug: string; name: string }[];
  listing: Listing;
};

/**
 * One category's page: its products, and enough of its neighbourhood to move
 * around in.
 *
 * Works for a group as well as a leaf. Asking for "Phones & Power" returns
 * everything in every category under it, which is what a shopper tapping
 * "Shop all" expects — and it means the header's group link needs no separate
 * route.
 */
export async function loadCategoryPage(
  slug: string,
  options: { page?: number; sort?: Sort; inStockOnly?: boolean } = {},
): Promise<CategoryPage | null> {
  const [category] = await db
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      description: categories.description,
      parentId: categories.parentId,
      isActive: categories.isActive,
    })
    .from(categories)
    .where(eq(categories.slug, slug));

  if (!category || !category.isActive) return null;

  const [parent] = category.parentId
    ? await db
        .select({ slug: categories.slug, name: categories.name })
        .from(categories)
        .where(eq(categories.id, category.parentId))
    : [];

  /*
   * A group's page covers its children. The id list is resolved first rather
   * than joined, because the alternative is a self-join that has to be written
   * twice — once for the count and once for the page of rows.
   */
  const childIds = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(eq(categories.parentId, category.id), eq(categories.isActive, true)),
    );

  const ids = [category.id, ...childIds.map((c) => c.id)];

  const siblings = await db
    .select({ slug: categories.slug, name: categories.name })
    .from(categories)
    .where(
      and(
        category.parentId
          ? eq(categories.parentId, category.parentId)
          : eq(categories.parentId, category.id),
        eq(categories.isActive, true),
      ),
    )
    .orderBy(asc(categories.position));

  const listing = await loadListing(
    and(
      eq(products.status, "active"),
      sql`${productCategories.categoryId} in ${sql`(${sql.join(
        ids.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`}`,
      options.inStockOnly ? eq(products.inStock, true) : undefined,
    ),
    { ...options, joinCategories: true },
  );

  return {
    name: category.name,
    slug: category.slug,
    description: category.description,
    groupName: parent?.name ?? null,
    groupSlug: parent?.slug ?? null,
    siblings,
    listing,
  };
}

/**
 * Search, over titles and brand names.
 *
 * `ilike` on two columns rather than full-text search: the catalog is a
 * thousand products with names like "Cover - Transperent Android", where
 * stemming and ranking buy little and a substring match is what people expect
 * when they type "cover". It also keeps working for a two-letter query, which
 * `to_tsquery` does not. Revisit when the catalog is ten times larger.
 */
export async function loadSearch(
  query: string,
  options: { page?: number; sort?: Sort; inStockOnly?: boolean } = {},
): Promise<Listing> {
  const term = query.trim();
  if (term.length === 0) {
    return { cards: [], total: 0, page: 1, pageCount: 0 };
  }

  // The wildcards are added here, so a customer typing % or _ searches for
  // those characters instead of matching everything.
  const pattern = `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

  return loadListing(
    and(
      eq(products.status, "active"),
      or(ilike(products.title, pattern), ilike(brands.name, pattern)),
      options.inStockOnly ? eq(products.inStock, true) : undefined,
    ),
    options,
  );
}

/** The shared body of every listing: count, order, page. */
async function loadListing(
  where: ReturnType<typeof and>,
  options: {
    page?: number;
    sort?: Sort;
    joinCategories?: boolean;
  },
): Promise<Listing> {
  const page = Math.max(1, Math.floor(options.page ?? 1));
  const order = SORTS[options.sort ?? "featured"];

  const countQuery = db
    .select({ n: sql<number>`count(distinct ${products.id})::int` })
    .from(products)
    .leftJoin(brands, eq(brands.id, products.brandId))
    .$dynamic();

  const rowsQuery = db
    .select(card)
    .from(products)
    .leftJoin(brands, eq(brands.id, products.brandId))
    .$dynamic();

  if (options.joinCategories) {
    countQuery.innerJoin(
      productCategories,
      eq(productCategories.productId, products.id),
    );
    rowsQuery.innerJoin(
      productCategories,
      eq(productCategories.productId, products.id),
    );
  }

  const [[counted], rows] = await Promise.all([
    countQuery.where(where),
    rowsQuery
      .where(where)
      // distinct: a product in two categories of the same group would
      // otherwise appear twice on the group's page.
      .groupBy(
        products.id,
        products.slug,
        products.title,
        brands.name,
        products.primaryImageUrl,
        products.minPriceCents,
        products.maxPriceCents,
        products.inStock,
        products.salesCount,
        products.publishedAt,
      )
      .orderBy(...order)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
  ]);

  const total = counted?.n ?? 0;
  return {
    cards: rows,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}
