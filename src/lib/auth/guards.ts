import { redirect } from "next/navigation";

import {
  can,
  REAUTH_REQUIRED,
  REAUTH_WINDOW_MINUTES,
  type Permission,
} from "./permissions";
import { currentUser, type SessionUser } from "./session";

/** Signed in, whatever their state. */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Signed in, email confirmed, and not owing a password change.
 *
 * An unverified account holds a session but can reach nothing except
 * verification and sign-out, so registration needs no second cookie to
 * remember who is half-way through. The same applies to a forced password
 * change: the session is valid, it just cannot go anywhere else first.
 */
export async function requireVerified(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.emailVerified) redirect("/verify");
  if (user.mustChangePassword) redirect("/account/password");
  return user;
}

/**
 * The gate every admin page uses.
 *
 * Takes a permission rather than a role, so the day three roles become
 * granular permissions nothing here changes. Redirects rather than rendering a
 * 403, so the admin area does not confirm to a signed-in customer that a path
 * exists.
 */
export async function requirePermission(
  permission: Permission,
): Promise<SessionUser> {
  const user = await requireVerified();
  if (!can(user, permission)) redirect("/");
  requireRecentAuth(user, permission);
  return user;
}

/**
 * Some operations need the password to have been entered recently, not merely
 * a valid session.
 *
 * The list is `REAUTH_REQUIRED`: exporting the customer list, changing
 * settings, managing staff, and anything touching backups. The threat is a
 * walked-away-from laptop, not a stolen password — a borrowed unlocked browser
 * already holds a valid session, and without this it could export every
 * customer or hand itself an admin account.
 *
 * Enforced inside `requirePermission` rather than at each call site, because a
 * check that must be remembered is a check that will be forgotten. Every admin
 * page and every admin action already passes through here.
 *
 * Not async and it does not re-read the session: `currentUser` has already
 * loaded `reauthenticatedAt`, so this is a comparison rather than a query.
 */
export function requireRecentAuth(
  user: SessionUser,
  permission: Permission,
): void {
  if (!REAUTH_REQUIRED.includes(permission)) return;

  const at = user.reauthenticatedAt;
  const freshEnough =
    at !== null && Date.now() - at.getTime() < REAUTH_WINDOW_MINUTES * 60_000;

  if (!freshEnough) redirect("/admin/confirm");
}

/** Any staff member. Equivalent to "can see the admin area at all". */
export async function requireStaff(): Promise<SessionUser> {
  return requirePermission("orders.view");
}
