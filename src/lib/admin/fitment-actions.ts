"use server";

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  deviceBrands,
  deviceModels,
  optionTypes,
  variantDeviceFit,
  variants,
} from "@/db/schema";
import { requirePermission } from "@/lib/auth/guards";

import { recordAudit } from "./audit";

export type FitmentResult =
  | { ok: true; devices: number; rows: number }
  | { ok: false; error: string };

export type FitmentDevice = {
  id: string;
  name: string;
  brand: string;
  family: string | null;
};

export type FitmentState = {
  devices: FitmentDevice[];
  selectedIds: string[];
  /**
   * True when the product has a device option axis.
   *
   * Fitment is then derived per variant from that axis, and this picker must
   * not also write it — the two would fight, and whichever ran last would win
   * silently.
   */
  fromAxis: boolean;
};

/** Every device, plus what this product currently fits. */
export async function loadFitment(productId: string): Promise<FitmentState> {
  await requirePermission("products.edit");

  const [devices, selected, axes] = await Promise.all([
    db
      .select({
        id: deviceModels.id,
        name: deviceModels.name,
        brand: deviceBrands.name,
        family: deviceModels.family,
      })
      .from(deviceModels)
      .innerJoin(deviceBrands, eq(deviceBrands.id, deviceModels.deviceBrandId))
      .where(eq(deviceModels.isActive, true))
      .orderBy(asc(deviceBrands.position), asc(deviceModels.name)),
    db
      .selectDistinct({ deviceModelId: variantDeviceFit.deviceModelId })
      .from(variantDeviceFit)
      .innerJoin(variants, eq(variants.id, variantDeviceFit.variantId))
      .where(eq(variants.productId, productId)),
    db
      .select({ id: optionTypes.id })
      .from(optionTypes)
      .where(
        and(eq(optionTypes.productId, productId), eq(optionTypes.kind, "device_fit")),
      ),
  ]);

  return {
    devices,
    selectedIds: selected.map((s) => s.deviceModelId),
    fromAxis: axes.length > 0,
  };
}

/**
 * Replaces which devices a product fits.
 *
 * Fitment is stored per variant, because a device axis gives each variant its
 * own device. A product with no such axis fits the same devices across all of
 * its variants, so the selection is written to every one of them — that is
 * what `refresh_product_device_fit` reads to rebuild `product_device_fit`,
 * which is what "shop by device" queries.
 */
export async function setFitment(
  productId: string,
  deviceModelIds: string[],
): Promise<FitmentResult> {
  const user = await requirePermission("products.edit");

  const axes = await db
    .select({ id: optionTypes.id })
    .from(optionTypes)
    .where(
      and(eq(optionTypes.productId, productId), eq(optionTypes.kind, "device_fit")),
    );
  if (axes.length > 0) {
    return {
      ok: false,
      error:
        "This product has a Device option, so fitment comes from the variant grid. Remove that option to set fitment here instead.",
    };
  }

  const productVariants = await db
    .select({ id: variants.id })
    .from(variants)
    .where(eq(variants.productId, productId));
  if (productVariants.length === 0) {
    return { ok: false, error: "Save the product's variants first." };
  }

  // Unknown ids would fail the foreign key mid-transaction; checking first
  // names the problem instead of surfacing a constraint violation.
  if (deviceModelIds.length > 0) {
    const [known] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(deviceModels)
      .where(inArray(deviceModels.id, deviceModelIds));
    if ((known?.n ?? 0) !== deviceModelIds.length) {
      return { ok: false, error: "One of those devices no longer exists. Reload and try again." };
    }
  }

  const variantIds = productVariants.map((v) => v.id);

  await db.transaction(async (tx) => {
    /*
     * Replaced wholesale rather than diffed.
     *
     * The statement-level rollup trigger fires per statement, so a delete plus
     * an insert costs two refreshes of this product's fitment either way — and
     * a diff would need three statements to achieve the same end state.
     */
    await tx.delete(variantDeviceFit).where(inArray(variantDeviceFit.variantId, variantIds));

    if (deviceModelIds.length > 0) {
      await tx.insert(variantDeviceFit).values(
        variantIds.flatMap((variantId) =>
          deviceModelIds.map((deviceModelId) => ({ variantId, deviceModelId })),
        ),
      );
    }

    await recordAudit(tx, user.id, {
      entityType: "product",
      entityId: productId,
      action: "update",
      field: "device_fit",
      newValue: { devices: deviceModelIds.length, variants: variantIds.length },
    });
  });

  revalidatePath(`/admin/products/${productId}`);
  return {
    ok: true,
    devices: deviceModelIds.length,
    rows: deviceModelIds.length * variantIds.length,
  };
}
