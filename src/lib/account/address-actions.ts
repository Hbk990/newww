"use server";

import { and, desc, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { addresses } from "@/db/schema";
import { currentUser } from "@/lib/auth/session";
import { LEBANON_REGIONS } from "@/lib/shipping/regions";

import { MAX_ADDRESSES } from "./addresses";

export type AddressResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const input = z.object({
  label: z
    .string()
    .trim()
    .max(40, "40 characters is the limit.")
    .transform((v) => (v === "" ? null : v)),
  name: z.string().trim().min(2, "Who should the driver ask for?").max(80),
  phone: z
    .string()
    .trim()
    .min(7, "A phone number is needed — the driver calls before arriving.")
    .max(30),
  line1: z.string().trim().min(3, "A street address is needed.").max(200),
  building: z
    .string()
    .trim()
    .max(80)
    .transform((v) => (v === "" ? null : v)),
  floor: z
    .string()
    .trim()
    .max(40)
    .transform((v) => (v === "" ? null : v)),
  city: z.string().trim().min(2, "Which city or town?").max(80),
  /**
   * A closed list, not free text. The delivery fee is looked up by an exact
   * match against `shipping_zones.regions`, so "Mt Lebanon" would find no zone
   * and the customer would be told we do not deliver to them.
   */
  region: z.enum(LEBANON_REGIONS, "Choose your governorate."),
  /**
   * How the place is actually found. Lebanese addresses often have no number
   * on the door, and this line is what saves the driver a phone call.
   */
  directions: z
    .string()
    .trim()
    .max(300)
    .transform((v) => (v === "" ? null : v)),
});

export type AddressInput = z.input<typeof input>;

function fieldErrors(error: z.ZodError): AddressResult {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return {
    ok: false,
    error: error.issues[0]?.message ?? "Check the highlighted fields.",
    fieldErrors: errors,
  };
}

/**
 * The address book, in the order the checkout will offer them.
 *
 * The `name` column carries the delivery name; the optional `label` is what
 * the customer calls the place ("Home", "The shop"). Both, because "Ali
 * Hassan" and "the office" answer different questions and a driver needs the
 * first.
 */
export async function loadAddresses() {
  const user = await currentUser();
  if (!user) return [];

  return db
    .select()
    .from(addresses)
    .where(eq(addresses.userId, user.id))
    .orderBy(desc(addresses.isDefault), desc(addresses.createdAt));
}

export async function saveAddress(
  id: string | null,
  raw: AddressInput,
): Promise<AddressResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Sign in to manage your addresses." };

  const parsed = input.safeParse(raw);
  if (!parsed.success) return fieldErrors(parsed.error);
  const values = { ...parsed.data, country: "LB" as const };

  if (id) {
    /*
     * The where clause carries the user id as well as the row id.
     *
     * Without it, anyone signed in could edit any address by guessing a uuid.
     * Ownership belongs in the query rather than in a check above it: a check
     * can be forgotten when this function grows another caller.
     */
    const updated = await db
      .update(addresses)
      .set(values)
      .where(and(eq(addresses.id, id), eq(addresses.userId, user.id)))
      .returning({ id: addresses.id });

    if (updated.length === 0) {
      return { ok: false, error: "That address is no longer in your book." };
    }
    revalidatePath("/account/addresses");
    return { ok: true };
  }

  // noUncheckedIndexedAccess: a count query always returns a row, but the
  // type does not know that.
  const [counted] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(addresses)
    .where(eq(addresses.userId, user.id));
  const n = counted?.n ?? 0;

  if (n >= MAX_ADDRESSES) {
    return {
      ok: false,
      error: `${MAX_ADDRESSES} addresses is the most we keep. Remove one first.`,
    };
  }

  await db.insert(addresses).values({
    userId: user.id,
    ...values,
    // The first one saved is the default, because a book of one has an obvious
    // answer and making someone choose it is a pointless step.
    isDefault: n === 0,
  });

  revalidatePath("/account/addresses");
  return { ok: true };
}

/**
 * Makes one address the default, in a transaction that clears the others.
 *
 * Two defaults is worse than none: the checkout would prefill whichever the
 * sort happened to return first, so the same customer could see a different
 * address on two visits with nothing changed.
 */
export async function setDefaultAddress(id: string): Promise<AddressResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Sign in to manage your addresses." };

  const result = await db.transaction(async (tx) => {
    const claimed = await tx
      .update(addresses)
      .set({ isDefault: true })
      .where(and(eq(addresses.id, id), eq(addresses.userId, user.id)))
      .returning({ id: addresses.id });

    if (claimed.length === 0) return false;

    await tx
      .update(addresses)
      .set({ isDefault: false })
      .where(and(eq(addresses.userId, user.id), ne(addresses.id, id)));

    return true;
  });

  if (!result) {
    return { ok: false, error: "That address is no longer in your book." };
  }

  revalidatePath("/account/addresses");
  return { ok: true };
}

/**
 * Removes an address from the book.
 *
 * Orders are untouched: each one keeps its own snapshot of where it went, so
 * deleting an address here cannot rewrite the record of a past delivery.
 *
 * Deleting the default promotes the next one, so a customer who had a default
 * still has one — and the checkout keeps prefilling instead of silently
 * starting to ask for everything again.
 */
export async function deleteAddress(id: string): Promise<AddressResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Sign in to manage your addresses." };

  await db.transaction(async (tx) => {
    const removed = await tx
      .delete(addresses)
      .where(and(eq(addresses.id, id), eq(addresses.userId, user.id)))
      .returning({ wasDefault: addresses.isDefault });

    if (removed.length === 0 || !removed[0]?.wasDefault) return;

    const [survivor] = await tx
      .select({ id: addresses.id })
      .from(addresses)
      .where(eq(addresses.userId, user.id))
      .orderBy(desc(addresses.createdAt))
      .limit(1);

    if (survivor) {
      await tx
        .update(addresses)
        .set({ isDefault: true })
        .where(eq(addresses.id, survivor.id));
    }
  });

  revalidatePath("/account/addresses");
  return { ok: true };
}
