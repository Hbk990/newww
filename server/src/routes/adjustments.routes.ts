import { LedgerKind, PartyType } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, Prisma } from '../lib/db.js';
import { atomic } from '../lib/atomic.js';
import { audit } from '../lib/audit.js';
import { AppError, notFound } from '../lib/errors.js';
import { roundCfa } from '../lib/money.js';
import { carLabel, costBreakdown, getCarWithCosts } from '../services/cars.js';

/**
 * CORRECTING A CAR'S COST AFTER THE FACT.
 *
 * Mistakes are usually noticed after the car is sold — which is exactly when
 * the old approach of deleting the wrong line is most dangerous, because
 * deleting a 100,000 repair would quietly raise that car's reported profit by
 * 100,000 with nothing left to show why.
 *
 * So nothing is ever deleted here. The original repair, part or expense stays
 * exactly as recorded, and a correction is added beside it carrying the
 * difference and your reason. The car's cost becomes the original plus the
 * corrections, the profit updates accordingly, and both the mistake and the fix
 * remain visible for as long as the car exists.
 *
 * If the mistake also changed what you owe someone — a repair charged to the
 * wrong worker, say — naming that account posts the matching correction there
 * too, in the same transaction.
 */
export async function adjustmentRoutes(app: FastifyInstance) {
  app.get('/api/cars/:id/cost-adjustments', async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    return prisma.costAdjustment.findMany({
      where: { carId: id },
      include: { party: { select: { id: true, name: true } } },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
    });
  });

  app.post('/api/cars/:id/cost-adjustments', async (request) =>
    atomic(async (tx) => {
      const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
      const input = z
        .object({
          /** Negative removes cost from the car, positive adds it. */
          amountCfa: z.coerce.number().refine((v) => v !== 0, 'A correction of zero changes nothing'),
          reason: z
            .string()
            .trim()
            .min(5, 'Write why this correction is being made — it stays on the record'),
          date: z.coerce.date().optional(),
          /** Also correct what you owe this account, when the mistake affected it. */
          partyId: z.coerce.number().optional().nullable(),
        })
        .parse(request.body);

      if (!roundCfa(input.amountCfa).eq(input.amountCfa))
        throw new AppError('Enter the correction in whole CFA francs');

      const car = await getCarWithCosts(id, tx);
      if (car.arrivalCostCfa === null)
        throw new AppError(
          'This car has no local-currency cost yet, so there is nothing to correct. Edit the purchase itself while it is still abroad.',
        );

      const before = costBreakdown(car);
      const amount = new Prisma.Decimal(input.amountCfa);
      const date = input.date ?? new Date();

      // A correction must not drive a car's cost below zero — that would mean
      // the correction itself is wrong.
      const after = new Prisma.Decimal((before.landedCostCfa ?? 0).toString()).plus(amount);
      if (after.lt(0))
        throw new AppError(
          `That would take this car's cost to ${after.toString()}. Check the amount — a correction that removes more than the car ever cost is a mistake of its own.`,
        );

      let ledgerEntryId: number | null = null;
      if (input.partyId) {
        const party = await tx.party.findUnique({ where: { id: input.partyId } });
        if (!party) throw notFound('Account not found');
        if (party.currency === 'USD')
          throw new AppError(
            'Corrections here are in local currency. To correct a supplier or freight balance, reverse the line on their statement instead.',
          );
        if (party.type === PartyType.CUSTOMER)
          throw new AppError('A customer account is not part of a car’s cost');

        const entry = await tx.ledgerEntry.create({
          data: {
            partyId: party.id,
            date,
            kind: LedgerKind.ADJUSTMENT,
            amount, // same sign: less cost on the car means less owed to them
            description: `Correction — ${carLabel(car)}: ${input.reason}`,
            carId: id,
            createdBy: request.user?.id ?? null,
          },
        });
        ledgerEntryId = entry.id;
      }

      const adjustment = await tx.costAdjustment.create({
        data: {
          carId: id,
          amountCfa: amount,
          reason: input.reason,
          date,
          partyId: input.partyId ?? null,
          ledgerEntryId,
          createdBy: request.user?.id ?? null,
        },
      });

      await audit(tx, {
        userId: request.user?.id,
        action: 'COST_ADJUSTMENT',
        entity: 'Car',
        entityId: id,
        before: { landedCostCfa: before.landedCostCfa?.toString() ?? null },
        after: { landedCostCfa: after.toString(), reason: input.reason },
        ip: request.ip,
      });

      const updated = costBreakdown(await getCarWithCosts(id, tx));
      return { adjustment, costs: updated };
    }),
  );
}
