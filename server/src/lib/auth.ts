import crypto from 'node:crypto';
import argon2 from 'argon2';
import { authenticator } from 'otplib';
import { prisma } from './db.js';
import { AppError, unauthorized } from './errors.js';

const SESSION_DAYS = 7;
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;

// Argon2id with deliberately heavy settings — this database holds supplier
// balances and cash positions, and there is only ever one account to attack.
const ARGON_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
} as const;

export const hashPassword = (password: string) => argon2.hash(password, ARGON_OPTIONS);

export const verifyPassword = (hash: string, password: string) =>
  argon2.verify(hash, password).catch(() => false);

/** Session tokens are stored hashed, so a database leak cannot be replayed. */
const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

export function validatePasswordStrength(password: string): void {
  if (password.length < 12) throw new AppError('Password must be at least 12 characters');
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password))
    throw new AppError('Password must contain both lower and upper case letters');
  if (!/[0-9]/.test(password)) throw new AppError('Password must contain a number');
  if (!/[^A-Za-z0-9]/.test(password)) throw new AppError('Password must contain a symbol');
}

export async function createSession(userId: number, ip?: string, userAgent?: string) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: { id: hashToken(token), userId, expiresAt, ip, userAgent },
  });
  return { token, expiresAt };
}

export async function resolveSession(token: string | undefined) {
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { id: hashToken(token) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  return session;
}

export async function destroySession(token: string | undefined) {
  if (!token) return;
  await prisma.session.delete({ where: { id: hashToken(token) } }).catch(() => undefined);
}

export async function destroyAllSessions(userId: number) {
  await prisma.session.deleteMany({ where: { userId } });
}

// ---------------------------------------------------------------------------
// Lockout — slows down anyone guessing at the password
// ---------------------------------------------------------------------------

export function assertNotLockedOut(user: { lockedUntil: Date | null }) {
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    throw new AppError(`Too many failed attempts. Try again in ${minutes} minute(s).`, 429);
  }
}

export async function registerFailedLogin(userId: number) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { failedLogins: { increment: 1 } },
  });
  if (user.failedLogins >= MAX_FAILED_LOGINS) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        failedLogins: 0,
        lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000),
      },
    });
  }
}

export async function registerSuccessfulLogin(userId: number) {
  await prisma.user.update({
    where: { id: userId },
    data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
}

// ---------------------------------------------------------------------------
// Two-factor authentication
// ---------------------------------------------------------------------------

authenticator.options = { window: 1 }; // tolerate one step of clock drift

export const generateTotpSecret = () => authenticator.generateSecret();

export const totpUri = (username: string, secret: string, issuer: string) =>
  authenticator.keyuri(username, issuer, secret);

export function verifyTotp(secret: string, token: string): boolean {
  try {
    return authenticator.verify({ token: token.replace(/\s/g, ''), secret });
  } catch {
    return false;
  }
}

/** Ten single-use codes, shown once at setup and stored only as hashes. */
export async function generateRecoveryCodes(userId: number): Promise<string[]> {
  await prisma.recoveryCode.deleteMany({ where: { userId } });
  const codes = Array.from({ length: 10 }, () =>
    crypto.randomBytes(5).toString('hex').toUpperCase().match(/.{1,5}/g)!.join('-'),
  );
  await prisma.recoveryCode.createMany({
    data: await Promise.all(
      codes.map(async (code) => ({ userId, codeHash: await argon2.hash(code, ARGON_OPTIONS) })),
    ),
  });
  return codes;
}

/** Consumes a recovery code. Each one works exactly once. */
export async function consumeRecoveryCode(userId: number, code: string): Promise<boolean> {
  const candidates = await prisma.recoveryCode.findMany({ where: { userId, usedAt: null } });
  for (const candidate of candidates) {
    if (await argon2.verify(candidate.codeHash, code.trim().toUpperCase()).catch(() => false)) {
      await prisma.recoveryCode.update({
        where: { id: candidate.id },
        data: { usedAt: new Date() },
      });
      return true;
    }
  }
  return false;
}

export { unauthorized };
