"use server";

import { asc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import {
  brands,
  categories,
  deviceBrands,
  deviceModels,
  optionValues,
  productCategories,
  products,
  variantDeviceFit,
} from "@/db/schema";
import { requirePermission } from "@/lib/auth/guards";
import { slugify } from "@/lib/slug";

import { recordAudit } from "./audit";

export type TaxonomyResult =
  | { ok: true; id?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const name = z
  .string()
  .trim()
  .min(1, "A name is required.")
  .max(80, "80 characters is the limit.");

const slug = z
  .string()
  .trim()
  .max(120)
  .regex(/^[a-z0-9-]*$/, "Lowercase letters, numbers and hyphens only.");

const position = z.coerce.number().int().min(0).max(9999);

function invalid(error: z.ZodError): TaxonomyResult {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { ok: false, error: error.issues[0]?.message ?? "Check the fields.", fieldErrors };
}

/** Unique violations arrive wrapped by Drizzle, with the code on `cause`. */
function isUniqueViolation(error: unknown): boolean {
  for (let current = error, depth = 0; current && depth < 5; depth += 1) {
    if (
      typeof current === "object" &&
      "code" in current &&
      (current as { code?: string }).code === "23505"
    ) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

function takenSlug(error: unknown, value: string): TaxonomyResult {
  if (isUniqueViolation(error)) {
    return {
      ok: false,
      error: `The web address "${value}" is already used by something else.`,
      fieldErrors: { slug: "Already in use." },
    };
  }
  throw error;
}

// ============================================================
// Categories
// ============================================================

const categoryInput = z.object({
  name,
  slug,
  parentId: z.uuid().nullable(),
  description: z.string().trim().max(500).nullable(),
  isActive: z.boolean(),
  position,
});

export type CategoryInput = z.infer<typeof categoryInput>;

export async function saveCategory(
  id: string | null,
  raw: CategoryInput,
): Promise<TaxonomyResult> {
  const user = await requirePermission("products.edit");
  const parsed = categoryInput.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;
  const finalSlug = input.slug || slugify(input.name);
  if (!finalSlug) {
    return {
      ok: false,
      error: "That name gives an empty web address. Type one instead.",
      fieldErrors: { slug: "Required for this name." },
    };
  }

  /*
   * A category cannot be its own ancestor.
   *
   * `parent_id` is self-referencing with nothing preventing a cycle, and
   * `attributes_for_category()` walks up it — the walk is bounded to ten
   * levels precisely because a cycle here would otherwise spin forever. Better
   * to refuse the cycle than to rely on the bound.
   */
  if (id && input.parentId) {
    if (input.parentId === id) {
      return {
        ok: false,
        error: "A category cannot be its own parent.",
        fieldErrors: { parentId: "Pick a different parent." },
      };
    }
    const ancestors = await db.execute<{ id: string }>(sql`
      with recursive up as (
        select id, parent_id, 0 as depth from categories where id = ${input.parentId}
        union all
        select c.id, c.parent_id, up.depth + 1
        from categories c join up on c.id = up.parent_id
        where up.depth < 20
      )
      select id::text from up
    `);
    if ([...ancestors].some((row) => row.id === id)) {
      return {
        ok: false,
        error: "That would put this category underneath one of its own children.",
        fieldErrors: { parentId: "Creates a loop." },
      };
    }
  }

  try {
    if (id) {
      const [before] = await db.select().from(categories).where(eq(categories.id, id));
      if (!before) return { ok: false, error: "That category no longer exists." };
      await db.transaction(async (tx) => {
        await tx
          .update(categories)
          .set({ ...input, slug: finalSlug })
          .where(eq(categories.id, id));
        for (const key of ["name", "slug", "parentId", "isActive", "position"] as const) {
          const next = key === "slug" ? finalSlug : input[key];
          if (before[key] !== next) {
            await recordAudit(tx, user.id, {
              entityType: "category",
              entityId: id,
              action: "update",
              field: key,
              oldValue: before[key],
              newValue: next,
            });
          }
        }
      });
      revalidatePath("/admin/categories");
      return { ok: true, id };
    }

    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(categories)
        .values({ ...input, slug: finalSlug })
        .returning({ id: categories.id });
      if (!row) throw new Error("category insert returned no row");
      await recordAudit(tx, user.id, {
        entityType: "category",
        entityId: row.id,
        action: "create",
        newValue: { ...input, slug: finalSlug },
      });
      return row.id;
    });
    revalidatePath("/admin/categories");
    return { ok: true, id: created };
  } catch (error) {
    return takenSlug(error, finalSlug);
  }
}

/**
 * Deletes a category, refusing while anything depends on it.
 *
 * `product_categories.category_id` is ON DELETE CASCADE, so deleting a
 * category in use does not fail — it silently unfiles every product in it.
 * Those products stay for sale with no category, vanish from the category
 * page, and nothing says why. Deactivating is the reversible alternative and
 * is what the error suggests.
 */
export async function deleteCategory(id: string): Promise<TaxonomyResult> {
  const user = await requirePermission("products.edit");

  const [before] = await db.select().from(categories).where(eq(categories.id, id));
  if (!before) return { ok: true };

  const [children] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(categories)
    .where(eq(categories.parentId, id));
  if ((children?.n ?? 0) > 0) {
    return {
      ok: false,
      error: `${children?.n} categor${children?.n === 1 ? "y sits" : "ies sit"} under this one. Move or delete those first.`,
    };
  }

  const [used] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(productCategories)
    .where(eq(productCategories.categoryId, id));
  if ((used?.n ?? 0) > 0) {
    return {
      ok: false,
      error: `${used?.n} product${used?.n === 1 ? " is" : "s are"} filed here. Deleting would quietly remove them from it — move them first, or switch this category off instead.`,
    };
  }

  await db.transaction(async (tx) => {
    await tx.delete(categories).where(eq(categories.id, id));
    await recordAudit(tx, user.id, {
      entityType: "category",
      entityId: id,
      action: "delete",
      oldValue: before,
    });
  });
  revalidatePath("/admin/categories");
  return { ok: true };
}

// ============================================================
// Brands
// ============================================================

const brandInput = z.object({
  name,
  slug,
  description: z.string().trim().max(500).nullable(),
  isFeatured: z.boolean(),
  position,
});

export type BrandInput = z.infer<typeof brandInput>;

export async function saveBrand(
  id: string | null,
  raw: BrandInput,
): Promise<TaxonomyResult> {
  const user = await requirePermission("products.edit");
  const parsed = brandInput.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;
  const finalSlug = input.slug || slugify(input.name);
  if (!finalSlug) {
    return {
      ok: false,
      error: "That name gives an empty web address. Type one instead.",
      fieldErrors: { slug: "Required for this name." },
    };
  }

  try {
    if (id) {
      const [before] = await db.select().from(brands).where(eq(brands.id, id));
      if (!before) return { ok: false, error: "That brand no longer exists." };
      await db.transaction(async (tx) => {
        await tx
          .update(brands)
          .set({ ...input, slug: finalSlug })
          .where(eq(brands.id, id));
        for (const key of ["name", "slug", "isFeatured", "position"] as const) {
          const next = key === "slug" ? finalSlug : input[key];
          if (before[key] !== next) {
            await recordAudit(tx, user.id, {
              entityType: "brand",
              entityId: id,
              action: "update",
              field: key,
              oldValue: before[key],
              newValue: next,
            });
          }
        }
      });
      revalidatePath("/admin/brands");
      return { ok: true, id };
    }

    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(brands)
        .values({ ...input, slug: finalSlug })
        .returning({ id: brands.id });
      if (!row) throw new Error("brand insert returned no row");
      await recordAudit(tx, user.id, {
        entityType: "brand",
        entityId: row.id,
        action: "create",
        newValue: { ...input, slug: finalSlug },
      });
      return row.id;
    });
    revalidatePath("/admin/brands");
    return { ok: true, id: created };
  } catch (error) {
    return takenSlug(error, finalSlug);
  }
}

