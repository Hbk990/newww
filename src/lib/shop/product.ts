import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  attributeDefinitions,
  attributeOptions,
  brands,
  deviceBrands,
  deviceModels,
  inventory,
  optionTypes,
  optionValues,
  productAttributes,
  productDeviceFit,
  productImages,
  products,
  variantOptions,
  variants,
} from "@/db/schema";
import { effectivePrice } from "@/lib/orders/pricing";

export type ShopImage = {
  url: string;
  alt: string | null;
  width: number | null;
  height: number | null;
};

export type ShopAxisValue = {
  id: string;
  value: string;
};

/** One choice the shopper makes: Device, Size, Colour. */
export type ShopAxis = {
  id: string;
  name: string;
  kind: string;
  values: ShopAxisValue[];
};

export type ShopVariant = {
  id: string;
  title: string;
  sku: string | null;
  /** The option values this variant is, one per axis. */
  optionValueIds: string[];
  /** Today's price, with any live sale applied. */
  priceCents: number;
  /** The shelf price, present only when a sale is currently cheaper. */
  wasCents: number | null;
  tracked: boolean;
  /** Units a shopper can take. Null when uncounted or on backorder. */
  sellable: number | null;
  purchasable: boolean;
};

export type ShopSpec = { label: string; value: string };

export type ShopFitment = { brand: string; model: string };

export type ShopProduct = {
  id: string;
  slug: string;
  title: string;
  shortDescription: string | null;
  descriptionHtml: string | null;
  brandName: string | null;
  ratingAvg: string | null;
  reviewCount: number;
  images: ShopImage[];
  axes: ShopAxis[];
  variants: ShopVariant[];
  specs: ShopSpec[];
  fitment: ShopFitment[];
  minPriceCents: number | null;
  maxPriceCents: number | null;
};

/**
 * Everything a product page shows, for one slug.
 *
 * Returns null for a product that is not active, which the page turns into a
 * 404. An archived product must not be reachable by URL — its price and stock
 * are no longer maintained, so the page would be quietly wrong rather than
 * absent.
 *
 * Several queries rather than one join: a product has images, axes, variants,
 * specs and fitment, and joining them all produces a cartesian product that
 * costs more to unpick in TypeScript than the round trips save.
 */
