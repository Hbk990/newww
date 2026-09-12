"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { storeSettings } from "@/db/schema";
import { requirePermission } from "@/lib/auth/guards";

import { recordAudit } from "./audit";

export type SettingsResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * Money as a typed string, never `z.coerce.number()`.
 *
 * Blank is meaningful here — no threshold — and coercion turns "" into 0, which
 * for a free-delivery threshold means every order ships free.
 */
const optionalDollars = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d{1,7}(\.\d{1,2})?$/.test(v), {
    message: "Leave blank, or use an amount like 50.",
  })
  .transform((v) => (v === "" ? null : Math.round(Number(v) * 100)));

const optionalWholeNumber = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d{1,6}$/.test(v), {
    message: "Leave blank, or use a whole number.",
  })
  .transform((v) => (v === "" ? null : Number(v)));

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v));

const input = z.object({
  storeName: z.string().trim().min(1, "A store name is required.").max(80),
  phone: optionalText(30),
  whatsappNumber: optionalText(30),
  logoUrl: optionalText(500),
  timezone: z.string().trim().min(1, "A timezone is required.").max(60),
  /**
   * Only the prefix is editable, and only forward.
   *
   * next_order_number composes it with the date and a per-day counter.
   * Changing it does not renumber existing orders — nor should it: an order
   * number is what a customer reads back over the phone, so the ones already
   * given out must keep working.
   */
  orderNumberPrefix: z
    .string()
    .trim()
    .min(1, "A prefix is required.")
    .max(8, "8 characters is the limit.")
    .regex(/^[A-Za-z0-9-]+$/, "Letters, numbers and hyphens only."),
  freeDeliveryThresholdCents: optionalDollars,
  defaultLowStockThreshold: optionalWholeNumber,
  isPrivate: z.boolean(),
  maintenanceMode: z.boolean(),
  maintenanceMessage: optionalText(500),
});

export type SettingsInput = z.input<typeof input>;

export async function loadSettings() {
  await requirePermission("settings.view");
  const [row] = await db.select().from(storeSettings).limit(1);
  // Migration 0024 seeds it, so absence means someone deleted it.
  return row ?? null;
}

/**
 * Saves the one settings row.
 *
 * `settings.edit` is in REAUTH_REQUIRED, so `requirePermission` also demands a
 * password entered within the last fifteen minutes and redirects to
 * /admin/confirm otherwise. Nothing extra is needed here — the check lives in
 * the one gate every admin page and action already passes through.
 */
export async function saveSettings(
  raw: SettingsInput,
): Promise<SettingsResult> {
  const user = await requirePermission("settings.edit");

  const parsed = input.safeParse(raw);
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
  const values = parsed.data;

  const [before] = await db.select().from(storeSettings).limit(1);
  if (!before) {
    return {
      ok: false,
      error:
        "There is no settings row. It is seeded by migration 0024 — run the migrations.",
    };
  }

  await db
    .update(storeSettings)
    .set(values)
    .where(eq(storeSettings.id, before.id));

  /*
   * Only what changed goes in the audit entry.
   *
   * Recording the whole row on every save would bury the one field someone
   * actually touched, and "who turned maintenance mode on" is exactly the
   * question this log exists to answer.
   */
  const changed: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, value] of Object.entries(values)) {
    const previous = (before as Record<string, unknown>)[key];
    if (previous !== value) changed[key] = { from: previous, to: value };
  }

  if (Object.keys(changed).length > 0) {
    await recordAudit(db, user.id, {
      entityType: "store_settings",
      entityId: null,
      action: "update",
      newValue: changed,
    });
  }

  revalidatePath("/admin/settings");
  // The storefront reads isPrivate and maintenanceMode on every request, and
  // the layout is cached — without this, turning maintenance on changes nothing
  // until something else happens to invalidate it.
  revalidatePath("/", "layout");
  return { ok: true };
}
