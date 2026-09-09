import { PrismaClient, Prisma } from '@prisma/client';

/**
 * Prisma returns Decimal objects. Left alone, JSON.stringify turns them into
 * `{"s":1,"e":6,"d":[...]}`, which is useless to the UI. Serialising them as
 * strings (never as JS numbers) keeps every amount exact all the way to the
 * screen — a number would reintroduce the floating-point rounding the whole
 * money engine exists to avoid.
 */
(Prisma.Decimal.prototype as unknown as { toJSON(): string }).toJSON = function toJSON(
  this: Prisma.Decimal,
) {
  return this.toString();
};

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export { Prisma };
export type Tx = Prisma.TransactionClient;