/**
 * Deletes a brand, refusing while products carry it.
 *
 * `products.brand_id` is ON DELETE SET NULL: the delete would succeed and
 * quietly unbrand every product that had it. Nothing errors, the products stay
 * on sale, and the brand page they used to appear on is simply empty.
 */
export async function deleteBrand(id: string): Promise<TaxonomyResult> {
  const user = await requirePermission("products.edit");

  const [before] = await db.select().from(brands).where(eq(brands.id, id));
  if (!before) return { ok: true };

  const [used] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(products)
    .where(eq(products.brandId, id));
  if ((used?.n ?? 0) > 0) {
    return {
      ok: false,
      error: `${used?.n} product${used?.n === 1 ? " carries" : "s carry"} this brand. Deleting would quietly unbrand ${used?.n === 1 ? "it" : "them"} — change ${used?.n === 1 ? "it" : "them"} first.`,
    };
  }

  await db.transaction(async (tx) => {
    await tx.delete(brands).where(eq(brands.id, id));
    await recordAudit(tx, user.id, {
      entityType: "brand",
      entityId: id,
      action: "delete",
      oldValue: before,
    });
  });
  revalidatePath("/admin/brands");
  return { ok: true };
}

// ============================================================
// Devices
// ============================================================

const deviceBrandInput = z.object({ name, slug, position });
export type DeviceBrandInput = z.infer<typeof deviceBrandInput>;

