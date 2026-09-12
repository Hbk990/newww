import { and, eq, isNull, lt, or } from "drizzle-orm";
import { cookies, headers } from "next/headers";

import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { env } from "@/env";

import { hashToken, newSessionToken } from "./tokens";

export const SESSION_COOKIE = "drphone_session";

/**
 * Thirty days, refreshed on use (see `currentUser`), so an active customer is
 * not signed out mid-purchase while an abandoned session still expires.
 */
const SESSION_DAYS = 30;

/** Refresh `lastSeenAt` at most this often, so a page view is not a write. */
const TOUCH_AFTER_MINUTES = 60;

/**
 * Staff and admin sessions also expire after this long without use.
 *
 * Eight hours covers a full shift without a second sign-in, and expires a
 * session left open on a shop computer overnight. Customers are deliberately
 * exempt: signing someone out mid-purchase costs a sale and protects nothing —
 * a customer session can reach that customer's own orders and nothing else.
 *
 * `TOUCH_AFTER_MINUTES` must stay well below this, or a session could be
 * declared idle while it was in fact being used — its `lastSeenAt` simply had
 * not been written yet.
 */
const STAFF_IDLE_HOURS = 8;

export type SessionUser = {
  id: string;
  email: string;
  username: string | null;
  name: string | null;
  avatarUrl: string | null;
  role: "customer" | "staff" | "admin";
  status: "active" | "suspended" | "disabled";
  emailVerified: boolean;
  mustChangePassword: boolean;
  /** Whether the password was re-entered recently enough on this device. */
  reauthenticatedAt: Date | null;
  sessionId: string;
};

export async function createSession(
  userId: string,
  meta: { ipAddress?: string | null; userAgent?: string | null } = {},
): Promise<void> {
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);

  await db.insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
    ipAddress: meta.ipAddress ?? null,
    userAgent: meta.userAgent ?? null,
    /*
     * Signing in counts as entering the password, because it is.
     *
     * Without this a user who signed in five seconds ago is asked for their
     * password again the moment they open Settings — which teaches people to
     * type it reflexively, the opposite of what the prompt is for. The window
     * runs from here, so the check is "recently", not "twice".
     */
    reauthenticatedAt: new Date(),
  });

  // Denormalized onto the user so "when was this account last used" survives
  // session pruning.
  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, userId));

  /**
   * `Secure` follows the request's protocol, not the build mode.
   *
   * Keying it to NODE_ENV means a production build served over http — a local
   * smoke test, a staging box without TLS — sets a cookie the browser then
   * refuses, and sign-in silently fails with nothing in the logs to explain it.
   *
   * The default when no proxy header is present stays `https` in production, so
   * a misconfigured proxy cannot quietly downgrade a real deployment.
   */
  const requestHeaders = await headers();
  const proto =
    requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim() ??
    (env.isProduction ? "https" : "http");

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    // Unreadable from JavaScript, so an XSS bug cannot exfiltrate the session.
    httpOnly: true,
    secure: proto === "https",
    /**
     * `lax` rather than `strict`: `strict` drops the cookie on any cross-site
     * navigation, so arriving from a Google search or a WhatsApp link would
     * show a signed-out page. `lax` still withholds it on cross-site POSTs,
     * which is the CSRF case that matters.
     */
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/**
 * Resolves the signed-in user, or null.
 *
 * One indexed lookup on the token hash. The cookie value is never trusted for
 * anything but finding the row — identity, role and verification state all come
 * from the database, so revoking a session or demoting a user takes effect on
 * the next request rather than whenever a token happens to expire.
 */
export async function currentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  // One query. Expiry and revocation come back with the row rather than in a
  // second lookup, and are evaluated here rather than in the WHERE clause so a
  // revoked session reads as "not signed in" and not as "no such session".
  const rows = await db
    .select({
      sessionId: sessions.id,
      lastSeenAt: sessions.lastSeenAt,
      expiresAt: sessions.expiresAt,
      revokedAt: sessions.revokedAt,
      id: users.id,
      email: users.email,
      username: users.username,
      name: users.name,
      avatarUrl: users.avatarUrl,
      reauthenticatedAt: sessions.reauthenticatedAt,
      role: users.role,
      status: users.status,
      emailVerifiedAt: users.emailVerifiedAt,
      mustChangePassword: users.mustChangePassword,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, hashToken(token)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (row.revokedAt || row.expiresAt <= new Date()) return null;

  /**
   * A suspended or disabled account reads as signed out, and its session is
   * revoked on the way past so it cannot be used again. Checked here rather
   * than only at sign-in, so suspending someone takes effect on their next
   * request instead of whenever their cookie happens to expire.
   */
  if (row.status !== "active") {
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, row.sessionId));
    return null;
  }

  const isStaff = row.role === "staff" || row.role === "admin";
  if (
    isStaff &&
    Date.now() - row.lastSeenAt.getTime() > STAFF_IDLE_HOURS * 3_600_000
  ) {
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, row.sessionId));
    return null;
  }

  if (Date.now() - row.lastSeenAt.getTime() > TOUCH_AFTER_MINUTES * 60_000) {
    await db
      .update(sessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(sessions.id, row.sessionId));
  }

  return {
    id: row.id,
    email: row.email,
    username: row.username,
    name: row.name,
    avatarUrl: row.avatarUrl,
    role: row.role,
    status: row.status,
    emailVerified: row.emailVerifiedAt !== null,
    mustChangePassword: row.mustChangePassword,
    reauthenticatedAt: row.reauthenticatedAt,
    sessionId: row.sessionId,
  };
}

/**
 * Records that the password was just re-entered on this session, unlocking the
 * operations in `REAUTH_REQUIRED` for a short window.
 */
export async function markReauthenticated(sessionId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ reauthenticatedAt: new Date() })
    .where(eq(sessions.id, sessionId));
}

/** Signs out this device. The cookie is cleared and the row revoked, because
 *  clearing only the cookie leaves a working token in anyone's hands. */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (token) {
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.tokenHash, hashToken(token)));
  }
  store.delete(SESSION_COOKIE);
}

/** Signs out everywhere — after a password change, or on a compromised account. */
export async function revokeAllSessions(userId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

/**
 * Deletes sessions that can no longer authenticate anyone. Revoked and expired
 * rows are only useful for a short while afterwards, and the table would
 * otherwise grow forever.
 */
export async function pruneSessions(): Promise<void> {
  const cutoff = new Date(Date.now() - 7 * 86_400_000);
  await db
    .delete(sessions)
    .where(or(lt(sessions.expiresAt, cutoff), lt(sessions.revokedAt, cutoff)));
}
