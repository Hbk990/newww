"use server";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  customerDevices,
  deviceBrands,
  deviceModels,
  productDeviceFit,
} from "@/db/schema";
import { currentUser } from "@/lib/auth/session";

export type DeviceResult =
  | { ok: true }
  | { ok: false; reason: "signed_out" | "missing" | "limit" };

/**
 * Six devices per customer.
 *
 * Not a security limit — a person owning seven phones is unusual, not
 * dangerous. It stops the fitment filter degrading into "fits almost
 * everything", which is the same as no filter at all, and keeps a picker on a
 * phone screen readable.
 */
const MAX_DEVICES = 6;

export async function addMyDevice(
  deviceModelId: string,
  label?: string,
): Promise<DeviceResult> {
  const user = await currentUser();
  if (!user) return { ok: false, reason: "signed_out" };

  const [model] = await db
    .select({ id: deviceModels.id })
    .from(deviceModels)
    .where(eq(deviceModels.id, deviceModelId));
  if (!model) return { ok: false, reason: "missing" };

  const [existing] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(customerDevices)
    .where(eq(customerDevices.userId, user.id));

  /*
   * Counted before the insert, and the conflict clause makes re-adding the same
   * phone a no-op rather than an error — so hitting the limit is about distinct
   * devices, not about tapping twice.
   */
  const already = await db
    .select({ id: customerDevices.deviceModelId })
    .from(customerDevices)
    .where(
      and(
        eq(customerDevices.userId, user.id),
        eq(customerDevices.deviceModelId, deviceModelId),
      ),
    );

  if (already.length === 0 && (existing?.n ?? 0) >= MAX_DEVICES) {
    return { ok: false, reason: "limit" };
  }

  await db
    .insert(customerDevices)
    .values({
      userId: user.id,
      deviceModelId,
      label: label?.trim() || null,
      // The first phone added is the primary one. Someone with one device
      // should never have to nominate it.
      isPrimary: (existing?.n ?? 0) === 0,
    })
    .onConflictDoUpdate({
      target: [customerDevices.userId, customerDevices.deviceModelId],
      set: { label: label?.trim() || null },
    });

  revalidatePath("/account/devices");
  return { ok: true };
}

export async function removeMyDevice(
  deviceModelId: string,
): Promise<DeviceResult> {
  const user = await currentUser();
  if (!user) return { ok: false, reason: "signed_out" };

  const removed = await db
    .delete(customerDevices)
    .where(
      and(
        eq(customerDevices.userId, user.id),
        eq(customerDevices.deviceModelId, deviceModelId),
      ),
    )
    .returning({ wasPrimary: customerDevices.isPrimary });

  /*
   * Removing the primary promotes the oldest survivor, rather than leaving a
   * customer with devices but no primary — a state where "does it fit my
   * phone?" has no answer even though they told us about three phones.
   */
  if (removed[0]?.wasPrimary) {
    const [next] = await db
      .select({ id: customerDevices.deviceModelId })
      .from(customerDevices)
      .where(eq(customerDevices.userId, user.id))
      .orderBy(asc(customerDevices.createdAt))
      .limit(1);

    if (next) {
      await db
        .update(customerDevices)
        .set({ isPrimary: true })
        .where(
          and(
            eq(customerDevices.userId, user.id),
            eq(customerDevices.deviceModelId, next.id),
          ),
        );
    }
  }

  revalidatePath("/account/devices");
  return { ok: true };
}

export async function setPrimaryDevice(
  deviceModelId: string,
): Promise<DeviceResult> {
  const user = await currentUser();
  if (!user) return { ok: false, reason: "signed_out" };

  await db.transaction(async (tx) => {
    // Cleared first, so there is never a moment with two primaries — a reader
    // between the two writes would otherwise get an arbitrary one.
    await tx
      .update(customerDevices)
      .set({ isPrimary: false })
      .where(eq(customerDevices.userId, user.id));

    await tx
      .update(customerDevices)
      .set({ isPrimary: true })
      .where(
        and(
          eq(customerDevices.userId, user.id),
          eq(customerDevices.deviceModelId, deviceModelId),
        ),
      );
  });

  revalidatePath("/account/devices");
  return { ok: true };
}

export type MyDevice = {
  deviceModelId: string;
  model: string;
  brand: string;
  label: string | null;
  isPrimary: boolean;
};

/** The phones this customer told us about, primary first. */
export async function loadMyDevices(): Promise<MyDevice[]> {
  const user = await currentUser();
  if (!user) return [];

  return db
    .select({
      deviceModelId: deviceModels.id,
      model: deviceModels.name,
      brand: deviceBrands.name,
      label: customerDevices.label,
      isPrimary: customerDevices.isPrimary,
    })
    .from(customerDevices)
    .innerJoin(deviceModels, eq(deviceModels.id, customerDevices.deviceModelId))
    .innerJoin(deviceBrands, eq(deviceBrands.id, deviceModels.deviceBrandId))
    .where(eq(customerDevices.userId, user.id))
    .orderBy(desc(customerDevices.isPrimary), asc(customerDevices.createdAt));
}

export type FitVerdict = {
  /** Null when we cannot say: a guest, no saved devices, or a product with no
   *  fitment recorded at all — which is most of the catalog. */
  fits: boolean | null;
  /** The saved devices this product does fit, for "fits your iPhone 15". */
  fitting: MyDevice[];
};

/**
 * Does this product fit anything the customer owns?
 *
 * Reads `product_device_fit`, the rollup the triggers maintain from each
 * variant's fitment, so this is one indexed lookup rather than a walk through
 * variants.
 *
 * A product with no fitment rows is universal — a power bank fits everyone — so
 * the verdict is null rather than false. Telling someone a cable "does not fit
 * your phone" because nobody recorded fitment for cables would lose a sale for
 * no reason.
 */
export async function fitsMyDevices(productId: string): Promise<FitVerdict> {
  const devices = await loadMyDevices();
  if (devices.length === 0) return { fits: null, fitting: [] };

  const [recorded] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(productDeviceFit)
    .where(eq(productDeviceFit.productId, productId));

  if ((recorded?.n ?? 0) === 0) return { fits: null, fitting: [] };

  const matches = await db
    .select({ deviceModelId: productDeviceFit.deviceModelId })
    .from(productDeviceFit)
    .where(
      and(
        eq(productDeviceFit.productId, productId),
        inArray(
          productDeviceFit.deviceModelId,
          devices.map((d) => d.deviceModelId),
        ),
      ),
    );

  const fitting = devices.filter((d) =>
    matches.some((m) => m.deviceModelId === d.deviceModelId),
  );
  return { fits: fitting.length > 0, fitting };
}
