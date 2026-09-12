"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import type { Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { adoptGuestCart } from "@/lib/cart/cart";
import { users, verificationCodes } from "@/db/schema";
import { sendMail, verificationEmail } from "@/lib/mail";

import { checkPasswordLength, hashPassword, verifyPassword } from "./password";
import { safeShopReturn } from "./return-to";
import {
  createSession,
  currentUser,
  destroySession,
  revokeAllSessions,
} from "./session";
import { clientIp, isThrottled, recordAttempt } from "./throttle";
import {
  CODE_MAX_ATTEMPTS,
  CODE_TTL_MINUTES,
  codeMatches,
  hashCode,
  newVerificationCode,
} from "./tokens";
import { checkUsername } from "./username";

export type FormState = { error?: string; notice?: string } | null;

const GENERIC_SIGNIN_ERROR = "That email, username or password is incorrect.";
const TOO_MANY = "Too many attempts. Wait a few minutes and try again.";

function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

/** A plausible address, checked properly by the fact that a code has to arrive. */
function looksLikeEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254;
}

async function requestContext() {
  const h = await headers();
  return { ip: clientIp(h), userAgent: h.get("user-agent") };
}

/** Issues a fresh code, invalidating any outstanding one for the same purpose. */
async function issueEmailCode(userId: string, email: string): Promise<void> {
  const code = newVerificationCode();

  await db
    .update(verificationCodes)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(verificationCodes.userId, userId),
        eq(verificationCodes.purpose, "email_verify"),
        isNull(verificationCodes.consumedAt),
      ),
    );

  await db.insert(verificationCodes).values({
    userId,
    purpose: "email_verify",
    codeHash: hashCode(code),
    sentTo: email,
    expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000),
  });

  const { subject, text } = verificationEmail(code);
  await sendMail({ to: email, subject, text });
}

// ---------------------------------------------------------------- register

export async function register(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const email = normalizeEmail(form.get("email"));
  const username = String(form.get("username") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const { ip } = await requestContext();

  if (!looksLikeEmail(email)) return { error: "Enter a valid email address." };

  const usernameProblem = checkUsername(username);
  if (usernameProblem) return { error: usernameProblem };

  const passwordProblem = checkPasswordLength(password);
  if (passwordProblem) return { error: passwordProblem };

  if (await isThrottled("register", email, ip)) return { error: TOO_MANY };
  await recordAttempt("register", email, ip, false);

  // Checked before inserting so the message can say which field clashed. The
  // database still has the last word — two simultaneous registrations both pass
  // this check, and the unique indexes catch the loser below.
  const existing = await db
    .select({ email: users.email, username: users.username })
    .from(users)
    .where(
      sql`lower(${users.email}) = ${email} or lower(${users.username}) = ${username.toLowerCase()}`,
    )
    .limit(1);

  if (existing[0]) {
    return existing[0].email.toLowerCase() === email
      ? { error: "An account already uses that email address. Sign in instead." }
      : { error: "That username is taken." };
  }

  let userId: string;
  try {
    const inserted = await db
      .insert(users)
      .values({ email, username, passwordHash: await hashPassword(password) })
      .returning({ id: users.id });
    userId = inserted[0]!.id;
  } catch {
    // A unique violation here means someone registered the same email or
    // username a moment ago.
    return { error: "That email or username was just taken. Try again." };
  }

  /**
   * A failed send must not be fatal. The account row is already committed, so
   * throwing here would leave someone with an account they cannot verify and
   * cannot register again, because the address is now taken. The code row is
   * written before the send, so "resend" on the next page recovers it.
   */
  try {
    await issueEmailCode(userId, email);
  } catch (error) {
    console.error("Verification email failed to send:", error);
  }

  // A session now, gated on verification, so the verify page knows who is
  // half-way through without a second cookie.
  const { ip: ip2, userAgent } = await requestContext();
  await createSession(userId, { ipAddress: ip2, userAgent });
  // Same reason as sign-in: a guest who registers at checkout keeps the basket
  // that sent them there.
  await adoptGuestCart(userId);

  /*
   * Verification carries the destination forward in the URL, so someone who
   * registered from a basket at checkout is returned to it after entering the
   * code rather than starting again from the home page.
   */
  const back = returnTo(form);
  redirect(
    back === "/" ? "/verify" : (`/verify?next=${encodeURIComponent(back)}` as Route),
  );
}

/**
 * The path a form asked to return to, once it has been checked.
 *
 * Every one of these flows can start from somewhere that matters — a basket at
 * checkout, a product page — and dropping someone on the home page after they
 * sign in means making them find their way back to what they were doing. The
 * value is validated rather than trusted; see safeShopReturn.
 */
function returnTo(form: FormData): Route {
  const raw = form.get("next");
  return safeShopReturn(typeof raw === "string" ? raw : undefined) as Route;
}

// ---------------------------------------------------------------- verify

export async function verifyEmail(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.emailVerified) redirect("/");

  const submitted = String(form.get("code") ?? "").replace(/\D/g, "");
  const { ip } = await requestContext();

  if (await isThrottled("code", user.email, ip)) return { error: TOO_MANY };
  await recordAttempt("code", user.email, ip, false);

  const rows = await db
    .select()
    .from(verificationCodes)
    .where(
      and(
        eq(verificationCodes.userId, user.id),
        eq(verificationCodes.purpose, "email_verify"),
        isNull(verificationCodes.consumedAt),
      ),
    )
    .orderBy(sql`${verificationCodes.createdAt} desc`)
    .limit(1);

  const record = rows[0];
  if (!record) return { error: "That code has expired. Send a new one." };

  if (record.expiresAt <= new Date()) {
    return { error: "That code has expired. Send a new one." };
  }

  if (record.attempts >= CODE_MAX_ATTEMPTS) {
    return { error: "Too many wrong codes. Send a new one." };
  }

  if (!codeMatches(record.codeHash, submitted)) {
    // Counted on the row, not just by IP: the attempt limit is what actually
    // protects a six-digit code.
    await db
      .update(verificationCodes)
      .set({ attempts: record.attempts + 1 })
      .where(eq(verificationCodes.id, record.id));

    const left = CODE_MAX_ATTEMPTS - (record.attempts + 1);
    return {
      error:
        left > 0
          ? `That code is not right. ${left} ${left === 1 ? "try" : "tries"} left.`
          : "Too many wrong codes. Send a new one.",
    };
  }

  await db
    .update(verificationCodes)
    .set({ consumedAt: new Date() })
    .where(eq(verificationCodes.id, record.id));

  await db
    .update(users)
    .set({ emailVerifiedAt: new Date() })
    .where(eq(users.id, user.id));

  await recordAttempt("code", user.email, ip, true);
  redirect(returnTo(form));
}

