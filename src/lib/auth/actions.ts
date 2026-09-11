"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { users, verificationCodes } from "@/db/schema";
import { sendMail, verificationEmail } from "@/lib/mail";

import { checkPasswordLength, hashPassword, verifyPassword } from "./password";
import { createSession, currentUser, destroySession } from "./session";
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

  redirect("/verify");
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
  redirect("/");
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
    .select({ id: users.id, passwordHash: users.passwordHash })
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

  await recordAttempt("password", identifier, ip, true);
  await createSession(row.id, { ipAddress: ip, userAgent });
  redirect("/");
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
