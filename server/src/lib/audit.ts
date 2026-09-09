import { prisma, type Tx } from './db.js';

/**
 * Every write is recorded: what changed, from what, to what, by whom, when.
 * With real money in the system, "I don't know who changed that price" is not
 * an acceptable answer.
 */
export async function audit(
  client: Tx | typeof prisma,
  entry: {
    userId?: number | null;
    action: string;
    entity: string;
    entityId?: string | number | null;
    before?: unknown;
    after?: unknown;
    ip?: string | null;
  },
) {
  await client.auditLog.create({
    data: {
      userId: entry.userId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId == null ? null : String(entry.entityId),
      before: entry.before === undefined ? null : JSON.stringify(entry.before),
      after: entry.after === undefined ? null : JSON.stringify(entry.after),
      ip: entry.ip ?? null,
    },
  });
}
