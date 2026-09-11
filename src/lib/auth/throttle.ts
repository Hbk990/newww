import { and, count, eq, gt } from "drizzle-orm";

import { db } from "@/db";
import { authAttempts } from "@/db/schema";

/**
 * Attempt limits, per window.
 *
 * The identifier limit protects one account from many password guesses. The IP
 * limit protects every account from one password tried against many — password
 * spraying, which an account-only limit never sees because each account gets
 * just one or two attempts.
 *
 * The IP allowance is deliberately much larger: households, offices and mobile
 * carriers put many legitimate people behind one address, and a tight IP limit
 * locks out a whole building.
 */
const LIMITS = {
  password: { perIdentifier: 8, perIp: 40, windowMinutes: 15 },
  code: { perIdentifier: 10, perIp: 50, windowMinutes: 15 },
  resend: { perIdentifier: 4, perIp: 20, windowMinutes: 60 },
  register: { perIdentifier: 5, perIp: 15, windowMinutes: 60 },
} as const;

export type AttemptKind = keyof typeof LIMITS;

export async function recordAttempt(
  kind: AttemptKind,
  identifier: string,
  ipAddress: string | null,
  succeeded: boolean,
): Promise<void> {
  await db.insert(authAttempts).values({
    kind,
    identifier: identifier.toLowerCase(),
    ipAddress,
    succeeded,
  });
}

/**
 * True when this attempt should be refused.
 *
 * Counts every attempt, successful or not. Counting only failures lets an
 * attacker who knows one valid password reset their own budget at will.
 */
export async function isThrottled(
  kind: AttemptKind,
  identifier: string,
  ipAddress: string | null,
): Promise<boolean> {
  const limit = LIMITS[kind];
  const since = new Date(Date.now() - limit.windowMinutes * 60_000);

  const [byIdentifier] = await db
    .select({ n: count() })
    .from(authAttempts)
    .where(
      and(
        eq(authAttempts.kind, kind),
        eq(authAttempts.identifier, identifier.toLowerCase()),
        gt(authAttempts.createdAt, since),
      ),
    );

  if ((byIdentifier?.n ?? 0) >= limit.perIdentifier) return true;

  // A missing IP must not become a free pass, so skip only the IP check.
  if (!ipAddress) return false;

  const [byIp] = await db
    .select({ n: count() })
    .from(authAttempts)
    .where(
      and(
        eq(authAttempts.kind, kind),
        eq(authAttempts.ipAddress, ipAddress),
        gt(authAttempts.createdAt, since),
      ),
    );

  return (byIp?.n ?? 0) >= limit.perIp;
}

/**
 * The client's address, from the proxy headers a hosted deploy sets.
 *
 * Only trustworthy because a managed platform overwrites these on the way in.
 * Behind your own reverse proxy, make sure it does the same — an
 * `x-forwarded-for` a client can set is a rate limit a client can bypass.
 */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip") ?? null;
}