export async function saveDeviceBrand(
  id: string | null,
  raw: DeviceBrandInput,
): Promise<TaxonomyResult> {
  const user = await requirePermission("products.edit");
  const parsed = deviceBrandInput.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;
  const finalSlug = input.slug || slugify(input.name);
  if (!finalSlug) {
    return { ok: false, error: "That name gives an empty web address." };
  }

  try {
    if (id) {
      await db.transaction(async (tx) => {
        await tx
          .update(deviceBrands)
          .set({ ...input, slug: finalSlug })
          .where(eq(deviceBrands.id, id));
        await recordAudit(tx, user.id, {
          entityType: "device_brand",
          entityId: id,
          action: "update",
          newValue: { ...input, slug: finalSlug },
        });
      });
      revalidatePath("/admin/devices");
      return { ok: true, id };
    }
    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(deviceBrands)
        .values({ ...input, slug: finalSlug })
        .returning({ id: deviceBrands.id });
      if (!row) throw new Error("device brand insert returned no row");
      await recordAudit(tx, user.id, {
        entityType: "device_brand",
        entityId: row.id,
        action: "create",
        newValue: { ...input, slug: finalSlug },
      });
      return row.id;
    });
    revalidatePath("/admin/devices");
    return { ok: true, id: created };
  } catch (error) {
    return takenSlug(error, finalSlug);
  }
}

/**
 * Deletes a device brand — the most destructive delete in this admin.
 *
 * `device_models.device_brand_id` is ON DELETE CASCADE, and every model then
 * cascades into `variant_device_fit` and `product_device_fit`. Deleting
 * "Apple" would take 25 models with it and strip fitment from every product
 * that fits any iPhone, across the whole catalog, in one statement, with no
 * error. The only safe version refuses while it has any model at all.
 */
export async function deleteDeviceBrand(id: string): Promise<TaxonomyResult> {
  const user = await requirePermission("products.edit");

  const [before] = await db.select().from(deviceBrands).where(eq(deviceBrands.id, id));
  if (!before) return { ok: true };

  const [models] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(deviceModels)
    .where(eq(deviceModels.deviceBrandId, id));
  if ((models?.n ?? 0) > 0) {
    return {
      ok: false,
      error: `${before.name} has ${models?.n} model${models?.n === 1 ? "" : "s"}. Deleting it would delete ${models?.n === 1 ? "that model" : "all of them"} and strip fitment from every product that fits ${models?.n === 1 ? "it" : "any of them"}. Remove the models first.`,
    };
  }

  await db.transaction(async (tx) => {
    await tx.delete(deviceBrands).where(eq(deviceBrands.id, id));
    await recordAudit(tx, user.id, {
      entityType: "device_brand",
      entityId: id,
      action: "delete",
      oldValue: before,
    });
  });
  revalidatePath("/admin/devices");
  return { ok: true };
}

