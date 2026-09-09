import type { FastifyInstance } from 'fastify';
import {
  LedgerKind,
  OverheadCategory,
  PartyType,
  TransactionType,
} from '@prisma/client';
import { z } from 'zod';
import { prisma, Prisma, type Tx } from '../lib/db.js';
import { audit } from '../lib/audit.js';
import { AppError, notFound } from '../lib/errors.js';
import { usdCreditedForCfa, wireCfaCost } from '../lib/money.js';
import { balancesByParty, post, type PostableEntry } from '../services/ledger.js';

const money = z.coerce.number().positive('The amount must be more than zero');
const fee = z.coerce.number().nonnegative().optional().default(0);

/**
 * TREASURY.
 *
 * Money transfer companies are the bank of this business: CFA goes in, CFA and
 * USD wires go out, and the balance is allowed to go negative when more has
 * been wired out than was deposited — which is exactly how these accounts work
 * in practice.
 *
 * Physical cash is modelled as a transfer company named "Cash box", so that
 * every franc that moves has an account it came from. Nothing here is treated
 * as an expense: a deposit only moves money between your own pockets. Cost
 * reaches the profit report when a CAR IS SOLD, never when money is moved.
 */
export async function treasuryRoutes(app: FastifyInstance) {
  app.get('/api/treasury/overview', async () => {
    const parties = await prisma.party.findMany({
      where: { active: true, type: { in: [PartyType.TRANSFER_COMPANY] } },
      orderBy: { name: 'asc' },
    });
    const balances = await balancesByParty();

    const accounts = parties.map((p) => ({
      ...p,
      balance: balances.get(p.id) ?? new Prisma.Decimal(0),
    }));
    const total = accounts.reduce(
      (acc, a) => acc.plus(a.balance),
      new Prisma.Decimal(0),
    );

    return {
      accounts,
      totalAvailableCfa: total,
      note: 'A negative balance means you have wired out more than you deposited with that company.',
    };
  });

  app.get('/api/treasury/transactions', async (request) => {
    const { from, to, type } = z
      .object({
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        type: z.nativeEnum(TransactionType).optional(),
      })
      .parse(request.query);

    return prisma.transaction.findMany({
      where: {
        ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
        ...(type ? { type } : {}),
      },
      include: {
        transferCompany: { select: { id: true, name: true } },
        counterparty: { select: { id: true, name: true, type: true, currency: true } },
      },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: 500,
    });
  });

  /** Money in: I hand CFA to a transfer company. This is NOT an expense. */
  app.post('/api/treasury/deposit', async (request) => {
    const input = z
      .object({
        transferCompanyId: z.coerce.number(),
        amountCfa: money,
        date: z.coerce.date(),
        note: z.string().optional().nullable(),
      })
      .parse(request.body);

    const company = await requireTransferCompany(input.transferCompanyId);

    const transaction = await prisma.$transaction(async (tx) => {
      const created = await tx.transaction.create({
        data: {
          type: TransactionType.DEPOSIT,
          date: input.date,
          transferCompanyId: company.id,
          amountCfa: new Prisma.Decimal(input.amountCfa),
          note: input.note || null,
          createdBy: request.user?.id ?? null,
        },
      });
      await post(
        tx,
        [
          {
            partyId: company.id,
            date: input.date,
            kind: LedgerKind.DEPOSIT,
            amount: new Prisma.Decimal(input.amountCfa),
            description: `Deposit${input.note ? ` — ${input.note}` : ''}`,
            transactionId: created.id,
          },
        ],
        request.user?.id,
      );
      return created;
    });

    await auditTx(request, transaction);
    return transaction;
  });

  app.post('/api/treasury/withdrawal', async (request) => {
    const input = z
      .object({
        transferCompanyId: z.coerce.number(),
        amountCfa: money,
        date: z.coerce.date(),
        note: z.string().optional().nullable(),
      })
      .parse(request.body);

    const company = await requireTransferCompany(input.transferCompanyId);

    const transaction = await prisma.$transaction(async (tx) => {
      const created = await tx.transaction.create({
        data: {
          type: TransactionType.WITHDRAWAL,
          date: input.date,
          transferCompanyId: company.id,
          amountCfa: new Prisma.Decimal(input.amountCfa),
          note: input.note || null,
          createdBy: request.user?.id ?? null,
        },
      });
      await post(
        tx,
        [
          {
            partyId: company.id,
            date: input.date,
            kind: LedgerKind.PAYMENT,
            amount: new Prisma.Decimal(input.amountCfa).negated(),
            description: `Cash taken back${input.note ? ` — ${input.note}` : ''}`,
            transactionId: created.id,
          },
        ],
        request.user?.id,
      );
      return created;
    });

    await auditTx(request, transaction);
    return transaction;
  });

  /**
   * A wire to a car supplier. CFA leaves the transfer company; the supplier is
   * credited in USD at the rate agreed for this wire. The commission is a real
   * expense and leaves the treasury separately — folding it into the USD amount
   * would silently overstate what the supplier received.
   */
  app.post('/api/treasury/wire', async (request) => {
    const input = z
      .object({
        transferCompanyId: z.coerce.number(),
        supplierId: z.coerce.number(),
        amountUsd: money,
        rate: z.coerce.number().positive('Enter the CFA rate used for this wire'),
        feeCfa: fee,
        date: z.coerce.date(),
        note: z.string().optional().nullable(),
      })
      .parse(request.body);

    const company = await requireTransferCompany(input.transferCompanyId);
    const supplier = await prisma.party.findUnique({ where: { id: input.supplierId } });
    if (!supplier || supplier.type !== PartyType.CAR_SUPPLIER) throw notFound('Supplier not found');

    const wire = wireCfaCost(input.amountUsd, input.rate, input.feeCfa);

    const transaction = await prisma.$transaction(async (tx) => {
      const created = await tx.transaction.create({
        data: {
          type: TransactionType.WIRE_TO_SUPPLIER,
          date: input.date,
          transferCompanyId: company.id,
          counterpartyId: supplier.id,
          amountCfa: new Prisma.Decimal(wire.principalCfa.toString()),
          amountUsd: new Prisma.Decimal(wire.amountUsd.toString()),
          rate: new Prisma.Decimal(wire.rate.toString()),
          feeCfa: new Prisma.Decimal(wire.feeCfa.toString()),
          note: input.note || null,
          createdBy: request.user?.id ?? null,
        },
      });

      const entries: PostableEntry[] = [
        {
          partyId: company.id,
          date: input.date,
          kind: LedgerKind.WIRE_OUT,
          amount: new Prisma.Decimal(wire.principalCfa.negated().toString()),
          description: `Wire of $${wire.amountUsd} to ${supplier.name} at ${wire.rate}`,
          transactionId: created.id,
        },
        {
          partyId: supplier.id,
          date: input.date,
          kind: LedgerKind.PAYMENT,
          amount: new Prisma.Decimal(wire.amountUsd.negated().toString()),
          description: `Payment received by wire${input.note ? ` — ${input.note}` : ''}`,
          transactionId: created.id,
        },
      ];
      if (wire.feeCfa.gt(0)) {
        entries.push({
          partyId: company.id,
          date: input.date,
          kind: LedgerKind.FEE,
          amount: new Prisma.Decimal(wire.feeCfa.negated().toString()),
          description: 'Transfer commission',
          transactionId: created.id,
        });
      }
      await post(tx, entries, request.user?.id);
      return created;
    });

    await auditTx(request, transaction);
    return { transaction, breakdown: wire };
  });

  /**
   * Paying the shipping company. His account is in USD, but he can be paid in
   * USD (through a transfer company) or in CFA locally — in which case today's
   * rate converts what I paid into the USD it settles.
   */
  app.post('/api/treasury/pay-shipping', async (request) => {
    const input = z
      .object({
        shippingCompanyId: z.coerce.number(),
        transferCompanyId: z.coerce.number(),
        payCurrency: z.enum(['USD', 'CFA']),
        amount: money,
        rate: z.coerce.number().positive('Enter the CFA rate used for this payment'),
        feeCfa: fee,
        date: z.coerce.date(),
        note: z.string().optional().nullable(),
      })
      .parse(request.body);

    const company = await requireTransferCompany(input.transferCompanyId);
    const shipper = await prisma.party.findUnique({ where: { id: input.shippingCompanyId } });
    if (!shipper || shipper.type !== PartyType.SHIPPING_COMPANY)
      throw notFound('Shipping company not found');

    // Whichever currency was handed over, both sides of the entry must agree.
    const amountUsd =
      input.payCurrency === 'USD'
        ? wireCfaCost(input.amount, input.rate, 0).amountUsd
        : usdCreditedForCfa(input.amount, input.rate);
    const principalCfa =
      input.payCurrency === 'USD'
        ? wireCfaCost(input.amount, input.rate, 0).principalCfa
        : wireCfaCost(usdCreditedForCfa(input.amount, input.rate), input.rate, 0).principalCfa;
    const feeCfa = new Prisma.Decimal(input.feeCfa);

    const transaction = await prisma.$transaction(async (tx) => {
      const created = await tx.transaction.create({
        data: {
          type: TransactionType.PAY_SHIPPING,
          date: input.date,
          transferCompanyId: company.id,
          counterpartyId: shipper.id,
          amountCfa: new Prisma.Decimal(principalCfa.toString()),
          amountUsd: new Prisma.Decimal(amountUsd.toString()),
          rate: new Prisma.Decimal(input.rate),
          feeCfa,
          note: input.note || null,
          createdBy: request.user?.id ?? null,
        },
      });

      const entries: PostableEntry[] = [
        {
          partyId: company.id,
          date: input.date,
          kind: LedgerKind.PAYMENT,
          amount: new Prisma.Decimal(principalCfa.negated().toString()),
          description: `Freight paid to ${shipper.name} ($${amountUsd} at ${input.rate})`,
          transactionId: created.id,
        },
        {
          partyId: shipper.id,
          date: input.date,
          kind: LedgerKind.PAYMENT,
          amount: new Prisma.Decimal(amountUsd.negated().toString()),
          description: `Payment received${input.note ? ` — ${input.note}` : ''}`,
          transactionId: created.id,
        },
      ];
      if (feeCfa.gt(0)) {
        entries.push({
          partyId: company.id,
          date: input.date,
          kind: LedgerKind.FEE,
          amount: feeCfa.negated(),
          description: 'Transfer commission',
          transactionId: created.id,
        });
      }
      await post(tx, entries, request.user?.id);
      return created;
    });

    await auditTx(request, transaction);
    return { transaction, amountUsd, principalCfa };
  });

  /** Paying a garage worker or a parts supplier — both in CFA. */
  app.post('/api/treasury/pay-local', async (request) => {
    const input = z
      .object({
        partyId: z.coerce.number(),
        transferCompanyId: z.coerce.number(),
        amountCfa: money,
        date: z.coerce.date(),
        note: z.string().optional().nullable(),
      })
      .parse(request.body);

    const company = await requireTransferCompany(input.transferCompanyId);
    const party = await prisma.party.findUnique({ where: { id: input.partyId } });
    if (!party) throw notFound('Account not found');
    const payable: PartyType[] = [PartyType.WORKER, PartyType.PARTS_SUPPLIER];
    if (!payable.includes(party.type))
      throw new AppError('This screen pays workers and parts suppliers');

    const type =
      party.type === PartyType.WORKER
        ? TransactionType.PAY_WORKER
        : TransactionType.PAY_PARTS_SUPPLIER;

    const transaction = await prisma.$transaction(async (tx) => {
      const created = await tx.transaction.create({
        data: {
          type,
          date: input.date,
          transferCompanyId: company.id,
          counterpartyId: party.id,
          amountCfa: new Prisma.Decimal(input.amountCfa),
          note: input.note || null,
          createdBy: request.user?.id ?? null,
        },
      });
      await post(
        tx,
        [
          {
            partyId: company.id,
            date: input.date,
            kind: LedgerKind.PAYMENT,
            amount: new Prisma.Decimal(input.amountCfa).negated(),
            description: `Paid ${party.name}`,
            transactionId: created.id,
          },
          {
            partyId: party.id,
            date: input.date,
            kind: LedgerKind.PAYMENT,
            amount: new Prisma.Decimal(input.amountCfa).negated(),
            description: `Payment received${input.note ? ` — ${input.note}` : ''}`,
            transactionId: created.id,
          },
        ],
        request.user?.id,
      );
      return created;
    });

    await auditTx(request, transaction);
    return transaction;
  });

  // -------------------------------------------------------------------------
  // Monthly overhead — deliberately kept out of every car's cost
  // -------------------------------------------------------------------------

  app.get('/api/overhead', async (request) => {
    const { from, to } = z
      .object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() })
      .parse(request.query);

    return prisma.overheadExpense.findMany({
      where: from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {},
      include: { party: { select: { id: true, name: true } } },
      orderBy: { date: 'desc' },
    });
  });

  app.post('/api/overhead', async (request) => {
    const input = z
      .object({
        category: z.nativeEnum(OverheadCategory),
        amountCfa: money,
        date: z.coerce.date(),
        note: z.string().optional().nullable(),
        /** e.g. the showroom worker whose salary this is. */
        partyId: z.coerce.number().optional().nullable(),
        /** Where the money came from, when it was actually paid out now. */
        transferCompanyId: z.coerce.number().optional().nullable(),
      })
      .parse(request.body);

    const expense = await prisma.$transaction(async (tx) => {
      const created = await tx.overheadExpense.create({
        data: {
          category: input.category,
          amountCfa: new Prisma.Decimal(input.amountCfa),
          date: input.date,
          note: input.note || null,
          partyId: input.partyId ?? null,
        },
      });

      const entries: PostableEntry[] = [];
      // A salary can be booked to the worker's account and paid separately.
      if (input.partyId) {
        entries.push({
          partyId: input.partyId,
          date: input.date,
          kind: LedgerKind.SALARY_CHARGE,
          amount: new Prisma.Decimal(input.amountCfa),
          description: `${input.category.toLowerCase()}${input.note ? ` — ${input.note}` : ''}`,
        });
      }
      if (input.transferCompanyId) {
        const company = await requireTransferCompany(input.transferCompanyId);
        const transaction = await tx.transaction.create({
          data: {
            type: TransactionType.PAY_OVERHEAD,
            date: input.date,
            transferCompanyId: company.id,
            counterpartyId: input.partyId ?? null,
            amountCfa: new Prisma.Decimal(input.amountCfa),
            note: input.note || null,
            createdBy: request.user?.id ?? null,
          },
        });
        entries.push({
          partyId: company.id,
          date: input.date,
          kind: LedgerKind.PAYMENT,
          amount: new Prisma.Decimal(input.amountCfa).negated(),
          description: `${input.category.toLowerCase()}${input.note ? ` — ${input.note}` : ''}`,
          transactionId: transaction.id,
        });
        // Paying the salary straight away also clears it off the worker.
        if (input.partyId) {
          entries.push({
            partyId: input.partyId,
            date: input.date,
            kind: LedgerKind.PAYMENT,
            amount: new Prisma.Decimal(input.amountCfa).negated(),
            description: 'Salary paid',
            transactionId: transaction.id,
          });
        }
      }
      if (entries.length > 0) await post(tx, entries, request.user?.id);
      return created;
    });

    await audit(prisma, {
      userId: request.user?.id,
      action: 'CREATE',
      entity: 'OverheadExpense',
      entityId: expense.id,
      after: expense,
      ip: request.ip,
    });
    return expense;
  });
}

// ---------------------------------------------------------------------------

async function requireTransferCompany(id: number) {
  const company = await prisma.party.findUnique({ where: { id } });
  if (!company || company.type !== PartyType.TRANSFER_COMPANY)
    throw notFound('Transfer company not found');
  return company;
}

async function auditTx(request: { user?: { id: number }; ip: string }, transaction: { id: number }) {
  await audit(prisma, {
    userId: request.user?.id,
    action: 'CREATE',
    entity: 'Transaction',
    entityId: transaction.id,
    after: transaction,
    ip: request.ip,
  });
}
