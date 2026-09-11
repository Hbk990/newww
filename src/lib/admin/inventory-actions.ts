"use server";

import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import {
  brands,
  inventory,
  inventoryLedger,
  products,
  variants,
} from "@/db/schema";
import { requirePermission } from "@/lib/auth/guards";

import { REASON_VALUES } from "./inventory-reasons";

import { recordAudit } from "./audit";

export type StockResult =
  | { ok: true; onHand?: number }
  | { ok: false; error: string };

/**
 * How stock is described where it is read.
 *
 * `available` is the honest answer for an untracked variant, which is the
 * default and the majority: it sells on the switch alone and ignores on_hand
 * entirely. Reporting "0 in stock" for those would be wrong in both
 * directions — it looks out of stock, and it implies a number nobody entered.
 */
export type StockRow = {
  variantId: string;
  productId: string;
  productTitle: string;
  variantTitle: string;
  sku: string | null;
  brand: string | null;
  track: boolean;
  available: boolean;
  onHand: number;
  reserved: number;
  lowStockThreshold: number | null;
  policy: string;
  priceCents: number;
};

export async function loadStock(options?: {
  query?: string;
  only?: "tracked" | "untracked" | "low" | "unavailable";
}): Promise<StockRow[]> {
  await requirePermission("inventory.view");

  const filters = [];
  if (options?.query) {
    const needle = `%${options.query.trim()}%`;
    filters.push(
      or(
        sql`${products.title} ilike ${needle}`,
        sql`${variants.title} ilike ${needle}`,
        sql`${variants.sku} ilike ${needle}`,
      ),
    );
  }
  if (options?.only === "tracked") filters.push(eq(inventory.track, true));
  if (options?.only === "untracked") filters.push(eq(inventory.track, false));
  if (options?.only === "unavailable")
    filters.push(eq(inventory.available, false));
  if (options?.only === "low") {
    /*
     * Low means tracked, with a threshold set, and at or under it.
     *
     * Sellable quantity is on_hand minus reserved, not on_hand — stock already
     * promised to an unfinished checkout is not available to promise again.
     */
    filters.push(
      and(
        eq(inventory.track, true),
        isNotNull(inventory.lowStockThreshold),
        lte(
          sql`${inventory.onHand} - ${inventory.reserved}`,
          inventory.lowStockThreshold,
        ),
      ),
    );
  }

  return db
    .select({
      variantId: variants.id,
      productId: products.id,
      productTitle: products.title,
      variantTitle: variants.title,
      sku: variants.sku,
      brand: brands.name,
      track: inventory.track,
      available: inventory.available,
      onHand: inventory.onHand,
      reserved: inventory.reserved,
      lowStockThreshold: inventory.lowStockThreshold,
      policy: inventory.policy,
      priceCents: variants.priceCents,
    })
    .from(inventory)
    .innerJoin(variants, eq(variants.id, inventory.variantId))
    .innerJoin(products, eq(products.id, variants.productId))
    .leftJoin(brands, eq(brands.id, products.brandId))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(asc(products.title), asc(variants.position))
    .limit(300);
}

/** One variant's movement history, newest first. */
export async function loadLedger(variantId: string) {
  await requirePermission("inventory.view");
  return db
    .select({
      id: inventoryLedger.id,
      delta: inventoryLedger.delta,
      reason: inventoryLedger.reason,
      note: inventoryLedger.note,
      referenceId: inventoryLedger.referenceId,
      createdAt: inventoryLedger.createdAt,
    })
    .from(inventoryLedger)
    .where(eq(inventoryLedger.variantId, variantId))
    .orderBy(desc(inventoryLedger.createdAt))
    .limit(100);
}

/** Flips the availability switch — the default way a variant goes on or off sale. */
export async function setAvailable(
  variantId: string,
  available: boolean,
): Promise<StockResult> {
  const user = await requirePermission("inventory.adjust");

  await db.transaction(async (tx) => {
    await tx
      .update(inventory)
      .set({ available, updatedAt: new Date() })
      .where(eq(inventory.variantId, variantId));
    await recordAudit(tx, user.id, {
      entityType: "inventory",
      entityId: variantId,
      action: "update",
      field: "available",
      newValue: available,
    });
  });

  revalidatePath("/admin/stock");
  revalidatePath("/admin/products");
  return { ok: true };
}