const deviceModelInput = z.object({
  name,
  slug,
  deviceBrandId: z.uuid(),
  family: z
    .string()
    .trim()
    .max(40)
    .transform((v) => v || null)
    .nullable(),
  releaseYear: z
    .union([z.coerce.number().int().min(2000).max(2100), z.literal("")])
    .transform((v) => (v === "" ? null : v))
    .nullable(),
  isActive: z.boolean(),
  position,
});

export type DeviceModelInput = z.infer<typeof deviceModelInput>;

export async function saveDeviceModel(
  id: string | null,
  raw: z.input<typeof deviceModelInput>,
): Promise<TaxonomyResult> {
  const user = await requirePermission("products.edit");
  const parsed = deviceModelInput.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;

  /*
   * The slug is derived from brand and model together.
   *
   * "Galaxy A15" under Samsung and under some other brand would otherwise
   * collide on a globally unique slug. The seed does the same, and its
   * slugify keeps "+" — a Tab A9+ case does not fit a Tab A9.
   */
  const [brand] = await db
    .select({ name: deviceBrands.name })
    .from(deviceBrands)
    .where(eq(deviceBrands.id, input.deviceBrandId));
  if (!brand) {
    return { ok: false, error: "Pick a device brand.", fieldErrors: { deviceBrandId: "Required." } };
  }
  const finalSlug = input.slug || slugify(`${brand.name} ${input.name}`);

  try {
    if (id) {
      const [before] = await db.select().from(deviceModels).where(eq(deviceModels.id, id));
      if (!before) return { ok: false, error: "That model no longer exists." };
      await db.transaction(async (tx) => {
        await tx
          .update(deviceModels)
          .set({ ...input, slug: finalSlug })
          .where(eq(deviceModels.id, id));
        for (const key of ["name", "slug", "family", "isActive", "releaseYear"] as const) {
          const next = key === "slug" ? finalSlug : input[key];
          if (before[key] !== next) {
            await recordAudit(tx, user.id, {
              entityType: "device_model",
              entityId: id,
              action: "update",
              field: key,
              oldValue: before[key],
              newValue: next,
            });
          }
        }
      });
      revalidatePath("/admin/devices");
      return { ok: true, id };
    }

    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(deviceModels)
        .values({ ...input, slug: finalSlug })
        .returning({ id: deviceModels.id });
      if (!row) throw new Error("device model insert returned no row");
      await recordAudit(tx, user.id, {
        entityType: "device_model",
        entityId: row.id,
        action: "create",
        newValue: { ...input, slug: finalSlug },
      });
      return row.id;
    });
    revalidatePath("/admin/devices");
    return { ok: true, id: created };
  } catch (error) {
    return takenSlug(error, finalSlug);
  }
}

/**
 * Deletes a device model, refusing while anything fits it.
 *
 * Two different protections exist in the database and they disagree:
 * `option_values.device_model_id` is RESTRICT, so a model used as a variant
 * axis value is refused outright — but `variant_device_fit.device_model_id` is
 * CASCADE, so a model chosen through the fitment picker is deleted silently
 * along with every product's fitment for it. This levels the two up: both are
 * refused, with a count, and deactivating is offered instead.
 */
export async function deleteDeviceModel(id: string): Promise<TaxonomyResult> {
  const user = await requirePermission("products.edit");

  const [before] = await db.select().from(deviceModels).where(eq(deviceModels.id, id));
  if (!before) return { ok: true };

  const [fitted] = await db
    .select({ n: sql<number>`count(distinct ${variantDeviceFit.variantId})::int` })
    .from(variantDeviceFit)
    .where(eq(variantDeviceFit.deviceModelId, id));
  if ((fitted?.n ?? 0) > 0) {
    return {
      ok: false,
      error: `${fitted?.n} variant${fitted?.n === 1 ? "" : "s"} list this device as a fit. Deleting it would quietly drop ${fitted?.n === 1 ? "that" : "those"} — switch the model off instead if it is discontinued.`,
    };
  }

  const [axis] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(optionValues)
    .where(eq(optionValues.deviceModelId, id));
  if ((axis?.n ?? 0) > 0) {
    return {
      ok: false,
      error: `This device is a variant option on ${axis?.n} product${axis?.n === 1 ? "" : "s"}. Remove it there first.`,
    };
  }

  await db.transaction(async (tx) => {
    await tx.delete(deviceModels).where(eq(deviceModels.id, id));
    await recordAudit(tx, user.id, {
      entityType: "device_model",
      entityId: id,
      action: "delete",
      oldValue: before,
    });
  });
  revalidatePath("/admin/devices");
  return { ok: true };
}

