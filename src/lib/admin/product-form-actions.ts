"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import {
  inventory,
  optionTypes,
  optionValues,
  orderItems,
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
  /** Present when this value already exists; absent means insert. */
  id: z.uuid().optional(),
  value: z.string().trim().min(1).max(60),
  /** Set only on a device axis; null is allowed for a device nobody has identified. */
  deviceModelId: z.uuid().nullable(),
});

const optionTypeInput = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, "An option needs a name.").max(40),
  kind: z.enum(OPTION_KINDS),
  values: z.array(optionValueInput).min(1, "An option needs at least one value."),
});

const variantInput = z.object({
  /** Present when this variant already exists; absent means insert. */
  id: z.uuid().optional(),
  /** Which of the product's images this variant shows; null uses the main one. */
  imageId: z.uuid().nullable().optional(),
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
  | {
      ok: true;
      id: string;
      slug: string;
      /**
       * Variants that were dropped from the form but had been sold, so they
       * were hidden instead of deleted. Always 0 on create.
       */
      kept: number;
    }
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
    return { ok: true, id: created.id, slug: created.slug, kept: 0 };
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

/** Everything the edit form needs, in one round trip. */
export async function loadProduct(id: string) {
  await requirePermission("products.edit");

  const product = await db.query.products.findFirst({
    where: (p, { eq }) => eq(p.id, id),
  });
  if (!product) return null;

  const [axes, variantRows, categoryRows] = await Promise.all([
    db.query.optionTypes.findMany({
      where: (t, { eq }) => eq(t.productId, id),
      orderBy: (t, { asc }) => [asc(t.position)],
    }),
    db.query.variants.findMany({
      where: (v, { eq }) => eq(v.productId, id),
      orderBy: (v, { asc }) => [asc(v.position)],
    }),
    db.query.productCategories.findMany({
      where: (pc, { eq }) => eq(pc.productId, id),
    }),
  ]);

  const axisIds = axes.map((a) => a.id);
  const variantIds = variantRows.map((v) => v.id);

  const [values, links, stock, history] = await Promise.all([
    axisIds.length
      ? db.query.optionValues.findMany({
          where: (v, { inArray: within }) => within(v.optionTypeId, axisIds),
          orderBy: (v, { asc }) => [asc(v.position)],
        })
      : Promise.resolve([]),
    variantIds.length
      ? db.query.variantOptions.findMany({
          where: (vo, { inArray: within }) => within(vo.variantId, variantIds),
        })
      : Promise.resolve([]),
    variantIds.length
      ? db.query.inventory.findMany({
          where: (i, { inArray: within }) => within(i.variantId, variantIds),
        })
      : Promise.resolve([]),
    soldVariantIds(variantIds),
  ]);

  const valuesByAxis = axes.map((a) =>
    values.filter((v) => v.optionTypeId === a.id),
  );
  const availableBy = new Map(stock.map((s) => [s.variantId, s.available]));
  const linksBy = new Map<string, string[]>();
  for (const link of links) {
    linksBy.set(link.variantId, [...(linksBy.get(link.variantId) ?? []), link.optionValueId]);
  }

  return {
    product,
    categoryIds: categoryRows
      // Primary first, so reloading and saving keeps the same breadcrumb.
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
      .map((c) => c.categoryId),
    axes: axes.map((a, i) => ({
      id: a.id,
      name: a.name,
      kind: a.kind as string,
      values: (valuesByAxis[i] ?? []).map((v) => ({
        id: v.id,
        value: v.value,
        deviceModelId: v.deviceModelId,
      })),
    })),
    variants: variantRows.map((v) => {
      const chosen = linksBy.get(v.id) ?? [];
      return {
        id: v.id,
        // Rebuilt as indexes into each axis, which is how the grid addresses a
        // combination. A value the axis no longer has resolves to -1 and the
        // grid drops the row, matching what a regenerate would produce.
        combo: valuesByAxis.map(
          (axisValues) => axisValues.findIndex((av) => chosen.includes(av.id)),
        ),
        title: v.title,
        sku: v.sku ?? "",
        price: (v.priceCents / 100).toFixed(2),
        available: availableBy.get(v.id) ?? true,
        imageId: v.imageId,
        /** Sold at least once: it can be hidden, never deleted. */
        sold: history.has(v.id),
      };
    }),
  };
}

/**
 * Variants that appear on an order.
 *
 * `order_items.variant_id` is ON DELETE SET NULL, so deleting one of these
 * would not fail — it would quietly blank the link on historical order lines.
 * The order keeps its snapshotted title and price, but the trail back to the
 * variant is gone, and nothing would have warned anyone.
 */
async function soldVariantIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db
    .selectDistinct({ variantId: orderItems.variantId })
    .from(orderItems)
    .where(inArray(orderItems.variantId, ids));
  return new Set(rows.map((r) => r.variantId).filter((v): v is string => Boolean(v)));
}

/**
 * Saves an edit, reconciling the axes and variants that already exist.
 *
 * Rows and axis values carry their database id when they came from the
 * database, so a rename updates a row rather than replacing it — replacing
 * would cascade `variant_options` away and detach every variant from its
 * options.
 */
export async function updateProduct(
  id: string,
  raw: ProductInput,
): Promise<SaveResult> {
  const user = await requirePermission("products.edit");

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

  const [before] = await db.select().from(products).where(eq(products.id, id));
  if (!before) return { ok: false, error: "That product no longer exists." };

  const slug = input.slug || slugify(input.title);
  if (!slug) {
    return {
      ok: false,
      error: "That title produces an empty web address. Type a slug instead.",
      fieldErrors: { slug: "Required for this title." },
    };
  }

  // Same pre-flight as create, but a variant may legitimately keep its own SKU,
  // so rows being updated are excluded from the clash check.
  const keepingIds = input.variants.map((v) => v.id).filter((v): v is string => Boolean(v));
  const skus = input.variants
    .map((v) => v.sku?.trim())
    .filter((s): s is string => Boolean(s));
  const repeated = skus.filter((s, i) => skus.indexOf(s) !== i);
  if (repeated.length > 0) {
    return {
      ok: false,
      error: `Repeated in this form: ${[...new Set(repeated)].join(", ")}.`,
      fieldErrors: { sku: "Every SKU must be unique." },
    };
  }
  if (skus.length > 0) {
    const taken = await db
      .select({ sku: variants.sku, id: variants.id })
      .from(variants)
      .where(inArray(variants.sku, skus));
    const clashing = taken.filter((t) => !keepingIds.includes(t.id));
    if (clashing.length > 0) {
      return {
        ok: false,
        error: `Already used elsewhere: ${clashing.map((t) => t.sku).join(", ")}.`,
        fieldErrors: { sku: "Already in use." },
      };
    }
  }

  const existingVariants = await db
    .select({ id: variants.id })
    .from(variants)
    .where(eq(variants.productId, id));
  const submitted = new Set(keepingIds);
  const dropped = existingVariants.map((v) => v.id).filter((v) => !submitted.has(v));
  const sold = await soldVariantIds(dropped);
  const deletable = dropped.filter((v) => !sold.has(v));

  try {
    const result = await db.transaction(async (tx) => {
      await tx
        .update(products)
        .set({
          title: input.title,
          slug,
          brandId: input.brandId,
          shortDescription: input.shortDescription,
          status: input.status,
          updatedAt: new Date(),
          publishedAt:
            input.status === "active" ? before.publishedAt ?? new Date() : before.publishedAt,
        })
        .where(eq(products.id, id));

      for (const key of ["title", "slug", "status", "brandId", "shortDescription"] as const) {
        const next = key === "slug" ? slug : input[key === "brandId" ? "brandId" : key];
        if (before[key] !== next) {
          await recordAudit(tx, user.id, {
            entityType: "product",
            entityId: id,
            action: "update",
            field: key,
            oldValue: before[key],
            newValue: next,
          });
        }
      }

      // Categories are a small set — replacing them is clearer than diffing,
      // and the join table carries nothing worth preserving.
      await tx.delete(productCategories).where(eq(productCategories.productId, id));
      if (input.categoryIds.length > 0) {
        await tx.insert(productCategories).values(
          input.categoryIds.map((categoryId, i) => ({
            productId: id,
            categoryId,
            isPrimary: i === 0,
          })),
        );
      }

      // --- axes
      const keptAxisIds = input.options.map((o) => o.id).filter((v): v is string => Boolean(v));
      const currentAxes = await tx
        .select({ id: optionTypes.id })
        .from(optionTypes)
        .where(eq(optionTypes.productId, id));
      const goneAxes = currentAxes.map((a) => a.id).filter((a) => !keptAxisIds.includes(a));
      if (goneAxes.length > 0) {
        await tx.delete(optionTypes).where(inArray(optionTypes.id, goneAxes));
      }

      const valueIds: string[][] = [];
      for (const [axisIndex, axis] of input.options.entries()) {
        let axisId = axis.id;
        if (axisId) {
          await tx
            .update(optionTypes)
            .set({ name: axis.name, kind: axis.kind, position: axisIndex })
            .where(eq(optionTypes.id, axisId));
        } else {
          const [row] = await tx
            .insert(optionTypes)
            .values({
              productId: id,
              name: axis.name,
              kind: axis.kind,
              position: axisIndex,
            })
            .returning({ id: optionTypes.id });
          if (!row) throw new Error("option type insert returned no row");
          axisId = row.id;
        }

        const keptValueIds = axis.values.map((v) => v.id).filter((v): v is string => Boolean(v));
        const currentValues = await tx
          .select({ id: optionValues.id })
          .from(optionValues)
          .where(eq(optionValues.optionTypeId, axisId));
        const goneValues = currentValues
          .map((v) => v.id)
          .filter((v) => !keptValueIds.includes(v));
        if (goneValues.length > 0) {
          await tx.delete(optionValues).where(inArray(optionValues.id, goneValues));
        }

        const ids: string[] = [];
        for (const [i, value] of axis.values.entries()) {
          const deviceModelId = axis.kind === "device_fit" ? value.deviceModelId : null;
          if (value.id) {
            await tx
              .update(optionValues)
              .set({ value: value.value, kind: axis.kind, deviceModelId, position: i })
              .where(eq(optionValues.id, value.id));
            ids.push(value.id);
          } else {
            const [row] = await tx
              .insert(optionValues)
              .values({
                optionTypeId: axisId,
                kind: axis.kind,
                value: value.value,
                deviceModelId,
                position: i,
              })
              .returning({ id: optionValues.id });
            if (!row) throw new Error("option value insert returned no row");
            ids.push(row.id);
          }
        }
        valueIds[axisIndex] = ids;
      }

      // --- variants
      const deviceAxis = input.options.findIndex((o) => o.kind === "device_fit");

      /*
       * The product-wide device set, read before any variant is touched.
       *
       * Used to give a newly added variant the same fitment as its siblings.
       * Without it, adding a 4th cable length would leave that length fitting
       * nothing while the other three fit 24 phones — invisible at product
       * level, because the rollup is a DISTINCT across variants, and wrong the
       * moment anything reads fitment per variant.
       */
      const inheritedFit =
        deviceAxis >= 0
          ? []
          : (
              await tx
                .selectDistinct({ id: variantDeviceFit.deviceModelId })
                .from(variantDeviceFit)
                .innerJoin(variants, eq(variants.id, variantDeviceFit.variantId))
                .where(eq(variants.productId, id))
            ).map((r) => r.id);

      for (const [position, v] of input.variants.entries()) {
        let variantId = v.id;
        if (variantId) {
          await tx
            .update(variants)
            .set({
              title: v.title,
              sku: v.sku || null,
              priceCents: v.price,
              costCents: v.costCents,
              imageId: v.imageId ?? null,
              position,
            })
            .where(eq(variants.id, variantId));
          await tx
            .update(inventory)
            .set({ available: v.available, updatedAt: new Date() })
            .where(eq(inventory.variantId, variantId));
          // The combination can move when an axis is added, so the links are
          // rewritten rather than patched.
          await tx.delete(variantOptions).where(eq(variantOptions.variantId, variantId));
          /*
           * Fitment is only this function's to rewrite when a device axis owns
           * it. Without one it belongs to the fitment picker, which writes the
           * same device set to every variant — and clearing it here meant
           * editing a product's title silently wiped every device it fitted.
           */
          if (deviceAxis >= 0) {
            await tx
              .delete(variantDeviceFit)
              .where(eq(variantDeviceFit.variantId, variantId));
          }
        } else {
          const [row] = await tx
            .insert(variants)
            .values({
              productId: id,
              title: v.title,
              sku: v.sku || null,
              priceCents: v.price,
              costCents: v.costCents,
              position,
            })
            .returning({ id: variants.id });
          if (!row) throw new Error("variant insert returned no row");
          variantId = row.id;
          await tx
            .insert(inventory)
            .values({ variantId, available: v.available, track: false });
          if (inheritedFit.length > 0) {
            const fresh = row.id;
            await tx.insert(variantDeviceFit).values(
              inheritedFit.map((deviceModelId) => ({
                variantId: fresh,
                deviceModelId,
              })),
            );
          }
        }

        const chosen = v.combo
          .map((valueIndex, axisIndex) => valueIds[axisIndex]?.[valueIndex])
          .filter((x): x is string => Boolean(x));
        if (chosen.length > 0) {
          await tx
            .insert(variantOptions)
            .values(chosen.map((optionValueId) => ({ variantId, optionValueId })));
        }

        if (deviceAxis >= 0) {
          const valueIndex = v.combo[deviceAxis];
          const deviceModelId =
            valueIndex === undefined
              ? null
              : input.options[deviceAxis]?.values[valueIndex]?.deviceModelId ?? null;
          if (deviceModelId) {
            await tx.insert(variantDeviceFit).values({ variantId, deviceModelId });
          }
        }
      }

      if (deletable.length > 0) {
        await tx.delete(variants).where(inArray(variants.id, deletable));
      }

      /**
       * A variant that has been sold is hidden rather than removed.
       *
       * Deleting it would succeed and blank `order_items.variant_id` on every
       * line that sold it — no error, no warning, and the order's link to what
       * was actually shipped gone for good.
       */
      const keptBack = dropped.filter((v) => sold.has(v));
      if (keptBack.length > 0) {
        await tx
          .update(inventory)
          .set({ available: false, updatedAt: new Date() })
          .where(inArray(inventory.variantId, keptBack));
        await recordAudit(tx, user.id, {
          entityType: "product",
          entityId: id,
          action: "update",
          field: "variants",
          note: `${keptBack.length} sold variant(s) hidden instead of deleted`,
          newValue: keptBack,
        });
      }

      return { slug, kept: keptBack.length };
    });

    revalidatePath("/admin/products");
    revalidatePath(`/admin/products/${id}`);
    return { ok: true, id, slug: result.slug, kept: result.kept };
  } catch (error) {
    if (isUniqueViolation(error, "products_slug")) {
      return {
        ok: false,
        error: `The web address "${slug}" is already taken.`,
        fieldErrors: { slug: "Already in use." },
      };
    }
    if (isForeignKeyViolation(error)) {
      return {
        ok: false,
        error: "One of those variants is part of a bundle and can't be removed.",
      };
    }
    throw error;
  }
}

/** `bundle_items.variant_id` is ON DELETE RESTRICT, so the database refuses. */
function isForeignKeyViolation(error: unknown): boolean {
  for (let current = error, depth = 0; current && depth < 5; depth += 1) {
    if (
      typeof current === "object" &&
      "code" in current &&
      (current as { code?: string }).code === "23503"
    ) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
