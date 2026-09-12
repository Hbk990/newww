import { REAUTH_WINDOW_MINUTES } from "./permissions";
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
 * Validated rather than trusted: an unchecked `next` is an open redirect, and
 * a confirmation screen is exactly where someone would try to plant one —
 * "confirm your password, then continue to evil.example". Only paths inside
 * the admin area are allowed, so the worst a tampered value can do is send a
 * staff member to a different admin page.
 */
export function safeNext(next: string | undefined): string {
  if (!next) return "/admin";
  // "//evil.example" is protocol-relative and would leave the site.
  if (!next.startsWith("/admin") || next.startsWith("//")) return "/admin";
  if (next.includes("\\")) return "/admin";
  return next;
}
