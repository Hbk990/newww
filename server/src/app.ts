import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import multipart from '@fastify/multipart';
import { ZodError } from 'zod';
import { env } from './lib/env.js';
import { AppError } from './lib/errors.js';
import { resolveSession } from './lib/auth.js';
import { authRoutes, SESSION_COOKIE } from './routes/auth.routes.js';
import { partyRoutes } from './routes/parties.routes.js';
import { vehicleRoutes } from './routes/vehicles.routes.js';
import { carRoutes } from './routes/cars.routes.js';
import { shipmentRoutes } from './routes/shipments.routes.js';
import { garageRoutes } from './routes/garage.routes.js';
import { saleRoutes } from './routes/sales.routes.js';
import { treasuryRoutes } from './routes/treasury.routes.js';
import { reportRoutes } from './routes/reports.routes.js';
import { settingsRoutes } from './routes/settings.routes.js';
import { adjustmentRoutes } from './routes/adjustments.routes.js';
import { photoRoutes, UPLOAD_DIR } from './routes/photos.routes.js';
import { reservationRoutes } from './routes/reservations.routes.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: { id: number; username: string; totpEnabled: boolean };
  }
}

/** Endpoints reachable without signing in. Everything else requires a session. */
const PUBLIC_ROUTES = new Set(['/api/auth/login', '/api/health']);

export async function buildApp() {
  const app = Fastify({
    // Silent under test so a failing assertion is not buried in request logs.
    logger: process.env.VITEST ? false : { level: env.isProduction ? 'info' : 'debug' },
    trustProxy: true,
    bodyLimit: 2 * 1024 * 1024,
  });

  await app.register(cookie, { secret: env.sessionSecret });
  await app.register(rateLimit, { global: false, max: 300, timeWindow: '1 minute' });
  await app.register(multipart, { limits: { fileSize: 8 * 1024 * 1024, files: 1 } });

  // Uploaded photos are served from their own path, signed in only.
  await mkdir(UPLOAD_DIR, { recursive: true });
  await app.register(fastifyStatic, {
    root: UPLOAD_DIR,
    prefix: '/api/photos/file/',
    decorateReply: false,
  });

  // Resolve the session on every request, then refuse anything not public.
  app.addHook('preHandler', async (request) => {
    const session = await resolveSession(request.cookies[SESSION_COOKIE]);
    if (session) {
      request.user = {
        id: session.user.id,
        username: session.user.username,
        totpEnabled: session.user.totpEnabled,
      };
    }
    const url = request.url.split('?')[0];
    if (!url.startsWith('/api/')) return; // static files
    if (PUBLIC_ROUTES.has(url)) return;
    if (!request.user) {
      const error = new AppError('Please sign in', 401);
      throw error;
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      const first = error.errors[0];
      return reply
        .status(400)
        .send({ error: `${first.path.join('.') || 'Input'}: ${first.message}` });
    }
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({ error: error.message });
    }
    if ((error as { statusCode?: number }).statusCode === 429) {
      return reply.status(429).send({ error: 'Too many attempts. Please wait and try again.' });
    }
    // Prisma unique-constraint violation — usually a duplicate VIN.
    if ((error as { code?: string }).code === 'P2002') {
      const target = (error as unknown as { meta?: { target?: string[] | string } }).meta?.target;
      return reply
        .status(409)
        .send({ error: `That ${Array.isArray(target) ? target.join(', ') : target ?? 'value'} already exists in the system` });
    }
    request.log.error({ err: error }, 'Unhandled error');
    return reply.status(500).send({ error: 'Something went wrong. The error has been logged.' });
  });

  app.get('/api/health', async () => ({ ok: true, time: new Date().toISOString() }));

  await app.register(authRoutes);
  await app.register(partyRoutes);
  await app.register(vehicleRoutes);
  await app.register(carRoutes);
  await app.register(shipmentRoutes);
  await app.register(garageRoutes);
  await app.register(saleRoutes);
  await app.register(treasuryRoutes);
  await app.register(reportRoutes);
  await app.register(settingsRoutes);
  await app.register(adjustmentRoutes);
  await app.register(photoRoutes);
  await app.register(reservationRoutes);

  // In production the API also serves the built interface, so the whole system
  // is one process behind one certificate — no CORS, no second deployment.
  const webDist = join(dirname(fileURLToPath(import.meta.url)), '../../web/dist');
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist });
    // Any non-API path renders the app; the browser router takes it from there.
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) return reply.status(404).send({ error: 'Not found' });
      return reply.sendFile('index.html');
    });
  }

  return app;
}
