import { prisma, Prisma, type Tx } from './db.js';
import { AppError } from './errors.js';

/** Validate, mutate and audit against one serializable database snapshot.
 * Retry a rolled-back conflict, never a partially committed operation.
 * Keep external side effects (HTTP, mail, files) outside these callbacks.
 */
export async function atomic<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10000,
        timeout: 20000,
      });
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2034') throw error;
      if (attempt >= 3) throw new AppError('Another change was made at the same time. Please try again.', 409);
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
}