/*
 * Digits required, and an empty field is not zero.
 *
 * `z.coerce.number()` turns "" into 0, because that is what Number("") does.
 * Left like that, submitting the opening count blank starts the variant
 * tracked at zero on hand under the default 'deny' policy — instantly
 * unsellable, which is precisely the failure the two-mode inventory was
 * introduced to fix. The regex rejects blank, negative and non-numeric before
 * any coercion happens.
 */
const openingCount = z
  .union([
    z.number().int("Whole units only.").min(0).max(1_000_000),
    z
      .string()
      .trim()
      .regex(/^\d{1,7}$/, "Enter the opening count — a whole number of units."),
  ])
  .transform((v) => (typeof v === "number" ? v : Number(v)));

/**
 * Turns counting on or off for one variant.
 *
 * Switching on demands an opening count. Without one the variant would start
 * at zero on hand under the default 'deny' policy and become instantly
 * unsellable — which is the exact failure the two-mode inventory was
 * introduced to fix, where every variant was tracked with quantities nobody
 * had entered and claim_stock refused every sale.
 */
export async function setTracking(
  variantId: string,
  track: boolean,
  opening?: unknown,
): Promise<StockResult> {
  const user = await requirePermission("inventory.adjust");

  if (!track) {
    await db.transaction(async (tx) => {
      await tx
        .update(inventory)
        .set({ track: false, updatedAt: new Date() })
        .where(eq(inventory.variantId, variantId));
      await recordAudit(tx, user.id, {
        entityType: "inventory",
        entityId: variantId,
        action: "update",
        field: "track",
        oldValue: true,
        newValue: false,
        note: "back to the availability switch; on_hand left as it was",
      });
    });
    revalidatePath("/admin/stock");
    return { ok: true };
  }

  const parsed = openingCount.safeParse(opening);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Enter the opening count.",
    };
  }

  const [before] = await db
    .select({ onHand: inventory.onHand })
    .from(inventory)
    .where(eq(inventory.variantId, variantId));
  if (!before)
    return { ok: false, error: "That variant has no inventory row." };

  await db.transaction(async (tx) => {
    await tx
      .update(inventory)
      .set({ track: true, onHand: parsed.data, updatedAt: new Date() })
      .where(eq(inventory.variantId, variantId));

    /*
     * The opening count is written to the ledger too.
     *
     * Otherwise the history starts mid-story: a variant appears with 40 units
     * and the first entry explains a sale of one, leaving the other 39
     * unaccounted for. The delta is the difference from whatever on_hand held
     * before, so the ledger still sums to the current quantity.
     */
    const delta = parsed.data - before.onHand;
    if (delta !== 0) {
      await tx.insert(inventoryLedger).values({
        variantId,
        delta,
        reason: "opening_count",
        note: `tracking switched on with ${parsed.data} on hand`,
      });
    }

    await recordAudit(tx, user.id, {
      entityType: "inventory",
      entityId: variantId,
      action: "update",
      field: "track",
      oldValue: false,
      newValue: true,
      note: `opening count ${parsed.data}`,
    });
  });

  revalidatePath("/admin/stock");
  return { ok: true, onHand: parsed.data };
}

const adjustInput = z.object({
  variantId: z.uuid(),
  mode: z.enum(["change", "set"]),
  amount: z.coerce
    .number()
    .int("Whole units only.")
    .min(-1_000_000)
    .max(1_000_000),
  reason: z.enum(REASON_VALUES as [string, ...string[]]),
  note: z
    .string()
    .trim()
    .max(200)
    .transform((v) => v || null)
    .nullable(),
});

export type AdjustInput = z.input<typeof adjustInput>;

/**
 * Moves a tracked quantity, through the database function.
 *
 * The guard and the ledger entry have to be one statement, which is why this
 * calls adjust_stock rather than doing the arithmetic here: a guarded UPDATE
 * followed by a separate INSERT is what let this schema record movements that
 * never happened.
 */
