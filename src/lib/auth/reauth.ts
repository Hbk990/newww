import { REAUTH_WINDOW_MINUTES } from "./permissions";
import { safeReturnTo } from "./return-to";
import type { SessionUser } from "./session";

/**
 * Whether this session's password was entered recently enough for the
 * operations in `REAUTH_REQUIRED`.
 *
 * Exported separately from the guard so a page can ask *before* offering a
 * form, rather than letting someone fill one in and bounce on save. The guard
 * is still the thing that enforces it — this only lets a screen be polite
 * about it.
 */
export function isRecentlyAuthenticated(
  user: Pick<SessionUser, "reauthenticatedAt">,
): boolean {
  const at = user.reauthenticatedAt;
  if (at === null) return false;
  return Date.now() - at.getTime() < REAUTH_WINDOW_MINUTES * 60_000;
}

/**
 * Where to send someone after they confirm.
 *
 * Delegates to `safeReturnTo`, which holds the rules and the tests for them —
 * this only names the admin area as the allowed prefix and the fallback. An
 * unchecked `next` is an open redirect, and a confirmation screen is exactly
 * where someone would try to plant one.
 */
export function safeNext(next: string | undefined): string {
  return safeReturnTo(next, { fallback: "/admin", allow: ["/admin"] });
}
