import {
  CarStatus,
  LedgerKind,
  ReservationStatus,
  TransactionType,
} from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, Prisma } from '../lib/db.js';
import { atomic } from '../lib/atomic.js';
import { audit } from '../lib/audit.js';
import { AppError, notFound } from '../lib/errors.js';
import { roundCfa } from '../lib/money.js';
import { resolveReceiptAccount } from '../services/receipts.js';
import { carLabel } from '../services/cars.js';

/**
 * HOLDING A CAR WITH A DEPOSIT.
 *
 * A buyer puts money down on a car that is not ready, or while he finds the
 * rest. The cash is real and in your hands the moment he hands it over, so it
 * goes into an account straight away — but the car is not sold, so it is not
 * profit yet and must not appear as revenue.
 *
 * It ends one of three ways: the sale completes and the deposit counts towards
 * the price; the buyer walks away and you give it back; or the buyer walks away
 * and you keep it, which is income of a different kind and is reported as such.
 */
export async function reservationRoutes(app: FastifyInstance) {
  app.get('/api/reservations', async (request) => {
    const { status } = z
      .object({ status: z.nativeEnum(ReservationStatus).optional() })
      .parse(request.query);

    const reservations = await prisma.reservation.findMany({
      where: status ? { status } : {},
      include: {
        car: { select: { id: true, year: true, makeName: true, modelName: true, vin: true, askingPriceCfa: true } },
        destinationAccount: { select: { id: true, name: true } },
      },
      orderBy: [{ status: 'asc' }, { date: 'desc' }],
    });
    return reservations.map((reservation) => ({
      ...reservation,
      daysHeld: Math.floor((Date.now() - reservation.date.getTime()) / 86400000),
    }));
  });

  /** Take the deposit and hold the car. */
  app.post('/api/cars/:id/reserve', async (request) =>
    atomic(async (tx) => {
      const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
      const input = z
        .object({
          customerName: z.string().min(1, 'Who is holding it?'),
          customerMobile: z.string().optional().nullable(),
          depositCfa: z.coerce.number().positive('A deposit has to be more than zero'),
          date: z.coerce.date().optional(),
          note: z.string().optional().nullable(),
          destinationAccountId: z.coerce.number().optional().nullable(),
        })
        .parse(request.body);

      if (!roundCfa(input.depositCfa).eq(input.depositCfa))
        throw new AppError('Enter the deposit in whole CFA francs');

      const car = await tx.car.findUnique({ where: { id }, include: { sale: true } });
      if (!car) throw notFound('Car not found');
      if (car.sale) throw new AppError('This car has already been sold');
      if (car.status !== CarStatus.SHOWROOM)
        throw new AppError(
          'Only a car in the showroom can be held with a deposit. Finish its repairs first.',
        );

      const active = await tx.reservation.findFirst({
        where: { carId: id, status: ReservationStatus.ACTIVE },
      });
      if (active)
        throw new AppError(
          `${active.customerName} is already holding this car with a deposit. Cancel that first.`,
        );

      if (car.askingPriceCfa && new Prisma.Decimal(input.depositCfa).gt(car.askingPriceCfa))
        throw new AppError(
          `That deposit is more than the asking price of ${car.askingPriceCfa}. Record it as a sale instead.`,
        );

      const accountId = await resolveReceiptAccount(tx, input.destinationAccountId);
      if (accountId === null)
        throw new AppError(
          'There is nowhere to put the money. Add a transfer-company account called "Cash box" under Accounts, then choose it in Settings.',
        );

      const date = input.date ?? new Date();
      const amount = new Prisma.Decimal(input.depositCfa);

      const transaction = await tx.transaction.create({
        data: {
          type: TransactionType.RESERVATION_DEPOSIT,
          date,
          transferCompanyId: accountId,
          amountCfa: amount,
          note: `Deposit from ${input.customerName.trim()} — ${carLabel(car)}`,
          createdBy: request.user?.id ?? null,
        },
      });

      const entry = await tx.ledgerEntry.create({
        data: {
          partyId: accountId,
          date,
          kind: LedgerKind.RESERVATION_DEPOSIT,
          amount, // positive: the money is in that account now
          description: `Deposit to hold ${carLabel(car)} — ${input.customerName.trim()}`,
          carId: id,
          transactionId: transaction.id,
          createdBy: request.user?.id ?? null,
        },
      });

      const reservation = await tx.reservation.create({
        data: {
          carId: id,
          customerName: input.customerName.trim(),
          customerMobile: input.customerMobile || null,
          depositCfa: amount,
          date,
          note: input.note || null,
          destinationAccountId: accountId,
          ledgerEntryId: entry.id,
          createdBy: request.user?.id ?? null,
        },
      });

      await audit(tx, {
        userId: request.user?.id,
        action: 'RESERVE',
        entity: 'Car',
        entityId: id,
        after: reservation,
        ip: request.ip,
      });
      return reservation;
    }),
  );

  /**
   * The buyer walked away. Either the money goes back, or you keep it —
   * and keeping it is income, so it is recorded as such rather than quietly
   * left sitting in the cash box with nothing to explain it.
   */
  app.post('/api/reservations/:id/cancel', async (request) =>
    atomic(async (tx) => {
      const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
      const input = z
        .object({
          outcome: z.enum(['REFUNDED', 'FORFEITED']),
          reason: z.string().trim().min(3, 'Say what happened — it stays on the record'),
          date: z.coerce.date().optional(),
        })
        .parse(request.body);

      const reservation = await tx.reservation.findUnique({
        where: { id },
        include: { car: true },
      });
      if (!reservation) throw notFound('Reservation not found');
      if (reservation.status !== ReservationStatus.ACTIVE)
        throw new AppError(`This reservation is already ${reservation.status.toLowerCase()}`);

      const date = input.date ?? new Date();
      let refundEntryId: number | null = null;

      if (input.outcome === 'REFUNDED') {
        if (!reservation.destinationAccountId)
          throw new AppError('There is no record of which account this deposit went into');

        const transaction = await tx.transaction.create({
          data: {
            type: TransactionType.RESERVATION_REFUND,
            date,
            transferCompanyId: reservation.destinationAccountId,
            amountCfa: reservation.depositCfa,
            note: `Deposit returned to ${reservation.customerName}`,
            createdBy: request.user?.id ?? null,
          },
        });
        const entry = await tx.ledgerEntry.create({
          data: {
            partyId: reservation.destinationAccountId,
            date,
            kind: LedgerKind.RESERVATION_REFUND,
            amount: reservation.depositCfa.negated(),
            description: `Deposit returned to ${reservation.customerName} — ${input.reason}`,
            carId: reservation.carId,
            transactionId: transaction.id,
            createdBy: request.user?.id ?? null,
          },
        });
        refundEntryId = entry.id;
      }

      const updated = await tx.reservation.update({
        where: { id },
        data: {
          status: input.outcome === 'REFUNDED' ? ReservationStatus.REFUNDED : ReservationStatus.FORFEITED,
          closedAt: date,
          closedReason: input.reason,
          refundEntryId,
        },
      });

      await audit(tx, {
        userId: request.user?.id,
        action: `RESERVATION_${input.outcome}`,
        entity: 'Reservation',
        entityId: id,
        before: reservation,
        after: updated,
        ip: request.ip,
      });
      return updated;
    }),
  );
}

/** The deposit currently holding a car, if any. */
export async function activeReservation(carId: number) {
  return prisma.reservation.findFirst({
    where: { carId, status: ReservationStatus.ACTIVE },
  });
}
