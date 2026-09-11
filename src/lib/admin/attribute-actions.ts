"use server";

import { and, asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import {
  attributeDefinitions,
  attributeOptions,
  categoryAttributes,
  productAttributes,
} from "@/db/schema";
import { requirePermission } from "@/lib/auth/guards";

import { recordAudit } from "./audit";

/**
 * `code` is the stable identifier the storefront filters on — it ends up in
 * query strings like `?capacity_mah=10000`. Lowercase snake_case only, so a
 * URL never has to escape it and a rename is a visible decision rather than
 * something that happens by typing a capital letter.
 */
const code = z
  .string()
  .trim()
  .min(2, "Code must be at least 2 characters.")
  .max(50, "Code must be 50 characters or fewer.")
  .regex(
    /^[a-z][a-z0-9_]*$/,
    "Use lowercase letters, numbers and underscores, starting with a letter — like capacity_mah.",
  );

const label = z
  .string()
  .trim()
  .min(1, "Label is required.")
  .max(80, "Label must be 80 characters or fewer.");

const attributeInput = z.object({
  code,
  label,
  dataType: z.enum(["text", "number", "boolean", "enum"]),
  // Empty string from an untouched input means "no unit", not a validation
  // failure — the field is only meaningful for numbers.
  unit: z
    .string()
    .trim()
    .max(16, "Unit must be 16 characters or fewer.")
    .transform((v) => v || null)
    .nullable(),
  isFilterable: z.boolean(),
  isComparable: z.boolean(),
  isMulti: z.boolean(),
  position: z.coerce.number().int().min(0).max(9999),
}).refine((v) => !v.isMulti || v.dataType === "enum", {
  // Mirrors attribute_definitions_multi_requires_enum, so the form says why
  // instead of surfacing a constraint violation.
  path: ["isMulti"],
  message: "Only a choice list can hold several values.",
});

export type AttributeInput = z.infer<typeof attributeInput>;

/** What every action here returns, so forms can render errors uniformly. */
export type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

function invalid(error: z.ZodError): ActionResult {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    // First message per field wins: showing three complaints about one input
    // buries the one worth reading.
    if (typeof key === "string" && !fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }
  return { ok: false, error: "Check the highlighted fields.", fieldErrors };
}

export async function createAttribute(
  raw: AttributeInput,
): Promise<ActionResult> {
  const user = await requirePermission("products.edit");
  const parsed = attributeInput.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;

  try {
    const id = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(attributeDefinitions)
        .values(input)
        .returning({ id: attributeDefinitions.id });
      if (!row) throw new Error("insert returned no row");

      await recordAudit(tx, user.id, {
        entityType: "attribute",
        entityId: row.id,
        action: "create",
        newValue: input,
      });
      return row.id;
    });
    revalidatePath("/admin/attributes");
    return { ok: true, id };
  } catch (error) {
    return duplicateCode(error, input.code);
  }
}

export async function updateAttribute(
  id: string,
  raw: AttributeInput,
): Promise<ActionResult> {
  const user = await requirePermission("products.edit");
  const parsed = attributeInput.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;

  const [before] = await db
    .select()
    .from(attributeDefinitions)
    .where(eq(attributeDefinitions.id, id));
  if (!before) return { ok: false, error: "That attribute no longer exists." };

  /**
   * Changing the data type of an attribute that already holds values would
   * strand them: a number typed into `value_number` is invisible to a screen
   * that now reads `value_text`, and the check constraint allows exactly one
   * populated column. Blocked rather than silently migrated, because there is
   * no correct automatic reading of "true" as a number.
   */
  if (before.dataType !== input.dataType) {
    const [used] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(productAttributes)
      .where(eq(productAttributes.attributeId, id));
    if ((used?.n ?? 0) > 0) {
      return {
        ok: false,
        error: `Can't change the type: ${used?.n} product${used?.n === 1 ? "" : "s"} already use this attribute. Clear those values first, or create a new attribute.`,
        fieldErrors: { dataType: "In use by existing products." },
      };
    }
  }

  /**
   * Turning multi off is the mirror of changing the type: the database check
   * only fires on writes to `product_attributes`, so flipping the flag while
   * products already hold several values leaves rows the single-value trigger
   * would now reject — visible only the next time someone edits one of them.
   */
  if (before.isMulti && !input.isMulti) {
    const [worst] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(productAttributes)
      .where(eq(productAttributes.attributeId, id))
      .groupBy(productAttributes.productId)
      .orderBy(sql`count(*) desc`)
      .limit(1);
    if ((worst?.n ?? 0) > 1) {
      return {
        ok: false,
        error: `Can't switch to a single value: a product already has ${worst?.n} of these. Remove the extras first.`,
        fieldErrors: { isMulti: "A product holds several values." },
      };
    }
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(attributeDefinitions)
        .set(input)
        .where(eq(attributeDefinitions.id, id));

      // One row per changed field, so the audit page reads as a list of
      // changes rather than two opaque JSON blobs to diff by eye.
      for (const key of Object.keys(input) as (keyof AttributeInput)[]) {
        if (before[key] !== input[key]) {
          await recordAudit(tx, user.id, {
            entityType: "attribute",
            entityId: id,
            action: "update",
            field: key,
            oldValue: before[key],
            newValue: input[key],
          });
        }
      }
    });
    revalidatePath("/admin/attributes");
    revalidatePath(`/admin/attributes/${id}`);
    return { ok: true, id };
  } catch (error) {
    return duplicateCode(error, input.code);
  }
}

