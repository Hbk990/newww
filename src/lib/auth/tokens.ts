import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/**
 * Session tokens: 256 bits from the OS CSPRNG, base64url so it is
 * cookie-safe.
 *
 * Never `Math.random()` — it is seeded predictably and its output is
 * reconstructable from a handful of samples.
 */
export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * What goes in the database. The cookie carries the token; only this ever
 * reaches storage, so a leaked backup yields no usable sessions.
 *
 * SHA-256 and not Argon2: the input is already 256 bits of randomness, so
 * there is nothing to slow an attacker down about, and this runs on every
 * request.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Six digits, uniformly distributed. `randomInt` is rejection-sampled, so
 *  there is no modulo bias towards low numbers. */
export function newVerificationCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/**
 * Constant-time comparison, so the time taken cannot reveal how many leading
 * digits were right. Both sides are hex of a fixed length, so a length
 * mismatch means malformed input rather than a near miss.
 */
export function codeMatches(storedHash: string, submitted: string): boolean {
  const a = Buffer.from(storedHash, "utf8");
  const b = Buffer.from(hashCode(submitted), "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const CODE_TTL_MINUTES = 10;
export const CODE_MAX_ATTEMPTS = 5;