export async function resendCode(): Promise<FormState> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.emailVerified) redirect("/");

  const { ip } = await requestContext();
  if (await isThrottled("resend", user.email, ip)) {
    return { error: "You've asked for several codes. Wait a while." };
  }
  await recordAttempt("resend", user.email, ip, true);

  await issueEmailCode(user.id, user.email);
  return { notice: `A new code is on its way to ${user.email}.` };
}

// ---------------------------------------------------------------- sign in

export async function signIn(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const identifier = String(form.get("identifier") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const { ip, userAgent } = await requestContext();

  if (!identifier || !password) return { error: GENERIC_SIGNIN_ERROR };
  if (await isThrottled("password", identifier, ip)) return { error: TOO_MANY };
  await recordAttempt("password", identifier, ip, false);

  const lowered = identifier.toLowerCase();
  const rows = await db
    .select({
      id: users.id,
      passwordHash: users.passwordHash,
      status: users.status,
    })
    .from(users)
    .where(
      sql`lower(${users.email}) = ${lowered} or lower(${users.username}) = ${lowered}`,
    )
    .limit(1);

  const row = rows[0];

  /**
   * Verify against a dummy hash when no account matched, so a missing account
   * and a wrong password take the same time. Returning early would make the
   * response time a way to enumerate which emails are registered.
   */
  const ok = await verifyPassword(
    row?.passwordHash ?? DUMMY_HASH,
    password,
  );

  if (!row || !ok) return { error: GENERIC_SIGNIN_ERROR };

  /**
   * Checked after the password, and reported as the same generic error.
   *
   * Saying "this account is suspended" to someone who guessed the password
   * confirms both that the account exists and that they guessed right.
   */
  if (row.status !== "active") return { error: GENERIC_SIGNIN_ERROR };

  await recordAttempt("password", identifier, ip, true);
  await createSession(row.id, { ipAddress: ip, userAgent });
  /*
   * The basket they built as a guest becomes theirs.
   *
   * Signing in at checkout and finding an empty basket is the moment a shopper
   * is least forgiving, and it is exactly the moment the account requirement
   * creates. Called at every point a session is created, rather than inside
   * createSession: cart.ts reads the session, so the dependency has to run this
   * way round.
   */
  await adoptGuestCart(row.id);
  redirect(returnTo(form));
}

/**
 * A real Argon2id hash of a random string, so the comparison above does the
 * same work whether or not the account exists. The password it encodes is not
 * known to anyone.
 */
const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$8Q3rH0/ELUuU3hHXVdqZ2kZyLdE0lwNpH2L/K3SkQ0M";

export async function signOut(): Promise<void> {
  await destroySession();
  redirect("/login");
}

// ---------------------------------------------------------------- password

/**
 * Change the password while signed in.
 *
 * Requires the current password even though the session is already valid: a
 * borrowed unlocked laptop should not be able to lock the owner out of their
 * own account. Every other session is revoked afterwards, because a password
 * change that leaves old sessions alive protects nothing.
 */
export async function changePassword(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const user = await currentUser();
  if (!user) redirect("/login");

  const current = String(form.get("current") ?? "");
  const next = String(form.get("password") ?? "");
  const { ip, userAgent } = await requestContext();

  const problem = checkPasswordLength(next);
  if (problem) return { error: problem };
  if (next === current) return { error: "That is your current password." };

  if (await isThrottled("password", user.email, ip)) return { error: TOO_MANY };

  const rows = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  /**
   * A Google-only account has no password to confirm. Setting one is a
   * different operation — it needs the email re-verified, not a current
   * password — so it is refused here rather than quietly allowed.
   */
  const hash = rows[0]?.passwordHash ?? null;
  if (!hash) {
    return {
      error:
        "This account signs in with Google and has no password. " +
        "Use Forgot password to set one.",
    };
  }

  if (!(await verifyPassword(hash, current))) {
    await recordAttempt("password", user.email, ip, false);
    return { error: "Your current password is not right." };
  }

  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(next),
      mustChangePassword: false,
    })
    .where(eq(users.id, user.id));

  await revokeAllSessions(user.id);
  // Revoking everything logged this device out too, so issue a fresh session
  // rather than bouncing someone who just proved who they are.
  await createSession(user.id, { ipAddress: ip, userAgent });

  redirect("/");
}