/**
 * Deletes an attribute, refusing once products depend on it.
 *
 * The foreign key from `product_attributes` cascades, so without this check
 * deleting an attribute would silently erase a spec from every product that
 * had it — the kind of loss nobody notices until a filter comes back empty.
 */
export async function deleteAttribute(id: string): Promise<ActionResult> {
  const user = await requirePermission("products.edit");

  const [before] = await db
    .select()
    .from(attributeDefinitions)
    .where(eq(attributeDefinitions.id, id));
  if (!before) return { ok: true };

  const [used] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(productAttributes)
    .where(eq(productAttributes.attributeId, id));
  if ((used?.n ?? 0) > 0) {
    return {
      ok: false,
      error: `${used?.n} product${used?.n === 1 ? "" : "s"} use this attribute. Remove it from them first.`,
    };
  }

  await db.transaction(async (tx) => {
    await tx.delete(attributeDefinitions).where(eq(attributeDefinitions.id, id));
    // Logged before the row is gone, with the whole row as `oldValue`: after
    // the delete there is nothing left to describe what was removed.
    await recordAudit(tx, user.id, {
      entityType: "attribute",
      entityId: id,
      action: "delete",
      oldValue: before,
    });
  });

  revalidatePath("/admin/attributes");
  return { ok: true };
}

const optionInput = z.object({
  value: z
    .string()
    .trim()
    .min(1, "Value is required.")
    .max(60, "Value must be 60 characters or fewer."),
  // A swatch is optional, but a half-typed hex is a mistake worth catching.
  colorHex: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex colour like #1f2937.")
    .transform((v) => v.toLowerCase())
    .nullable()
    .or(z.literal("").transform(() => null)),
});

export async function addOption(
  attributeId: string,
  raw: z.input<typeof optionInput>,
): Promise<ActionResult> {
  const user = await requirePermission("products.edit");
  const parsed = optionInput.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);

  // Append: take the current highest position rather than counting rows, so a
  // gap left by a delete does not collide with an existing position.
  const [last] = await db
    .select({ position: attributeOptions.position })
    .from(attributeOptions)
    .where(eq(attributeOptions.attributeId, attributeId))
    .orderBy(sql`${attributeOptions.position} desc`)
    .limit(1);

  try {
    await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(attributeOptions)
        .values({
          attributeId,
          value: parsed.data.value,
          colorHex: parsed.data.colorHex,
          position: (last?.position ?? -1) + 1,
        })
        .returning({ id: attributeOptions.id });

      await recordAudit(tx, user.id, {
        entityType: "attribute_option",
        entityId: row?.id ?? null,
        action: "create",
        newValue: { attributeId, ...parsed.data },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        error: `"${parsed.data.value}" is already an option here.`,
        fieldErrors: { value: "Already exists." },
      };
    }
    throw error;
  }

  revalidatePath(`/admin/attributes/${attributeId}`);
  return { ok: true };
}

