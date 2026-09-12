import { and, asc, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  brands,
  categories,
  deviceBrands,
  deviceModels,
  productCategories,
  products,
  shippingZones,
} from "@/db/schema";
import type { ListingCard } from "@/lib/shop/listing";

export type HomeGroup = {
  slug: string;
  name: string;
  productCount: number;
  categoryCount: number;
  /** The three biggest categories inside it, as a taste of what is there. */
  leads: string[];
};

export type HomeDeviceBrand = {
  name: string;
  models: { id: string; name: string }[];
};

export type HomeTotals = {
  products: number;
  categories: number;
  deviceModels: number;
  zones: number;
};

export type Home = {
  groups: HomeGroup[];
  newest: ListingCard[];
  under: { thresholdCents: number; cards: ListingCard[] };
  deviceBrands: HomeDeviceBrand[];
  totals: HomeTotals;
};

const CARD_LIMIT = 12;

/**
 * Everything the homepage shows, in one call.
 *
 * Deliberately built out of facts rather than merchandising. `sales_count` is
 * zero on every product — nothing has been sold through this shop yet — so a
 * "best sellers" rail would be an arbitrary order wearing a label that claims
 * otherwise. What is true today: what is newest, what is cheap, how much of
 * each category exists, and which phones we know about. Those are the rails.
 *
 * When real orders start landing, a popular rail becomes honest and slots in
 * beside these without changing anything else.
 */
