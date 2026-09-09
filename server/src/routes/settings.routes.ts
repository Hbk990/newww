import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { audit } from '../lib/audit.js';
import { getSettings, setSetting, SETTING_DEFAULTS } from '../lib/settings.js';

export async function settingsRoutes(app: FastifyInstance) {
  app.get('/api/settings', async () => getSettings());

  app.patch('/api/settings', async (request) => {
    const input = z
      .object({
        cfaCode: z.enum(['XOF', 'XAF']).optional(),
        taxThresholdUsd: z.coerce.number().nonnegative().optional(),
        businessName: z.string().min(1).optional(),
      })
      .parse(request.body);

    const before = await getSettings();
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) await setSetting(key as keyof typeof SETTING_DEFAULTS, String(value));
    }
    const after = await getSettings();

    await audit(prisma, {
      userId: request.user?.id,
      action: 'UPDATE',
      entity: 'Setting',
      before,
      after,
      ip: request.ip,
    });
    return after;
  });

  /** The audit trail — who changed what, and when. */
  app.get('/api/audit', async (request) => {
    const { entity, entityId, limit } = z
      .object({
        entity: z.string().optional(),
        entityId: z.string().optional(),
        limit: z.coerce.number().max(500).default(100),
      })
      .parse(request.query);

    return prisma.auditLog.findMany({
      where: { ...(entity ? { entity } : {}), ...(entityId ? { entityId } : {}) },
      include: { user: { select: { username: true } } },
      orderBy: { at: 'desc' },
      take: limit,
    });
  });
}
