import { redirect } from "next/navigation";

import { can, type Permission } from "./permissions";
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
  return user;
}

/** Any staff member. Equivalent to "can see the admin area at all". */
export async function requireStaff(): Promise<SessionUser> {
  return requirePermission("orders.view");
}
