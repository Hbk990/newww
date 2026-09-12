/**
 * Address-book facts that are not server actions.
 *
 * A `"use server"` module may only export async functions — a plain `export
 * const` in one fails the build, naming the page that imported it rather than
 * the line at fault. So the constant lives here, where both the actions and
 * the form can read it.
 */

/**
 * The most addresses a customer may keep.
 *
 * Not a technical limit — a limit on a list that stops being useful when it is
 * long. Home, work, the shop, a relative's place: past about six, picking the
 * right one at checkout is slower than typing it again.
 */
export const MAX_ADDRESSES = 6;
