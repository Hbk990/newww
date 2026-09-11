"use server";

import { asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { productImages, variants } from "@/db/schema";
import { requirePermission } from "@/lib/auth/guards";
import { MAX_IMAGE_BYTES, probeImage } from "@/lib/images";
import { imageKey, storage } from "@/lib/storage";

import { recordAudit } from "./audit";

export type ImageResult =
  | { ok: true; added?: number; skipped?: string[] }
  | { ok: false; error: string };

/** Twelve is more than any accessory needs and keeps a product page light. */
const MAX_IMAGES_PER_PRODUCT = 12;

/**
 * Stores uploaded files and records them against the product.
 *
 * Each file is validated from its own bytes before anything is written. The
 * browser's reported type and the filename are both attacker-controlled, so
 * neither is trusted — `probeImage` reads the header instead.
 */
export async function uploadImages(
  productId: string,
  form: FormData,
): Promise<ImageResult> {
  const user = await requirePermission("products.edit");

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return { ok: false, error: "No files were selected." };

  const [current] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(productImages)
    .where(eq(productImages.productId, productId));
  const room = MAX_IMAGES_PER_PRODUCT - (current?.n ?? 0);
  if (room <= 0) {
    return {
      ok: false,
      error: `This product already has ${MAX_IMAGES_PER_PRODUCT} images, which is the limit.`,
    };
  }

  const [last] = await db
    .select({ position: productImages.position })
    .from(productImages)
    .where(eq(productImages.productId, productId))
    .orderBy(sql`${productImages.position} desc`)
    .limit(1);
  let position = (last?.position ?? -1) + 1;

  const skipped: string[] = [];
  let added = 0;

  for (const file of files.slice(0, room)) {
    if (file.size > MAX_IMAGE_BYTES) {
      // Checked before reading, so an oversized file never reaches memory.
      skipped.push(`${file.name}: over ${MAX_IMAGE_BYTES / 1024 / 1024}MB`);
      continue;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const probed = probeImage(bytes);
    if ("error" in probed) {
      skipped.push(`${file.name}: ${probed.error}`);
      continue;
    }

    const key = imageKey(productId, probed.extension);
    const put = await storage.put(key, bytes, probed.kind);

    try {
      await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(productImages)
          .values({
            productId,
            url: put.url,
            storageKey: put.key,
            // AVIF dimensions can come back unknown; the check constraint wants
            // both columns set or neither.
            width: probed.width > 0 ? probed.width : null,
            height: probed.height > 0 ? probed.height : null,
            bytes: bytes.length,
            alt: null,
            position,
          })
          .returning({ id: productImages.id });
        await recordAudit(tx, user.id, {
          entityType: "product_image",
          entityId: row?.id ?? null,
          action: "create",
          newValue: { productId, url: put.url, bytes: bytes.length },
        });
      });
      position += 1;
      added += 1;
    } catch (error) {
      /*
       * The file is already on the storage provider at this point. Leaving it
       * there after the row failed would be an orphan nobody can find or
       * delete, so it is removed before the error propagates.
       */
      await storage.remove(put.key).catch(() => {});
      throw error;
    }
  }

  if (files.length > room) {
    skipped.push(`${files.length - room} more not uploaded — ${MAX_IMAGES_PER_PRODUCT} is the limit`);
  }

  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/admin/products");
  if (added === 0) {
    return { ok: false, error: skipped.join("; ") || "Nothing was uploaded." };
  }
  return { ok: true, added, skipped };
}

export async function deleteImage(
  productId: string,
  imageId: string,
): Promise<ImageResult> {
  const user = await requirePermission("products.edit");

  const [image] = await db
    .select()
    .from(productImages)
    .where(eq(productImages.id, imageId));
  if (!image) return { ok: true };

  await db.transaction(async (tx) => {
    /*
     * `variants.image_id` is ON DELETE SET NULL, so any variant using this as
     * its thumbnail simply loses it — no orphaned reference, no error. The row
     * delete also fires the summary trigger, which repoints
     * products.primary_image_url at whatever is now first.
     */
    await tx.delete(productImages).where(eq(productImages.id, imageId));
    await recordAudit(tx, user.id, {
      entityType: "product_image",
      entityId: imageId,
      action: "delete",
      oldValue: { url: image.url, storageKey: image.storageKey },
    });
  });

  /*
   * Deleted after the row, not before.
   *
   * If the transaction rolled back we would have destroyed a file the database
   * still points at — a broken image on a live product page. An orphaned file
   * is the cheaper mistake, and the key is in the audit log either way.
   */
  if (image.storageKey) {
    await storage.remove(image.storageKey).catch(() => {});
  }

  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/admin/products");
  return { ok: true };
}