/** Switches a model on or off without touching anything that points at it. */
export async function setDeviceModelActive(
  id: string,
  isActive: boolean,
): Promise<TaxonomyResult> {
  const user = await requirePermission("products.edit");
  await db.transaction(async (tx) => {
    await tx.update(deviceModels).set({ isActive }).where(eq(deviceModels.id, id));
    await recordAudit(tx, user.id, {
      entityType: "device_model",
      entityId: id,
      action: "update",
      field: "isActive",
      newValue: isActive,
    });
  });
  revalidatePath("/admin/devices");
  return { ok: true };
}

// ============================================================
// Reads
// ============================================================

/** The category tree with a product count per node. */
export async function loadCategories() {
  await requirePermission("products.edit");
  const rows = await db
    .select({
      id: categories.id,
      parentId: categories.parentId,
      name: categories.name,
      slug: categories.slug,
      isActive: categories.isActive,
      position: categories.position,
      /*
       * Outer columns named literally. Interpolating the column object renders
       * an unqualified "id", which inside a subquery binds to the inner
       * table's own id wherever it has one — the children count below would
       * compare a category's parent to its own id and always return zero.
       */
      products: sql<number>`(
        select count(*)::int from product_categories pc
        where pc.category_id = categories.id
      )`,
      children: sql<number>`(
        select count(*)::int from categories c where c.parent_id = categories.id
      )`,
    })
    .from(categories)
    .orderBy(asc(categories.position), asc(categories.name));
  return rows;
}

export async function loadBrands() {
  await requirePermission("products.edit");
  return db
    .select({
      id: brands.id,
      name: brands.name,
      slug: brands.slug,
      isFeatured: brands.isFeatured,
      position: brands.position,
      products: sql<number>`(
        select count(*)::int from products p where p.brand_id = brands.id
      )`,
    })
    .from(brands)
    .orderBy(asc(brands.position), asc(brands.name));
}

export async function loadDevices() {
  await requirePermission("products.edit");
  const [brandRows, modelRows] = await Promise.all([
    db
      .select({
        id: deviceBrands.id,
        name: deviceBrands.name,
        slug: deviceBrands.slug,
        position: deviceBrands.position,
      })
      .from(deviceBrands)
      .orderBy(asc(deviceBrands.position), asc(deviceBrands.name)),
    db
      .select({
        id: deviceModels.id,
        deviceBrandId: deviceModels.deviceBrandId,
        name: deviceModels.name,
        slug: deviceModels.slug,
        family: deviceModels.family,
        releaseYear: deviceModels.releaseYear,
        isActive: deviceModels.isActive,
        position: deviceModels.position,
        fitted: sql<number>`(
          select count(distinct f.variant_id)::int from variant_device_fit f
          where f.device_model_id = device_models.id
        )`,
      })
      .from(deviceModels)
      .orderBy(asc(deviceModels.name)),
  ]);
  return { brandRows, modelRows };
}

/** Reorders a set of rows in one transaction, gap-free. */
export async function reorderCategories(orderedIds: string[]): Promise<TaxonomyResult> {
  const user = await requirePermission("products.edit");
  const known = await db
    .select({ id: categories.id })
    .from(categories)
    .where(inArray(categories.id, orderedIds));
  if (known.length !== orderedIds.length) {
    return { ok: false, error: "The list changed while you were reordering. Reload and try again." };
  }
  await db.transaction(async (tx) => {
    for (const [index, id] of orderedIds.entries()) {
      await tx.update(categories).set({ position: index }).where(eq(categories.id, id));
    }
    await recordAudit(tx, user.id, {
      entityType: "category",
      action: "update",
      field: "order",
      newValue: orderedIds,
    });
  });
  revalidatePath("/admin/categories");
  return { ok: true };
}