export async function loadHome(): Promise<Home> {
  const card = {
    slug: products.slug,
    title: products.title,
    brandName: brands.name,
    imageUrl: products.primaryImageUrl,
    minPriceCents: products.minPriceCents,
    maxPriceCents: products.maxPriceCents,
    inStock: products.inStock,
  };

  /*
   * The cheap rail's threshold is chosen from the catalog, not hardcoded: the
   * 30th percentile of prices. A fixed "$10 and under" is a great section in a
   * shop full of cables and an empty one in a shop of power banks, and this
   * shop sells both.
   */
  const [cheapRow] = await db
    .select({
      cents: sql<number>`percentile_disc(0.3) within group (order by ${products.minPriceCents})::int`,
    })
    .from(products)
    .where(and(eq(products.status, "active"), sql`${products.minPriceCents} is not null`));

  const thresholdCents = cheapRow?.cents ?? 1000;

  const [groupRows, newest, under, devices, totals] = await Promise.all([
    // One row per category, with its group, so the tiles can be assembled
    // without a query per group.
    db
      .select({
        groupSlug: sql<string>`parent.slug`,
        groupName: sql<string>`parent.name`,
        groupPosition: sql<number>`parent.position`,
        categoryName: categories.name,
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
        categories.name,
      )
      .orderBy(sql`parent.position`, desc(sql`count(distinct ${products.id})`)),

    db
      .select(card)
      .from(products)
      .leftJoin(brands, eq(brands.id, products.brandId))
      .where(eq(products.status, "active"))
      /*
       * `nulls last`, explicitly. Postgres puts NULLs FIRST on a descending
       * sort, so a product with no publish date would lead a rail titled "New
       * this month" — and a product without one is precisely a product whose
       * age we do not know. The e2e spec caught this.
       */
      .orderBy(sql`${products.publishedAt} desc nulls last`)
      .limit(CARD_LIMIT),

    db
      .select(card)
      .from(products)
      .leftJoin(brands, eq(brands.id, products.brandId))
      .where(
        and(
          eq(products.status, "active"),
          eq(products.inStock, true),
          sql`${products.minPriceCents} <= ${thresholdCents}`,
        ),
      )
      .orderBy(asc(products.minPriceCents))
      .limit(CARD_LIMIT),

    db
      .select({
        brand: deviceBrands.name,
        brandPosition: deviceBrands.position,
        id: deviceModels.id,
        model: deviceModels.name,
      })
      .from(deviceModels)
      .innerJoin(deviceBrands, eq(deviceBrands.id, deviceModels.deviceBrandId))
      .orderBy(asc(deviceBrands.position), asc(deviceModels.position), asc(deviceModels.name)),

    Promise.all([
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(products)
        // In stock, not merely active: the figure sits under the words
        // "products in stock", so it has to mean them.
        .where(and(eq(products.status, "active"), eq(products.inStock, true))),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(categories)
        .where(and(eq(categories.isActive, true), sql`${categories.parentId} is not null`)),
      db.select({ n: sql<number>`count(*)::int` }).from(deviceModels),
      // Zones have no active flag: a zone exists or it does not.
      db.select({ n: sql<number>`count(*)::int` }).from(shippingZones),
    ]),
  ]);

  const groups: HomeGroup[] = [];
  for (const row of groupRows) {
    let group = groups.find((g) => g.slug === row.groupSlug);
    if (!group) {
      group = {
        slug: row.groupSlug,
        name: row.groupName,
        productCount: 0,
        categoryCount: 0,
        leads: [],
      };
      groups.push(group);
    }
    group.productCount += row.productCount;
    group.categoryCount += 1;
    // Ordered by size above, so the first three are the biggest three.
    if (group.leads.length < 3) group.leads.push(row.categoryName);
  }

  const brandOrder: HomeDeviceBrand[] = [];
  for (const row of devices) {
    let brand = brandOrder.find((b) => b.name === row.brand);
    if (!brand) {
      brand = { name: row.brand, models: [] };
      brandOrder.push(brand);
    }
    brand.models.push({ id: row.id, name: row.model });
  }
  for (const brand of brandOrder) sortModels(brand.models);

  const [productCount, categoryCount, modelCount, zoneCount] = totals;

  return {
    groups,
    newest,
    under: { thresholdCents, cards: under },
    deviceBrands: brandOrder,
    totals: {
      products: productCount[0]?.n ?? 0,
      categories: categoryCount[0]?.n ?? 0,
      deviceModels: modelCount[0]?.n ?? 0,
      zones: zoneCount[0]?.n ?? 0,
    },
  };
}

/**
 * The order a shopper wants a phone list in: their line first, newest first.
 *
 * Apple's 34 models sorted by name put ten iPads ahead of every iPhone, on a
 * page that asks "which phone do you have?". There is no release date in the
 * table to sort by, so this infers what it can from the names:
 *
 *   The family is the text before the first digit — "iPhone", "iPad Pro",
 *   "Galaxy A". Families are ordered by how many models they hold, which puts
 *   the line a brand sells most of at the top; for Apple that is the iPhone,
 *   twenty-odd models against a handful of iPads.
 *
 *   Inside a family the number descends, so iPhone 16 leads iPhone 11. A
 *   higher number has meant a newer phone for every brand in this catalog.
 *
 * A heuristic, and an honest one: it reads the names, it does not know the
 * dates. When release dates are worth recording, they replace it.
 */
function sortModels(models: { id: string; name: string }[]): void {
  const familyOf = (name: string) =>
    name.replace(/\d.*$/, "").trim().toLowerCase();
  const numberOf = (name: string) => {
    const found = name.match(/\d+(\.\d+)?/);
    return found ? Number(found[0]) : -1;
  };

  const sizes = new Map<string, number>();
  for (const model of models) {
    const family = familyOf(model.name);
    sizes.set(family, (sizes.get(family) ?? 0) + 1);
  }

  models.sort((a, b) => {
    const [fa, fb] = [familyOf(a.name), familyOf(b.name)];
    if (fa !== fb) {
      const bySize = (sizes.get(fb) ?? 0) - (sizes.get(fa) ?? 0);
      // Alphabetical on a tie, so the order never shuffles between requests.
      return bySize !== 0 ? bySize : fa.localeCompare(fb);
    }
    const byNumber = numberOf(b.name) - numberOf(a.name);
    return byNumber !== 0 ? byNumber : a.name.localeCompare(b.name);
  });
}