const altInput = z.string().trim().max(160);

export async function setImageAlt(
  productId: string,
  imageId: string,
  alt: string,
): Promise<ImageResult> {
  const user = await requirePermission("products.edit");
  const parsed = altInput.safeParse(alt);
  if (!parsed.success) {
    return { ok: false, error: "Alt text must be 160 characters or fewer." };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(productImages)
      .set({ alt: parsed.data || null })
      .where(eq(productImages.id, imageId));
    await recordAudit(tx, user.id, {
      entityType: "product_image",
      entityId: imageId,
      action: "update",
      field: "alt",
      newValue: parsed.data || null,
    });
  });

  revalidatePath(`/admin/products/${productId}`);
  return { ok: true };
}

/**
 * Reorders images. Position 0 becomes the product's primary image.
 *
 * Positions are rewritten from the submitted order rather than swapped, so the
 * sequence stays gap-free and the trigger's "first by position" has one
 * unambiguous answer.
 */
export async function reorderImages(
  productId: string,
  orderedIds: string[],
): Promise<ImageResult> {
  const user = await requirePermission("products.edit");

  const current = await db
    .select({ id: productImages.id })
    .from(productImages)
    .where(eq(productImages.productId, productId))
    .orderBy(asc(productImages.position));

  const known = new Set(current.map((r) => r.id));
  if (orderedIds.length !== known.size || !orderedIds.every((id) => known.has(id))) {
    return {
      ok: false,
      error: "The images changed while you were reordering. Reload and try again.",
    };
  }

  await db.transaction(async (tx) => {
    /*
     * Shifted out of the way first.
     *
     * `position` is not unique, so this is not strictly required — but writing
     * new positions directly over old ones makes the summary trigger fire once
     * per row against a half-reordered table, and the primary image flickers
     * through two or three values before settling. Moving them out of the
     * occupied range first means each row lands once.
     */
    for (const [index, id] of orderedIds.entries()) {
      await tx
        .update(productImages)
        .set({ position: 1000 + index })
        .where(eq(productImages.id, id));
    }
    for (const [index, id] of orderedIds.entries()) {
      await tx
        .update(productImages)
        .set({ position: index })
        .where(eq(productImages.id, id));
    }
    await recordAudit(tx, user.id, {
      entityType: "product",
      entityId: productId,
      action: "update",
      field: "image_order",
      oldValue: current.map((r) => r.id),
      newValue: orderedIds,
    });
  });

  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/admin/products");
  return { ok: true };
}

/** Assigns an image to a variant, so a colour shows its own photo. */
export async function setVariantImage(
  productId: string,
  variantId: string,
  imageId: string | null,
): Promise<ImageResult> {
  const user = await requirePermission("products.edit");

  if (imageId) {
    // An image from another product would render someone else's photo on this
    // variant; the column has no constraint tying the two together.
    const [image] = await db
      .select({ productId: productImages.productId })
      .from(productImages)
      .where(eq(productImages.id, imageId));
    if (!image || image.productId !== productId) {
      return { ok: false, error: "That image doesn't belong to this product." };
    }
  }

  await db.transaction(async (tx) => {
    await tx.update(variants).set({ imageId }).where(eq(variants.id, variantId));
    await recordAudit(tx, user.id, {
      entityType: "variant",
      entityId: variantId,
      action: "update",
      field: "image_id",
      newValue: imageId,
    });
  });

  revalidatePath(`/admin/products/${productId}`);
  return { ok: true };
}

/** The product's images, in display order. */
export async function loadImages(productId: string) {
  await requirePermission("products.edit");
  return db
    .select({
      id: productImages.id,
      url: productImages.url,
      alt: productImages.alt,
      width: productImages.width,
      height: productImages.height,
      bytes: productImages.bytes,
      position: productImages.position,
    })
    .from(productImages)
    .where(eq(productImages.productId, productId))
    .orderBy(asc(productImages.position));
}
