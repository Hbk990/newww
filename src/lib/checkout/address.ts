import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { addresses } from "@/db/schema";
import { isRegion, type Region } from "@/lib/shipping/regions";

export type SavedAddress = {
  id: string;
  name: string;
  phone: string;
  line1: string;
  city: string;
  region: Region | null;
};

/**
 * The delivery details this customer used last, for prefilling checkout.
 *
 * Their default address, or failing that the most recent one they saved. The
 * point of requiring an account is that nobody types their address twice, and
 * this is the half of that promise the customer actually sees.
 *
 * `region` comes back null when what is stored is not one of the eight
 * governorates the shipping zones are keyed on — an address saved before the
 * list existed, or one edited by hand. The form then simply asks again rather
 * than preselecting a value the zone lookup would not match.
 */
export async function savedAddress(
  userId: string,
): Promise<SavedAddress | null> {
  const [row] = await db
    .select({
      id: addresses.id,
      name: addresses.name,
      phone: addresses.phone,
      line1: addresses.line1,
      city: addresses.city,
      region: addresses.region,
    })
    .from(addresses)
    .where(eq(addresses.userId, userId))
    .orderBy(desc(addresses.isDefault), desc(addresses.createdAt))
    .limit(1);

  if (!row) return null;

  return {
    ...row,
    region: isRegion(row.region) ? row.region : null,
  };
}

export type AddressInput = {
  name: string;
  phone: string;
  line1: string;
  city: string;
  region: string;
};

/**
 * Keeps the details an order was placed with, so the next order is two taps.
 *
 * Updates the customer's default address in place rather than adding a row per
 * order: a shopper who orders monthly would otherwise accumulate twelve
 * identical addresses, and the prefill would start guessing between them.
 *
 * What it deliberately does NOT touch is the order's own copy of the address.
 * `orders` stores its own snapshot — editing a saved address must never
 * rewrite where a past parcel went, which is the whole reason that snapshot
 * exists.
 *
 * Never throws into the checkout. A failure here costs a convenience on the
 * next visit; letting it bubble would cost the customer an order they have
 * already paid for in stock terms — the order is committed by the time this
 * runs.
 */
export async function rememberAddress(
  userId: string,
  input: AddressInput,
): Promise<void> {
  try {
    const [existing] = await db
      .select({ id: addresses.id })
      .from(addresses)
      .where(and(eq(addresses.userId, userId), eq(addresses.isDefault, true)))
      .limit(1);

    const values = {
      name: input.name,
      phone: input.phone,
      line1: input.line1,
      city: input.city,
      region: input.region,
      country: "LB",
      isDefault: true,
    };

    if (existing) {
      await db
        .update(addresses)
        .set(values)
        .where(eq(addresses.id, existing.id));
      return;
    }

    await db.insert(addresses).values({ userId, ...values });
  } catch (error) {
    console.error("Could not save the delivery address:", error);
  }
}
