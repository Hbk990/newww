import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import QRCode from 'qrcode';
import { prisma } from '../lib/db.js';
import { audit } from '../lib/audit.js';
import { AppError, unauthorized } from '../lib/errors.js';
import { env } from '../lib/env.js';
import { getSettings } from '../lib/settings.js';
import {
  assertNotLockedOut,
  consumeRecoveryCode,
  createSession,
  destroyAllSessions,
  destroySession,
  generateRecoveryCodes,
  generateTotpSecret,
  hashPassword,
  registerFailedLogin,
  registerSuccessfulLogin,
  totpUri,
  validatePasswordStrength,
  verifyPassword,
  verifyTotp,
} from '../lib/auth.js';

export const SESSION_COOKIE = 'showroom_session';

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  /** Six-digit app code, or a recovery code when the phone is lost. */
  token: z.string().optional(),
});

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', {
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
    handler: async (request, reply) => {
      const { username, password, token } = loginSchema.parse(request.body);
      const ip = request.ip;

      const user = await prisma.user.findUnique({ where: { username } });
      // Same message whether the user exists or not — never confirm a username.
      const invalid = unauthorized('Incorrect username, password or code');
      if (!user) {
        await audit(prisma, { action: 'LOGIN_FAILED', entity: 'User', after: { username }, ip });
        throw invalid;
      }

      assertNotLockedOut(user);

      if (!(await verifyPassword(user.passwordHash, password))) {
        await registerFailedLogin(user.id);
        await audit(prisma, {
          userId: user.id,
          action: 'LOGIN_FAILED',
          entity: 'User',
          entityId: user.id,
          ip,
        });
        throw invalid;
      }

      if (user.totpEnabled) {
        if (!token) throw new AppError('Enter the 6-digit code from your authenticator app', 401);
        const okTotp = user.totpSecret ? verifyTotp(user.totpSecret, token) : false;
        const okRecovery = okTotp ? false : await consumeRecoveryCode(user.id, token);
        if (!okTotp && !okRecovery) {
          await registerFailedLogin(user.id);
          await audit(prisma, {
            userId: user.id,
            action: 'LOGIN_FAILED_2FA',
            entity: 'User',
            entityId: user.id,
            ip,
          });
          throw invalid;
        }
        if (okRecovery) {
          await audit(prisma, {
            userId: user.id,
            action: 'RECOVERY_CODE_USED',
            entity: 'User',
            entityId: user.id,
            ip,
          });
        }
      }

      await registerSuccessfulLogin(user.id);
      const session = await createSession(user.id, ip, request.headers['user-agent']);
      await audit(prisma, {
        userId: user.id,
        action: 'LOGIN',
        entity: 'User',
        entityId: user.id,
        ip,
      });

      reply.setCookie(SESSION_COOKIE, session.token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.isProduction,
        path: '/',
        expires: session.expiresAt,
      });

      return {
        user: { id: user.id, username: user.username, totpEnabled: user.totpEnabled },
        settings: await getSettings(),
      };
    },
  });

  app.post('/api/auth/logout', async (request, reply) => {
    await destroySession(request.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/me', async (request) => {
    if (!request.user) throw unauthorized();
    return {
      user: {
        id: request.user.id,
        username: request.user.username,
        totpEnabled: request.user.totpEnabled,
      },
      settings: await getSettings(),
    };
  });

  /** Step 1 of enabling 2FA: show the QR code. Nothing is switched on yet. */
  app.post('/api/auth/2fa/setup', async (request) => {
    if (!request.user) throw unauthorized();
    if (request.user.totpEnabled)
      throw new AppError('Two-factor authentication is already switched on');

    const secret = generateTotpSecret();
    await prisma.user.update({ where: { id: request.user.id }, data: { totpSecret: secret } });
    const settings = await getSettings();
    const uri = totpUri(request.user.username, secret, settings.businessName);
    return { secret, uri, qrDataUrl: await QRCode.toDataURL(uri) };
  });

  /** Step 2: prove the app works before locking yourself out. */
  app.post('/api/auth/2fa/enable', async (request) => {
    if (!request.user) throw unauthorized();
    const { token } = z.object({ token: z.string().min(6) }).parse(request.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: request.user.id } });
    if (!user.totpSecret) throw new AppError('Start the setup first');
    if (!verifyTotp(user.totpSecret, token))
      throw new AppError('That code is not right. Check your phone clock and try again.');

    await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: true } });
    const recoveryCodes = await generateRecoveryCodes(user.id);
    await audit(prisma, {
      userId: user.id,
      action: '2FA_ENABLED',
      entity: 'User',
      entityId: user.id,
      ip: request.ip,
    });
    return { ok: true, recoveryCodes };
  });

  app.post('/api/auth/2fa/disable', async (request) => {
    if (!request.user) throw unauthorized();
    const { password } = z.object({ password: z.string() }).parse(request.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: request.user.id } });
    if (!(await verifyPassword(user.passwordHash, password)))
      throw unauthorized('Password is not correct');

    await prisma.user.update({
      where: { id: user.id },
      data: { totpEnabled: false, totpSecret: null },
    });
    await prisma.recoveryCode.deleteMany({ where: { userId: user.id } });
    await audit(prisma, {
      userId: user.id,
      action: '2FA_DISABLED',
      entity: 'User',
      entityId: user.id,
      ip: request.ip,
    });
    return { ok: true };
  });

  app.post('/api/auth/password', async (request) => {
    if (!request.user) throw unauthorized();
    const { currentPassword, newPassword } = z
      .object({ currentPassword: z.string(), newPassword: z.string() })
      .parse(request.body);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: request.user.id } });
    if (!(await verifyPassword(user.passwordHash, currentPassword)))
      throw unauthorized('Current password is not correct');
    validatePasswordStrength(newPassword);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword) },
    });
    // Changing the password signs every device out, including a stolen one.
    await destroyAllSessions(user.id);
    await audit(prisma, {
      userId: user.id,
      action: 'PASSWORD_CHANGED',
      entity: 'User',
      entityId: user.id,
      ip: request.ip,
    });
    return { ok: true };
  });
}
