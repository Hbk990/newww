"use server";

import { asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { shippingRates, shippingZones } from "@/db/schema";
import { requirePermission } from "@/lib/auth/guards";
import { LEBANON_REGIONS } from "@/lib/shipping/regions";

import { recordAudit } from "./audit";

export type ShippingResult =
  | { ok: true; id?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

function invalid(error: z.ZodError): ShippingResult {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return {
    ok: false,
    error: error.issues[0]?.message ?? "Check the highlighted fields.",
    fieldErrors,
  };
}

/**
 * Money arrives as a typed string, never through `z.coerce.number()`.
 *
 * `z.coerce.number()` turns "" into 0, which for a price means a blank field
 * silently becomes free delivery. Requiring digits makes an empty field an
 * error, which is what it is.
 */
const dollars = z
  .string()
  .trim()
  .regex(/^\d{1,5}(\.\d{1,2})?$/, "Use an amount like 3 or 3.50.")
  .transform((v) => Math.round(Number(v) * 100));

/** Same shape, but blank is meaningful here: no threshold at all. */
const optionalDollars = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d{1,6}(\.\d{1,2})?$/.test(v), {
    message: "Leave blank, or use an amount like 50.",
  })
  .transform((v) => (v === "" ? null : Math.round(Number(v) * 100)));

const zoneInput = z.object({
  name: z.string().trim().min(1, "A name is required.").max(80),
  /**
   * At least one governorate, or the zone matches nothing and its rate is
   * unreachable — which looks like a configured zone and behaves like a missing
   * one.
   */
  regions: z
    .array(z.enum(LEBANON_REGIONS))
    .min(1, "Pick at least one governorate."),
  position: z.coerce.number().int().min(0).max(9999),
});

const rateInput = z.object({
  name: z.string().trim().min(1, "A name is required.").max(80),
  priceCents: dollars,
  minSubtotalCents: optionalDollars,
  position: z.coerce.number().int().min(0).max(9999),
});

export type ZoneInput = z.input<typeof zoneInput>;
export type RateInput = z.input<typeof rateInput>;

export async function loadShipping() {
  await requirePermission("settings.view");

  const zones = await db
    .select()
    .from(shippingZones)
    .orderBy(asc(shippingZones.position), asc(shippingZones.name));

  const rates = await db
    .select()
    .from(shippingRates)
    .orderBy(asc(shippingRates.position), asc(shippingRates.name));

  /*
   * Which governorates no zone covers. Shown on the screen because it is the
   * one mistake with a silent cost: a region nobody claimed is a region the
   * checkout refuses, and the only symptom is a shopper who never completes an
   * order.
   */
  const covered = new Set(zones.flatMap((z) => z.regions));
  const uncovered = LEBANON_REGIONS.filter((r) => !covered.has(r));

  return { zones, rates, uncovered };
}

export async function saveZone(
  id: string | null,
  raw: ZoneInput,
): Promise<ShippingResult> {
  const user = await requirePermission("settings.edit");
  const parsed = zoneInput.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;

  if (id) {
    const [before] = await db
      .select()
      .from(shippingZones)
      .where(eq(shippingZones.id, id));
    if (!before) return { ok: false, error: "That zone no longer exists." };

    await db
      .update(shippingZones)
      .set({ name: input.name, regions: [...input.regions], position: input.position })
      .where(eq(shippingZones.id, id));

    await recordAudit(db, user.id, {
      entityType: "shipping_zone",
      entityId: id,
      action: "update",
      oldValue: { name: before.name, regions: before.regions },
      newValue: { name: input.name, regions: input.regions },
    });
    revalidatePath("/admin/shipping");
    return { ok: true, id };
  }

  const [created] = await db
    .insert(shippingZones)
    .values({ name: input.name, regions: [...input.regions], position: input.position })
    .returning({ id: shippingZones.id });
  if (!created) return { ok: false, error: "Could not create that zone." };

  await recordAudit(db, user.id, {
    entityType: "shipping_zone",
    entityId: created.id,
    action: "create",
    newValue: { name: input.name, regions: input.regions },
  });
  revalidatePath("/admin/shipping");
  return { ok: true, id: created.id };
}

export async function deleteZone(id: string): Promise<ShippingResult> {
  const user = await requirePermission("settings.edit");

  const [zone] = await db
    .select()
    .from(shippingZones)
    .where(eq(shippingZones.id, id));
  if (!zone) return { ok: false, error: "That zone no longer exists." };

  /*
   * Deleting the last zone covering a region is allowed, but not silently: the
   * screen lists uncovered governorates precisely so this is visible. Blocking
   * it would stop a legitimate reorganisation.
   *
   * Its rates go with it by ON DELETE CASCADE, which is right — a rate without
   * a zone prices nothing.
   */
  await db.delete(shippingZones).where(eq(shippingZones.id, id));

  await recordAudit(db, user.id, {
    entityType: "shipping_zone",
    entityId: id,
    action: "delete",
    oldValue: { name: zone.name, regions: zone.regions },
  });
  revalidatePath("/admin/shipping");
  return { ok: true };
}

export async function saveRate(
  zoneId: string,
  id: string | null,
  raw: RateInput,
): Promise<ShippingResult> {
  const user = await requirePermission("settings.edit");
  const parsed = rateInput.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;

  const [zone] = await db
    .select({ id: shippingZones.id })
    .from(shippingZones)
    .where(eq(shippingZones.id, zoneId));
  if (!zone) return { ok: false, error: "That zone no longer exists." };

  if (id) {
    await db
      .update(shippingRates)
      .set({
        name: input.name,
        priceCents: input.priceCents,
        minSubtotalCents: input.minSubtotalCents,
        position: input.position,
      })
      .where(eq(shippingRates.id, id));
    await recordAudit(db, user.id, {
      entityType: "shipping_rate",
      entityId: id,
      action: "update",
      newValue: input,
    });
  } else {
    const [created] = await db
      .insert(shippingRates)
      .values({
        zoneId,
        name: input.name,
        priceCents: input.priceCents,
        minSubtotalCents: input.minSubtotalCents,
        position: input.position,
      })
      .returning({ id: shippingRates.id });
    if (!created) return { ok: false, error: "Could not create that rate." };
    await recordAudit(db, user.id, {
      entityType: "shipping_rate",
      entityId: created.id,
      action: "create",
      newValue: { zoneId, ...input },
    });
  }

  revalidatePath("/admin/shipping");
  return { ok: true };
}

export async function deleteRate(id: string): Promise<ShippingResult> {
  const user = await requirePermission("settings.edit");

  const [rate] = await db
    .select()
    .from(shippingRates)
    .where(eq(shippingRates.id, id));
  if (!rate) return { ok: false, error: "That rate no longer exists." };

  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(shippingRates)
    .where(eq(shippingRates.zoneId, rate.zoneId));

  /*
   * The last rate in a zone is refused. A zone with no rate is dropped from the
   * quotes altogether, so its regions quietly become undeliverable — the same
   * outcome as deleting the zone, reached by a route that does not look like
   * it. Delete the zone if that is what is meant.
   */
  if (n <= 1) {
    return {
      ok: false,
      error:
        "That is the only rate in this zone. A zone with no rate cannot be delivered to — delete the zone instead.",
    };
  }

  await db.delete(shippingRates).where(eq(shippingRates.id, id));
  await recordAudit(db, user.id, {
    entityType: "shipping_rate",
    entityId: id,
    action: "delete",
    oldValue: { name: rate.name, priceCents: rate.priceCents },
  });
  revalidatePath("/admin/shipping");
  return { ok: true };
}