export async function deleteOption(
  attributeId: string,
  optionId: string,
): Promise<ActionResult> {
  const user = await requirePermission("products.edit");

  const [before] = await db
    .select()
    .from(attributeOptions)
    .where(eq(attributeOptions.id, optionId));
  if (!before) return { ok: true };

  /**
   * The composite foreign key is ON DELETE RESTRICT, so the database would
   * refuse this anyway — but as a raw constraint violation. Checking first
   * turns it into a sentence that says how many products are affected.
   */
  const [used] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(productAttributes)
    .where(eq(productAttributes.optionId, optionId));
  if ((used?.n ?? 0) > 0) {
    return {
      ok: false,
      error: `${used?.n} product${used?.n === 1 ? "" : "s"} use "${before.value}". Change them first, or rename this option instead of deleting it.`,
    };
  }

  await db.transaction(async (tx) => {
    await tx.delete(attributeOptions).where(eq(attributeOptions.id, optionId));
    await recordAudit(tx, user.id, {
      entityType: "attribute_option",
      entityId: optionId,
      action: "delete",
      oldValue: before,
    });
  });

  revalidatePath(`/admin/attributes/${attributeId}`);
  return { ok: true };
}

/** Reorders options in one statement per row, inside a transaction. */
export async function reorderOptions(
  attributeId: string,
  orderedIds: string[],
): Promise<ActionResult> {
  const user = await requirePermission("products.edit");

  const current = await db
    .select({ id: attributeOptions.id })
    .from(attributeOptions)
    .where(eq(attributeOptions.attributeId, attributeId))
    .orderBy(asc(attributeOptions.position));

  // Guards against a stale page reordering a list that has since changed —
  // writing positions for rows that no longer exist, or dropping rows the
  // client never saw.
  const known = new Set(current.map((r) => r.id));
  if (orderedIds.length !== known.size || !orderedIds.every((id) => known.has(id))) {
    return {
      ok: false,
      error: "The options changed while you were reordering. Reload and try again.",
    };
  }

  await db.transaction(async (tx) => {
    for (const [index, id] of orderedIds.entries()) {
      await tx
        .update(attributeOptions)
        .set({ position: index })
        .where(eq(attributeOptions.id, id));
    }
    await recordAudit(tx, user.id, {
      entityType: "attribute",
      entityId: attributeId,
      action: "update",
      field: "option_order",
      oldValue: current.map((r) => r.id),
      newValue: orderedIds,
    });
  });

  revalidatePath(`/admin/attributes/${attributeId}`);
  return { ok: true };
}

/**
 * Attaches or detaches an attribute on one category.
 *
 * Assigning to a parent group covers every category under it — resolution is
 * `attributes_for_category()`, which walks up `parent_id` and lets the nearest
 * assignment win. So this writes exactly one row wherever the admin clicked,
 * and inheritance is a read-time concern.
 */
export async function setCategoryAttribute(
  categoryId: string,
  attributeId: string,
  attached: boolean,
  isRequired = false,
): Promise<ActionResult> {
  const user = await requirePermission("products.edit");

  await db.transaction(async (tx) => {
    if (attached) {
      await tx
        .insert(categoryAttributes)
        .values({ categoryId, attributeId, isRequired })
        .onConflictDoUpdate({
          target: [categoryAttributes.categoryId, categoryAttributes.attributeId],
          set: { isRequired },
        });
    } else {
      await tx
        .delete(categoryAttributes)
        .where(
          and(
            eq(categoryAttributes.categoryId, categoryId),
            eq(categoryAttributes.attributeId, attributeId),
          ),
        );
    }

    await recordAudit(tx, user.id, {
      entityType: "category_attribute",
      entityId: categoryId,
      action: attached ? "attach" : "detach",
      field: "attribute",
      newValue: { attributeId, isRequired: attached ? isRequired : null },
    });
  });

  revalidatePath(`/admin/attributes/${attributeId}`);
  revalidatePath("/admin/categories");
  return { ok: true };
}

/**
 * Postgres unique-violation SQLSTATE, looked for down the cause chain.
 *
 * Drizzle re-throws driver errors wrapped in its own `Failed query: ...` Error
 * and hangs the original off `cause`, so the SQLSTATE is never on the error it
 * hands back. Checking only the top level silently missed every constraint
 * violation and turned a "that code is taken" field error into a 500.
 */
function isUniqueViolation(error: unknown): boolean {
  // Bounded rather than `while (true)`: a cause chain that loops back on
  // itself would otherwise hang the request.
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

function duplicateCode(error: unknown, value: string): ActionResult {
  if (isUniqueViolation(error)) {
    return {
      ok: false,
      error: `The code "${value}" is already taken.`,
      fieldErrors: { code: "Already in use." },
    };
  }
  throw error;
}
