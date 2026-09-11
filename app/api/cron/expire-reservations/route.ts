import { timingSafeEqual } from "node:crypto";

import { sql } from "drizzle-orm";

import { db } from "@/db";
import { env } from "@/env";

/**
 * Releases stock holds nobody gave back.
 *
 * A hold expires rather than being released on abandonment, because nobody
 * tells you they abandoned a cart. Without something calling this, one shopper
 * who closed a tab holds the last unit for ever and the variant reads out of
 * stock to everyone else.
 *
 * An HTTP endpoint rather than a script because the scheduler lives outside the
 * app — Vercel Cron, a systemd timer, or anything that can make a request.
 * Vercel Cron issues a GET with `Authorization: Bearer $CRON_SECRET`, which is
 * why this is a GET.
 *
 * Suggested schedule: every five minutes. The holds last 30, so nothing sits
 * expired for long, and the query touches only rows past their expiry — on a
 * quiet shop it finds nothing and returns in a millisecond.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  /*
   * No secret configured means refuse, not allow.
   *
   * Failing open here would leave an endpoint on the public internet that
   * strips the holds off every live cart, callable in a loop by anyone who
   * guesses the path. Refusing is visible in a cron log; failing open is
   * visible to nobody until two customers are sold the same unit.
   */
  if (!env.cronSecret) {
    return Response.json(
      { error: "CRON_SECRET is not configured." },
      { status: 503 },
    );
  }

  if (!authorised(request, env.cronSecret)) {
    return Response.json({ error: "Unauthorised." }, { status: 401 });
  }

  const [row] = await db.execute<{ expire_reservations: number }>(
    sql`select expire_reservations()`,
  );
  const released = row?.expire_reservations ?? 0;

  // Logged only when it did something, so the log is a record of releases
  // rather than a heartbeat nobody reads.
  if (released > 0) {
    console.log(`expire_reservations released ${released} hold(s)`);
  }

  return Response.json({ released });
}

/**
 * Compares the bearer token in constant time.
 *
 * A plain `===` on a secret leaks its length and, in principle, its leading
 * bytes through timing. Lengths are compared first because `timingSafeEqual`
 * throws on a mismatch — and the length of a secret is not what is worth
 * protecting here.
 */
function authorised(request: Request, secret: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