/**
 * Start a password reset.
 *
 * Always reports success, whether or not the address has an account. Saying
 * "no account with that email" turns this form into a way to discover who is
 * registered.
 */
export async function requestPasswordReset(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const email = normalizeEmail(form.get("email"));
  const { ip } = await requestContext();
  const reassurance = {
    notice: `If ${email} has an account, a reset code is on its way.`,
  };

  if (!looksLikeEmail(email)) return { error: "Enter a valid email address." };
  if (await isThrottled("resend", email, ip)) return { error: TOO_MANY };
  await recordAttempt("resend", email, ip, true);

  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);

  const found = rows[0];
  if (!found) return reassurance;

  const code = newVerificationCode();
  await db
    .update(verificationCodes)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(verificationCodes.userId, found.id),
        eq(verificationCodes.purpose, "password_reset"),
        isNull(verificationCodes.consumedAt),
      ),
    );
  await db.insert(verificationCodes).values({
    userId: found.id,
    purpose: "password_reset",
    codeHash: hashCode(code),
    sentTo: email,
    expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000),
  });

  try {
    await sendMail({
      to: email,
      subject: `${code} is your DRPHONE password reset code`,
      text: [
        `Your password reset code is ${code}`,
        "",
        "It expires in 10 minutes. If you didn't ask to reset your password,",
        "ignore this email — nothing has been changed.",
      ].join("\n"),
    });
  } catch (error) {
    console.error("Password reset email failed to send:", error);
  }

  return reassurance;
}

/**
 * Finish a password reset: email, code and new password together.
 *
 * All three in one form so no half-authenticated state has to be carried in a
 * cookie between steps. The person has the email open; asking for the address
 * again costs them nothing.
 */
export async function resetPassword(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const email = normalizeEmail(form.get("email"));
  const submitted = String(form.get("code") ?? "").replace(/\D/g, "");
  const next = String(form.get("password") ?? "");
  const { ip, userAgent } = await requestContext();

  const problem = checkPasswordLength(next);
  if (problem) return { error: problem };

  if (await isThrottled("code", email, ip)) return { error: TOO_MANY };
  await recordAttempt("code", email, ip, false);

  const rows = await db
    .select({
      codeId: verificationCodes.id,
      codeHash: verificationCodes.codeHash,
      attempts: verificationCodes.attempts,
      expiresAt: verificationCodes.expiresAt,
      userId: users.id,
      status: users.status,
    })
    .from(verificationCodes)
    .innerJoin(users, eq(users.id, verificationCodes.userId))
    .where(
      and(
        sql`lower(${users.email}) = ${email}`,
        eq(verificationCodes.purpose, "password_reset"),
        isNull(verificationCodes.consumedAt),
      ),
    )
    .orderBy(sql`${verificationCodes.createdAt} desc`)
    .limit(1);

  const record = rows[0];
  // One message for a wrong code, an expired code and an address with no
  // outstanding reset: the difference is only useful to someone guessing.
  const badCode = { error: "That code is not right, or it has expired." };
  if (!record) return badCode;
  if (record.expiresAt <= new Date()) return badCode;
  if (record.attempts >= CODE_MAX_ATTEMPTS) {
    return { error: "Too many wrong codes. Start again." };
  }

  if (!codeMatches(record.codeHash, submitted)) {
    await db
      .update(verificationCodes)
      .set({ attempts: record.attempts + 1 })
      .where(eq(verificationCodes.id, record.codeId));
    return badCode;
  }

  if (record.status !== "active") return badCode;

  await db
    .update(verificationCodes)
    .set({ consumedAt: new Date() })
    .where(eq(verificationCodes.id, record.codeId));

  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(next),
      mustChangePassword: false,
      // Proving control of the address doubles as verifying it.
      emailVerifiedAt: new Date(),
    })
    .where(eq(users.id, record.userId));

  // Whoever else was signed in loses their session — the point of a reset.
  await revokeAllSessions(record.userId);
  await recordAttempt("code", email, ip, true);
  await createSession(record.userId, { ipAddress: ip, userAgent });

  redirect("/");
}
