import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { userIdentities, users } from "@/db/schema";
import { verifyGoogleIdToken } from "@/lib/auth/google";
import { createSession } from "@/lib/auth/session";
import { adoptGuestCart } from "@/lib/cart/cart";
import { clientIp, isThrottled, recordAttempt } from "@/lib/auth/throttle";

/**
 * Completes a Google One Tap sign-in.
 *
 * The browser posts the ID token here; everything that decides who this is
 * happens on the server. Nothing the client sends is trusted beyond the token
 * itself, and the token is only believed after its signature, audience, issuer,
 * expiry and `email_verified` claim all check out.
 */
export async function POST(request: Request): Promise<Response> {
  /**
   * Reject cross-site posts. Signing someone into an account they do not
   * control is a real attack (login CSRF): the victim then shops, saves an
   * address and places orders inside the attacker's account.
   *
   * The session cookie is `SameSite=Lax`, which already blocks cross-site
   * POSTs from carrying a session — but this endpoint *creates* one, so it has
   * to refuse the request outright rather than rely on that.
   */
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) {
    return Response.json({ error: "Bad origin" }, { status: 403 });
  }

  const ip = clientIp(request.headers);
  if (await isThrottled("password", `google:${ip ?? "unknown"}`, ip)) {
    return Response.json({ error: "Too many attempts" }, { status: 429 });
  }

  let credential: unknown;
  try {
    ({ credential } = await request.json());
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  if (typeof credential !== "string" || credential.length === 0) {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  let identity;
  try {
    identity = await verifyGoogleIdToken(credential);
  } catch {
    await recordAttempt("password", `google:${ip ?? "unknown"}`, ip, false);
    // Deliberately vague: which check failed is useful only to an attacker.
    return Response.json({ error: "Sign-in failed" }, { status: 401 });
  }

  const userAgent = request.headers.get("user-agent");
  const userId = await resolveAccount(identity);

  await recordAttempt("password", `google:${ip ?? "unknown"}`, ip, true);
  await createSession(userId, { ipAddress: ip, userAgent });
  // The guest basket follows them in, exactly as it does on a password
  // sign-in — otherwise "Continue with Google" at checkout empties it.
  await adoptGuestCart(userId);

  return Response.json({ ok: true });
}

type Identity = Awaited<ReturnType<typeof verifyGoogleIdToken>>;

/**
 * Finds or creates the account behind a verified Google identity.
 *
 * Three cases, in order:
 *
 * 1. We have seen this Google account before — match on `sub`, which is stable
 *    across email changes and never reused.
 * 2. An account already exists with the same email. Link the two rather than
 *    creating a duplicate, so someone who registered by email can later use
 *    the Google button and land in their own account. Safe only because the
 *    token's `email_verified` was required: without that check this branch
 *    would hand an account to anyone who can claim its address in Google.
 * 3. Nobody yet — create the account. No username and no verification code:
 *    Google has proved the address, and there is no separate login identifier
 *    to choose when signing in through Google.
 */
async function resolveAccount(identity: Identity): Promise<string> {
  const linked = await db
    .select({ userId: userIdentities.userId })
    .from(userIdentities)
    .where(
      sql`${userIdentities.provider} = 'google' and ${userIdentities.providerUserId} = ${identity.sub}`,
    )
    .limit(1);

  if (linked[0]) {
    await db
      .update(userIdentities)
      .set({ lastUsedAt: new Date() })
      .where(eq(userIdentities.userId, linked[0].userId));
    return linked[0].userId;
  }

  const byEmail = await db
    .select({ id: users.id, emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(sql`lower(${users.email}) = ${identity.email}`)
    .limit(1);

  if (byEmail[0]) {
    const existing = byEmail[0];
    await db.insert(userIdentities).values({
      userId: existing.id,
      provider: "google",
      providerUserId: identity.sub,
      providerEmail: identity.email,
      lastUsedAt: new Date(),
    });

    // Someone who registered by email but never entered the code has now
    // proved the same address through Google. Nothing is gained by making them
    // do it twice.
    if (!existing.emailVerifiedAt) {
      await db
        .update(users)
        .set({ emailVerifiedAt: new Date() })
        .where(eq(users.id, existing.id));
    }
    return existing.id;
  }

  const created = await db
    .insert(users)
    .values({
      email: identity.email,
      emailVerifiedAt: new Date(),
      name: identity.name,
      avatarUrl: identity.picture,
    })
    .returning({ id: users.id });

  const userId = created[0]!.id;
  await db.insert(userIdentities).values({
    userId,
    provider: "google",
    providerUserId: identity.sub,
    providerEmail: identity.email,
    lastUsedAt: new Date(),
  });

  return userId;
}
