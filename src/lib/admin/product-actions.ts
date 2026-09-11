"use server";

import { eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { auditLog, inventory, products, variants } from "@/db/schema";
import { requirePermission } from "@/lib/auth/guards";

/**
 * Flips availability for every variant of a product.
 *
 * Availability is per variant in the database, but the list shows one row per
 * product — so this sets them together. A product with genuinely different
 * availability per colour is edited on the product itself.
 *
 * `products.in_stock` is not written here: the trigger on `inventory` maintains
 * it. Writing both would let them disagree.
 */
export async function setProductAvailability(
  productId: string,
  available: boolean,
): Promise<void> {
  const user = await requirePermission("inventory.adjust");

  const rows = await db
    .select({ id: variants.id })
    .from(variants)
    .where(eq(variants.productId, productId));

  if (rows.length === 0) return;

  await db.transaction(async (tx) => {
    await tx
      .update(inventory)
      .set({ available, updatedAt: new Date() })
      .where(
        inArray(
          inventory.variantId,
          rows.map((row) => row.id),
        ),
      );

    await tx.insert(auditLog).values({
      actorId: user.id,
      entityType: "product",
      entityId: productId,
      action: "update",
      field: "available",
      oldValue: !available,
      newValue: available,
    });
  });

  revalidatePath("/admin/products");
}

/**
 * Archives several products at once.
 *
 * Archive, never delete: a product with orders against it has to keep
 * existing, and the earlier decision was archive-only with no delete button
 * anywhere. Each product gets its own audit row, so the log reads as a list of
 * what happened rather than one entry saying "37 things changed".
 */
export async function archiveProducts(ids: string[]): Promise<number> {
  const user = await requirePermission("products.archive");
  if (ids.length === 0) return 0;

  const archived = await db.transaction(async (tx) => {
    const rows = await tx
      .update(products)
      .set({ status: "archived", updatedAt: new Date() })
      .where(inArray(products.id, ids))
      .returning({ id: products.id });

    if (rows.length > 0) {
      await tx.insert(auditLog).values(
        rows.map((row) => ({
          actorId: user.id,
          entityType: "product",
          entityId: row.id,
          action: "archive" as const,
          field: "status",
          newValue: "archived",
        })),
      );
    }
    return rows.length;
  });

  revalidatePath("/admin/products");
  return archived;
}

/** The other half of archiving — what makes the undo on the toast real. */
export async function restoreProducts(ids: string[]): Promise<number> {
  const user = await requirePermission("products.archive");
  if (ids.length === 0) return 0;

  const restored = await db.transaction(async (tx) => {
    const rows = await tx
      .update(products)
      .set({ status: "draft", updatedAt: new Date() })
      .where(
        sql`${products.id} in ${ids} and ${products.status} = 'archived'`,
      )
      .returning({ id: products.id });

    if (rows.length > 0) {
      await tx.insert(auditLog).values(
        rows.map((row) => ({
          actorId: user.id,
          entityType: "product",
          entityId: row.id,
          action: "restore" as const,
          field: "status",
          oldValue: "archived",
          newValue: "draft",
        })),
      );
    }
    return rows.length;
  });

  revalidatePath("/admin/products");
  return restored;
}