export async function loadShopProduct(
  slug: string,
): Promise<ShopProduct | null> {
  const [product] = await db
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      shortDescription: products.shortDescription,
      descriptionHtml: products.descriptionHtml,
      status: products.status,
      ratingAvg: products.ratingAvg,
      reviewCount: products.reviewCount,
      minPriceCents: products.minPriceCents,
      maxPriceCents: products.maxPriceCents,
      brandName: brands.name,
    })
    .from(products)
    .leftJoin(brands, eq(brands.id, products.brandId))
    .where(eq(products.slug, slug));

  if (!product || product.status !== "active") return null;

  const [images, axisTypes, axisValues, rows, specRows, fitRows] =
    await Promise.all([
      db
        .select({
          url: productImages.url,
          alt: productImages.alt,
          width: productImages.width,
          height: productImages.height,
        })
        .from(productImages)
        .where(eq(productImages.productId, product.id))
        .orderBy(asc(productImages.position)),

      db
        .select({
          id: optionTypes.id,
          name: optionTypes.name,
          kind: optionTypes.kind,
        })
        .from(optionTypes)
        .where(eq(optionTypes.productId, product.id))
        .orderBy(asc(optionTypes.position)),

      db
        .select({
          id: optionValues.id,
          optionTypeId: optionValues.optionTypeId,
          value: optionValues.value,
        })
        .from(optionValues)
        .innerJoin(optionTypes, eq(optionTypes.id, optionValues.optionTypeId))
        .where(eq(optionTypes.productId, product.id))
        .orderBy(asc(optionValues.position)),

      db
        .select({
          id: variants.id,
          title: variants.title,
          sku: variants.sku,
          priceCents: variants.priceCents,
          salePriceCents: variants.salePriceCents,
          saleStartsAt: variants.saleStartsAt,
          saleEndsAt: variants.saleEndsAt,
          position: variants.position,
          track: inventory.track,
          available: inventory.available,
          onHand: inventory.onHand,
          reserved: inventory.reserved,
          policy: inventory.policy,
        })
        .from(variants)
        // Left join: migration 0021 guarantees an inventory row, but a variant
        // without one must read as unbuyable rather than vanish from the page.
        .leftJoin(inventory, eq(inventory.variantId, variants.id))
        .where(eq(variants.productId, product.id))
        .orderBy(asc(variants.position)),

      /*
       * Specs read the values recorded against this product, joined to their
       * definitions for the label and unit. The enum case goes through
       * attribute_options, because the value is an id there rather than text.
       */
      db
        .select({
          label: attributeDefinitions.label,
          unit: attributeDefinitions.unit,
          dataType: attributeDefinitions.dataType,
          position: attributeDefinitions.position,
          valueText: productAttributes.valueText,
          valueNumber: productAttributes.valueNumber,
          valueBool: productAttributes.valueBool,
          optionValue: attributeOptions.value,
        })
        .from(productAttributes)
        .innerJoin(
          attributeDefinitions,
          eq(attributeDefinitions.id, productAttributes.attributeId),
        )
        .leftJoin(
          attributeOptions,
          eq(attributeOptions.id, productAttributes.optionId),
        )
        .where(eq(productAttributes.productId, product.id))
        .orderBy(asc(attributeDefinitions.position)),

      // The rollup the triggers maintain, so this is one indexed read rather
      // than a walk through every variant's fitment.
      db
        .select({
          model: deviceModels.name,
          brand: deviceBrands.name,
        })
        .from(productDeviceFit)
        .innerJoin(
          deviceModels,
          eq(deviceModels.id, productDeviceFit.deviceModelId),
        )
        .innerJoin(
          deviceBrands,
          eq(deviceBrands.id, deviceModels.deviceBrandId),
        )
        .where(eq(productDeviceFit.productId, product.id))
        .orderBy(asc(deviceBrands.name), asc(deviceModels.name)),
    ]);

  // Which option values each variant is, needed to resolve a shopper's
  // selection back to a variant.
  const optionLinks =
    rows.length === 0
      ? []
      : await db
          .select({
            variantId: variantOptions.variantId,
            optionValueId: variantOptions.optionValueId,
          })
          .from(variantOptions)
          .innerJoin(variants, eq(variants.id, variantOptions.variantId))
          .where(eq(variants.productId, product.id));

  const now = new Date();

  const shopVariants: ShopVariant[] = rows.map((row) => {
    const price = effectivePrice(row, now);
    const tracked = row.track === true;

    return {
      id: row.id,
      title: row.title,
      sku: row.sku,
      optionValueIds: optionLinks
        .filter((link) => link.variantId === row.id)
        .map((link) => link.optionValueId),
      priceCents: price,
      /*
       * `wasCents` is set only when the sale is actually cheaper than the shelf
       * price. A "was" figure that is not higher is either meaningless or a lie,
       * and a sale priced above the normal price is a data error the page should
       * not dress up as a discount.
       */
      wasCents: price < row.priceCents ? row.priceCents : null,
      tracked,
      sellable:
        tracked && row.policy !== "continue"
          ? (row.onHand ?? 0) - (row.reserved ?? 0)
          : null,
      purchasable:
        row.available !== null &&
        (tracked
          ? row.policy === "continue" ||
            (row.onHand ?? 0) - (row.reserved ?? 0) > 0
          : row.available === true),
    };
  });

  const axes: ShopAxis[] = axisTypes.map((type) => ({
    id: type.id,
    name: type.name,
    kind: type.kind,
    values: axisValues
      .filter((value) => value.optionTypeId === type.id)
      .map(({ id, value }) => ({ id, value })),
  }));

  const specs: ShopSpec[] = specRows
    .map((row) => ({ label: row.label, value: formatSpec(row) }))
    .filter((spec) => spec.value !== "");

  return {
    id: product.id,
    slug: product.slug,
    title: product.title,
    shortDescription: product.shortDescription,
    descriptionHtml: product.descriptionHtml,
    brandName: product.brandName,
    ratingAvg: product.ratingAvg,
    reviewCount: product.reviewCount,
    images,
    axes,
    variants: shopVariants,
    specs,
    fitment: fitRows,
    minPriceCents: product.minPriceCents,
    maxPriceCents: product.maxPriceCents,
  };
}

/**
 * One attribute value as a shopper should read it.
 *
 * The four value columns are mutually exclusive by design — a `num_nonnulls`
 * check enforces it — so this picks whichever is populated rather than
 * guessing from `dataType`. A boolean renders as Yes/No rather than true/false,
 * and a unit is appended only to a number, where it means something.
 */
function formatSpec(row: {
  unit: string | null;
  valueText: string | null;
  valueNumber: string | null;
  valueBool: boolean | null;
  optionValue: string | null;
}): string {
  if (row.optionValue !== null) return row.optionValue;
  if (row.valueText !== null) return row.valueText;
  if (row.valueBool !== null) return row.valueBool ? "Yes" : "No";
  if (row.valueNumber !== null) {
    // numeric() arrives as a string, and trailing zeros on it read as false
    // precision: "5.00 W" should be "5 W".
    const trimmed = row.valueNumber.replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
    return row.unit ? `${trimmed} ${row.unit}` : trimmed;
  }
  return "";
}

/** Slugs of every active product, for generating pages and a sitemap later. */
export async function activeProductSlugs(limit = 5000): Promise<string[]> {
  const rows = await db
    .select({ slug: products.slug })
    .from(products)
    .where(and(eq(products.status, "active")))
    .orderBy(asc(products.slug))
    .limit(limit);
  return rows.map((r) => r.slug);
}
