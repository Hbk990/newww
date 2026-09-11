import { redirect } from "next/navigation";

import { currentUser, type SessionUser } from "./session";

/** Signed in, whatever their state. */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Signed in with a confirmed email address.
 *
 * An unverified account holds a session but can reach nothing except
 * verification and sign-out, so registration does not need a second
 * "pending verification" cookie to remember who is half-way through.
 */
export async function requireVerified(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.emailVerified) redirect("/verify");
  return user;
}

/**
 * Staff or admin.
 *
 * Redirects rather than rendering a 403, so the admin area does not confirm to
 * a signed-in customer that a given path exists.
 */
export async function requireStaff(): Promise<SessionUser> {
  const user = await requireVerified();
  if (user.role !== "staff" && user.role !== "admin") redirect("/");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireVerified();
  if (user.role !== "admin") redirect("/");
  return user;
}
