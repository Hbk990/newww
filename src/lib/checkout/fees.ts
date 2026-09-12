/**
 * The delivery fee, provisionally.
 *
 * **This is a placeholder and it is wrong on purpose.** A flat $3 is charged to
 * Beirut and to the Bekaa alike, which is not what the shop will want.
 *
 * Two things are meant to replace it, both still unbuilt:
 *
 *   `shipping_zones` and `shipping_rates` — the tables exist and no code reads
 *   them. That is step 3 of the remaining backend work, and it is on the
 *   critical path precisely because of this constant. A staff member taking an
 *   order by phone types the fee, which is right for a phone call; a web
 *   customer cannot type their own.
 *
 *   `store_settings` — where the free-delivery threshold belongs. The table has
 *   no row yet.
 *
 * It lives in its own module rather than inside the checkout action because a
 * `"use server"` file may only export async functions: exporting this constant
 * from there fails the build with "Failed to collect configuration", naming the
 * importing page rather than the offending export.
 */
export const PROVISIONAL_DELIVERY_FEE_CENTS = 300;
