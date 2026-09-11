import { hash, verify } from "@node-rs/argon2";

/**
 * Argon2id parameters.
 *
 * OWASP's current baseline: 19 MiB of memory, 2 iterations, 1 lane. The memory
 * cost is what makes GPU cracking expensive, so it is the number not to lower.
 * Raising `timeCost` on a serverless host is a false economy — it lengthens
 * every login while barely moving the attacker's cost compared to memory.
 */
const PARAMS = {
  algorithm: 2, // Argon2id: resistant to both side-channel and GPU attacks
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * Passwords are rejected on length alone, deliberately.
 *
 * Composition rules ("one capital, one symbol") push people towards
 * `Password1!` and are worse than a length floor. 10 characters is the minimum
 * worth enforcing; the 1024 ceiling exists because Argon2 will happily chew on
 * a megabyte of input and that is a denial-of-service vector.
 */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 1024;

export function checkPasswordLength(password: string): string | null {
  if (password.length < PASSWORD_MIN) {
    return `Use at least ${PASSWORD_MIN} characters.`;
  }
  if (password.length > PASSWORD_MAX) {
    return "That password is too long.";
  }
  return null;
}

export function hashPassword(password: string): Promise<string> {
  return hash(password, PARAMS);
}

/**
 * Returns false rather than throwing on a malformed or absent hash.
 *
 * Google-only accounts have no password at all, and a corrupt hash must read
 * as "wrong password", not as a 500 that tells an attacker the account exists.
 */
export async function verifyPassword(
  storedHash: string | null,
  password: string,
): Promise<boolean> {
  if (!storedHash) return false;
  try {
    return await verify(storedHash, password);
  } catch {
    return false;
  }
}
