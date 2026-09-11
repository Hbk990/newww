"use server";

import { inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import {
  inventory,
  optionTypes,
  optionValues,
  productCategories,
  products,
  variantDeviceFit,
  variantOptions,
  variants,
} from "@/db/schema";
import { requirePermission } from "@/lib/auth/guards";
import { slugify } from "@/lib/slug";

import { recordAudit } from "./audit";

const OPTION_KINDS = [
  "color",
  "size",
  "capacity",
  "device_fit",
  "connector",
  "power",
  "flavor",
  "other",
] as const;

/** A price typed as "9.50" becomes 950. Money is integer cents everywhere. */
const money = z
  .string()
  .trim()
  .regex(/^\d{1,7}(\.\d{1,2})?$/, "Use a price like 9.50.")
  .transform((v) => Math.round(Number(v) * 100));

const optionValueInput = z.object({
  value: z.string().trim().min(1).max(60),
  /** Set only on a device axis; null is allowed for a device nobody has identified. */
  deviceModelId: z.uuid().nullable(),
});

const optionTypeInput = z.object({
  name: z.string().trim().min(1, "An option needs a name.").max(40),
  kind: z.enum(OPTION_KINDS),
  values: z.array(optionValueInput).min(1, "An option needs at least one value."),
});

const variantInput = z.object({
  /** Indexes into each axis, in axis order — what identifies this combination. */
  combo: z.array(z.number().int().min(0)),
  title: z.string().trim().min(1).max(200),
  sku: z.string().trim().max(60).nullable(),
  price: money,
  costCents: z.number().int().min(0).nullable(),
  available: z.boolean(),
});

const productInput = z.object({
  title: z.string().trim().min(2, "A title is required.").max(200),
  slug: z
    .string()
    .trim()
    .max(220)
    .regex(/^[a-z0-9-]*$/, "Lowercase letters, numbers and hyphens only."),
  brandId: z.uuid().nullable(),
  categoryIds: z.array(z.uuid()),
  shortDescription: z.string().trim().max(500).nullable(),
  status: z.enum(["draft", "active", "discontinued", "archived"]),
  options: z.array(optionTypeInput).max(3, "Three options is the practical limit."),
  variants: z.array(variantInput).min(1, "A product needs at least one variant."),
});

export type ProductInput = z.input<typeof productInput>;

export type SaveResult =
  | { ok: true; id: string; slug: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * Creates a product, its option axes, and every variant, in one transaction.
 *
 * One transaction because a product that committed without its variants is
 * unsellable and looks finished — the list would show it with no price and no
 * way to tell that the save half-failed.
 */
export async function createProduct(raw: ProductInput): Promise<SaveResult> {
  const user = await requirePermission("products.create");

  const parsed = productInput.safeParse(raw);
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

  // An empty slug means "derive it"; a typed one is respected as given.
  const slug = input.slug || slugify(input.title);
  if (!slug) {
    return {
      ok: false,
      error: "That title produces an empty web address. Type a slug instead.",
      fieldErrors: { slug: "Required for this title." },
    };
  }

  /**
   * SKUs are checked before the transaction opens.
   *
   * `variants.sku` is uniquely indexed, so a clash would abort the insert —
   * but as a constraint violation naming one row, after the product and its
   * options were already written and rolled back. Checking first names every
   * clashing SKU at once, which is what the grid needs to highlight them.
   */
  const skus = input.variants
    .map((v) => v.sku?.trim())
    .filter((s): s is string => Boolean(s));
  const duplicatesInForm = skus.filter((s, i) => skus.indexOf(s) !== i);
  if (duplicatesInForm.length > 0) {
    return {
      ok: false,
      error: `Repeated in this form: ${[...new Set(duplicatesInForm)].join(", ")}.`,
      fieldErrors: { sku: "Every SKU must be unique." },
    };
  }
  if (skus.length > 0) {
    const taken = await db
      .select({ sku: variants.sku })
      .from(variants)
      .where(inArray(variants.sku, skus));
    if (taken.length > 0) {
      return {
        ok: false,
        error: `Already used by another product: ${taken.map((t) => t.sku).join(", ")}.`,
        fieldErrors: { sku: "Already in use." },
      };
    }
  }

  try {
    const created = await db.transaction(async (tx) => {
      const [product] = await tx
        .insert(products)
        .values({
          title: input.title,
          slug,
          brandId: input.brandId,
          shortDescription: input.shortDescription,
          status: input.status,
          publishedAt: input.status === "active" ? new Date() : null,
        })
        .returning({ id: products.id, slug: products.slug });
      if (!product) throw new Error("product insert returned no row");

      if (input.categoryIds.length > 0) {
        await tx.insert(productCategories).values(
          input.categoryIds.map((categoryId, i) => ({
            productId: product.id,
            categoryId,
            // First ticked category is primary: breadcrumbs need one answer.
            isPrimary: i === 0,
          })),
        );
      }

      // Axis values, kept in the order the grid used to build combinations —
      // a variant's `combo` indexes into these arrays positionally.
      const valueIds: string[][] = [];
      for (const [axisIndex, axis] of input.options.entries()) {
        const [type] = await tx
          .insert(optionTypes)
          .values({
            productId: product.id,
            name: axis.name,
            kind: axis.kind,
            position: axisIndex,
          })
          .returning({ id: optionTypes.id });
        if (!type) throw new Error("option type insert returned no row");

        const rows = await tx
          .insert(optionValues)
          .values(
            axis.values.map((v, i) => ({
              optionTypeId: type.id,
              // Denormalised, and the composite key checks it against the axis.
              kind: axis.kind,
              value: v.value,
              deviceModelId: axis.kind === "device_fit" ? v.deviceModelId : null,
              position: i,
            })),
          )
          .returning({ id: optionValues.id });
        valueIds[axisIndex] = rows.map((r) => r.id);
      }

      for (const [position, v] of input.variants.entries()) {
        const [variant] = await tx
          .insert(variants)
          .values({
            productId: product.id,
            title: v.title,
            sku: v.sku || null,
            priceCents: v.price,
            costCents: v.costCents,
            position,
          })
          .returning({ id: variants.id });
        if (!variant) throw new Error("variant insert returned no row");

        // Availability, not quantity: `track` stays false so `available` is
        // the switch that decides, and on_hand is ignored until someone opts
        // a variant into counting.
        await tx.insert(inventory).values({
          variantId: variant.id,
          available: v.available,
          track: false,
        });

        const chosen = v.combo
          .map((valueIndex, axisIndex) => valueIds[axisIndex]?.[valueIndex])
          .filter((id): id is string => Boolean(id));
        if (chosen.length > 0) {
          await tx
            .insert(variantOptions)
            .values(chosen.map((optionValueId) => ({ variantId: variant.id, optionValueId })));
        }

        /**
         * Fitment written straight from the device axis.
         *
         * This is the whole point of option_values.device_model_id: the same
         * devices would otherwise be entered twice, once as axis text and
         * again in the fitment picker. The rollup trigger fills
         * product_device_fit from these rows, so "shop by device" works
         * without a second pass.
         */
        const deviceAxis = input.options.findIndex((o) => o.kind === "device_fit");
        if (deviceAxis >= 0) {
          const valueIndex = v.combo[deviceAxis];
          const deviceModelId =
            valueIndex === undefined
              ? null
              : input.options[deviceAxis]?.values[valueIndex]?.deviceModelId ?? null;
          if (deviceModelId) {
            await tx
              .insert(variantDeviceFit)
              .values({ variantId: variant.id, deviceModelId });
          }
        }
      }

      await recordAudit(tx, user.id, {
        entityType: "product",
        entityId: product.id,
        action: "create",
        newValue: {
          title: input.title,
          slug,
          status: input.status,
          variants: input.variants.length,
          options: input.options.map((o) => `${o.name} (${o.values.length})`),
        },
      });

      return product;
    });

    revalidatePath("/admin/products");
    return { ok: true, id: created.id, slug: created.slug };
  } catch (error) {
    if (isUniqueViolation(error, "products_slug")) {
      return {
        ok: false,
        error: `The web address "${slug}" is already taken.`,
        fieldErrors: { slug: "Already in use." },
      };
    }
    if (isUniqueViolation(error, "variants_sku")) {
      return { ok: false, error: "One of those SKUs was taken while you were saving." };
    }
    throw error;
  }
}

/** Postgres unique violations arrive wrapped by Drizzle, with the code on `cause`. */
function isUniqueViolation(error: unknown, constraint?: string): boolean {
  for (let current = error, depth = 0; current && depth < 5; depth += 1) {
    if (typeof current === "object" && "code" in current) {
      const e = current as { code?: string; constraint_name?: string };
      if (e.code === "23505") {
        return !constraint || (e.constraint_name ?? "").includes(constraint);
      }
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** Feeds the form's brand, category and device pickers in one round trip. */
export async function formOptions() {
  await requirePermission("products.create");
  const [brandRows, categoryRows, deviceRows] = await Promise.all([
    db.query.brands.findMany({ columns: { id: true, name: true } }),
    db.query.categories.findMany({
      columns: { id: true, name: true, parentId: true, position: true },
    }),
    db.query.deviceModels.findMany({
      columns: { id: true, name: true, deviceBrandId: true, family: true },
    }),
  ]);
  return { brandRows, categoryRows, deviceRows };
}