export async function adjustStock(raw: AdjustInput): Promise<StockResult> {
  const user = await requirePermission("inventory.adjust");

  const parsed = adjustInput.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the numbers.",
    };
  }
  const input = parsed.data;

  const [current] = await db
    .select({ onHand: inventory.onHand, track: inventory.track })
    .from(inventory)
    .where(eq(inventory.variantId, input.variantId));
  if (!current)
    return { ok: false, error: "That variant has no inventory row." };
  if (!current.track) {
    return {
      ok: false,
      error:
        "This variant isn't counted. Turn tracking on first, with an opening count.",
    };
  }

  // "Set to 7" is the shape a stock count comes in; the ledger still records
  // the movement, because a history of absolute values cannot be summed.
  const delta =
    input.mode === "set" ? input.amount - current.onHand : input.amount;
  if (delta === 0) {
    return {
      ok: false,
      error:
        input.mode === "set"
          ? `Already at ${input.amount}. Nothing to record.`
          : "Enter a change other than zero.",
    };
  }

  try {
    const result = await db.transaction(async (tx) => {
      const rows = await tx.execute<{ adjust_stock: number }>(
        sql`select adjust_stock(${input.variantId}, ${delta}, ${input.reason}, ${input.note})`,
      );
      const onHand = [...rows][0]?.adjust_stock ?? null;

      await recordAudit(tx, user.id, {
        entityType: "inventory",
        entityId: input.variantId,
        action: "update",
        field: "on_hand",
        oldValue: current.onHand,
        newValue: onHand,
        note: `${input.reason}${input.note ? `: ${input.note}` : ""}`,
      });
      return onHand;
    });

    revalidatePath("/admin/stock");
    revalidatePath("/admin/products");
    return { ok: true, onHand: result ?? undefined };
  } catch (error) {
    /*
     * The function raises with a readable message and sometimes a hint, both
     * of which say more than a generic failure would. Surfaced rather than
     * swallowed, and only for the errors it raises deliberately —
     * check_violation and foreign_key_violation — so a genuine fault still
     * reaches the error boundary.
     */
    const raised = raisedMessage(error);
    if (raised) return { ok: false, error: raised };
    throw error;
  }
}

function raisedMessage(error: unknown): string | null {
  for (let current = error, depth = 0; current && depth < 5; depth += 1) {
    if (typeof current === "object" && "code" in current) {
      const e = current as { code?: string; message?: string; hint?: string };
      if (e.code === "23514" || e.code === "23503") {
        const message = (e.message ?? "").replace(/^ERROR:\s*/, "");
        // The uuid in the raised message is for a log, not for a person.
        const readable = message.replace(
          /variant [0-9a-f-]{36}/gi,
          "this variant",
        );
        return e.hint ? `${readable} ${e.hint}` : readable;
      }
    }
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

const thresholdInput = z
  .union([z.coerce.number().int().min(0).max(100_000), z.literal("")])
  .transform((v) => (v === "" ? null : v));

/** Sets or clears the level at which a variant counts as low. */
export async function setLowStockThreshold(
  variantId: string,
  value: unknown,
): Promise<StockResult> {
  const user = await requirePermission("inventory.adjust");
  const parsed = thresholdInput.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Enter a whole number, or leave it empty for no alert.",
    };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(inventory)
      .set({ lowStockThreshold: parsed.data, updatedAt: new Date() })
      .where(eq(inventory.variantId, variantId));
    await recordAudit(tx, user.id, {
      entityType: "inventory",
      entityId: variantId,
      action: "update",
      field: "low_stock_threshold",
      newValue: parsed.data,
    });
  });

  revalidatePath("/admin/stock");
  return { ok: true };
}

/** Marks several variants available or unavailable at once. */
export async function setAvailableBulk(
  variantIds: string[],
  available: boolean,
): Promise<StockResult> {
  const user = await requirePermission("inventory.adjust");
  if (variantIds.length === 0) return { ok: true };

  await db.transaction(async (tx) => {
    await tx
      .update(inventory)
      .set({ available, updatedAt: new Date() })
      .where(inArray(inventory.variantId, variantIds));
    await recordAudit(tx, user.id, {
      entityType: "inventory",
      action: "update",
      field: "available",
      newValue: available,
      note: `${variantIds.length} variants at once`,
    });
  });

  revalidatePath("/admin/stock");
  revalidatePath("/admin/products");
  return { ok: true };
}

/** Counts for the page's filter chips, so each says how much it would show. */
export async function stockCounts() {
  await requirePermission("inventory.view");
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      tracked: sql<number>`count(*) filter (where inventory.track)::int`,
      untracked: sql<number>`count(*) filter (where not inventory.track)::int`,
      unavailable: sql<number>`count(*) filter (where not inventory.available)::int`,
      low: sql<number>`count(*) filter (
        where inventory.track
          and inventory.low_stock_threshold is not null
          and inventory.on_hand - inventory.reserved <= inventory.low_stock_threshold
      )::int`,
    })
    .from(inventory);
  return row ?? { total: 0, tracked: 0, untracked: 0, unavailable: 0, low: 0 };
}
