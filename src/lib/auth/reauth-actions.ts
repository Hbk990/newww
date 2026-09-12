"use server";

import { eq } from "drizzle-orm";
import type { Route } from "next";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { users } from "@/db/schema";

import { requireVerified } from "./guards";
import { verifyPassword } from "./password";
import { markReauthenticated } from "./session";
import { isThrottled, recordAttempt } from "./throttle";

import { safeNext } from "./reauth";

export type ConfirmResult = { ok: false; error: string };

/**
 * Re-enters the password for this session, unlocking the sensitive screens for
 * a short window.
 *
 * Throttled on the same budget as signing in and under the same identifier. A
 * confirmation prompt without rate limiting is a password oracle, and a worse
 * one than the login form: it already knows whose account it is, so an attacker
 * at a borrowed unlocked browser only has to guess the password.
 *
 * Returns on failure and redirects on success, so there is no success branch
 * for a caller to forget to act on.
 */
export async function confirmPassword(
  password: string,
  next?: string,
): Promise<ConfirmResult> {
  // requireVerified, not requirePermission: gating this screen on a
  // reauth-required permission would send it to itself, forever.
  const user = await requireVerified();

  if (await isThrottled("password", user.email, null)) {
    return {
      ok: false,
      error: "Too many attempts. Wait a few minutes and try again.",
    };
  }

  const [row] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, user.id));

  /*
   * A Google-only account never set a password, so this form can never succeed
   * for it. Saying so plainly beats letting someone type into a field that
   * cannot work — the fix is to set a password, not to keep guessing.
   *
   * Not counted against the throttle: there is nothing to guess.
   */
  if (!row?.passwordHash) {
    return {
      ok: false,
      error:
        "This account signs in with Google and has no password. Set one under Account first.",
    };
  }

  const ok = await verifyPassword(row.passwordHash, password);
  await recordAttempt("password", user.email, null, ok);

  if (!ok) return { ok: false, error: "That password is not right." };

  await markReauthenticated(user.sessionId);
  redirect(safeNext(next) as Route);
}
