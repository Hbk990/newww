import { LedgerKind, PartyType, type Prisma as PrismaTypes } from '@prisma/client';
import { prisma, Prisma, type Tx } from '../lib/db.js';
import { AppError, notFound } from '../lib/errors.js';

/**
 * THE ONLY PLACE LEDGER ENTRIES ARE WRITTEN.
 *
 * Entries are immutable: nothing in this system updates or deletes one. A
 * mistake is corrected by posting an opposite REVERSAL line, so the history
 * always explains how a balance got where it is.
 *
 * `amount` is signed, in the party's own currency. What the sign means depends
 * on the party type — see SIGN_MEANING below. It is written this way because
 * that is how the owner actually thinks about each account: a supplier "wants
 * money from me", while a transfer company "is holding my money".
 */

export const SIGN_MEANING: Record<
  PartyType,
  { positive: string; negative: string; label: string; currency: 'USD' | 'CFA' }
> = {
  CAR_SUPPLIER: {
    positive: 'You owe him',
    negative: 'He owes you',
    label: 'Supplier balance',
    currency: 'USD',
  },
  SHIPPING_COMPANY: {
    positive: 'You owe him',
    negative: 'He owes you',
    label: 'Freight balance',
    currency: 'USD',
  },
  TRANSFER_COMPANY: {
    positive: 'He is holding your money',
    negative: 'You have overdrawn — you owe him',
    label: 'Available with him',
    currency: 'CFA',
  },
  WORKER: { positive: 'You owe him', negative: 'Paid in advance', label: 'Worker balance', currency: 'CFA' },
  PARTS_SUPPLIER: {
    positive: 'You owe him',
    negative: 'Paid in advance',
    label: 'Parts supplier balance',
    currency: 'CFA',
  },
  CUSTOMER: {
    positive: 'He owes you',
    negative: 'He has overpaid',
    label: 'Customer balance',
    currency: 'CFA',
  },
};

export interface PostableEntry {
  partyId: number;
  date: Date;
  kind: LedgerKind;
  /** Signed, in the party's currency. */
  amount: PrismaTypes.Decimal | string | number;
  description: string;
  carId?: number | null;
  shipmentId?: number | null;
  saleId?: number | null;
  transactionId?: number | null;
  reversesId?: number | null;
}

/** Writes ledger lines. Always call inside a transaction with the business row. */
export async function post(tx: Tx, entries: PostableEntry[], userId?: number | null) {
  if (entries.length === 0) return;
  await tx.ledgerEntry.createMany({
    data: entries.map((e) => ({
      partyId: e.partyId,
      date: e.date,
      kind: e.kind,
      amount: new Prisma.Decimal(e.amount as never),
      description: e.description,
      carId: e.carId ?? null,
      shipmentId: e.shipmentId ?? null,
      saleId: e.saleId ?? null,
      transactionId: e.transactionId ?? null,
      reversesId: e.reversesId ?? null,
      createdBy: userId ?? null,
    })),
  });
}

/** A balance is always the sum of the lines — it is never stored anywhere. */
export async function balanceOfParty(partyId: number): Promise<PrismaTypes.Decimal> {
  const result = await prisma.ledgerEntry.aggregate({
    where: { partyId },
    _sum: { amount: true },
  });
  return result._sum.amount ?? new Prisma.Decimal(0);
}

export async function balancesByParty(): Promise<Map<number, PrismaTypes.Decimal>> {
  const rows = await prisma.ledgerEntry.groupBy({
    by: ['partyId'],
    _sum: { amount: true },
  });
  return new Map(rows.map((r) => [r.partyId, r._sum.amount ?? new Prisma.Decimal(0)]));
}

/** A statement with a running balance, the way an account is actually read. */
export async function statement(partyId: number, from?: Date, to?: Date) {
  const party = await prisma.party.findUnique({ where: { id: partyId } });
  if (!party) throw notFound('Account not found');

  const opening = from
    ? ((
        await prisma.ledgerEntry.aggregate({
          where: { partyId, date: { lt: from } },
          _sum: { amount: true },
        })
      )._sum.amount ?? new Prisma.Decimal(0))
    : new Prisma.Decimal(0);

  const entries = await prisma.ledgerEntry.findMany({
    where: {
      partyId,
      ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    },
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
    include: { car: { select: { id: true, makeName: true, modelName: true, year: true, vin: true } } },
  });

  let running = opening;
  const lines = entries.map((e) => {
    running = running.plus(e.amount);
    return { ...e, runningBalance: running };
  });

  const meaning = SIGN_MEANING[party.type];
  return {
    party,
    meaning,
    openingBalance: opening,
    closingBalance: running,
    balanceLabel: running.isZero()
      ? 'Settled'
      : running.gt(0)
        ? meaning.positive
        : meaning.negative,
    lines,
  };
}

/**
 * Cancels a line by posting its exact opposite. The original stays visible,
 * which is the point — you can see that a correction happened.
 */
export async function reverseEntry(entryId: number, reason: string, userId?: number | null) {
  return prisma.$transaction(async (tx) => {
    const original = await tx.ledgerEntry.findUnique({ where: { id: entryId } });
    if (!original) throw notFound('Ledger entry not found');
    const already = await tx.ledgerEntry.findFirst({ where: { reversesId: entryId } });
    if (already) throw new AppError('That entry has already been reversed', 409);

    const created = await tx.ledgerEntry.create({
      data: {
        partyId: original.partyId,
        date: new Date(),
        kind: LedgerKind.REVERSAL,
        amount: original.amount.negated(),
        description: `Reversal of #${original.id}: ${reason}`,
        carId: original.carId,
        shipmentId: original.shipmentId,
        saleId: original.saleId,
        transactionId: original.transactionId,
        reversesId: original.id,
        createdBy: userId ?? null,
      },
    });
    return created;
  });
}
