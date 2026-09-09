import type { FastifyInstance } from 'fastify';
import { PartyType, Country, WholesalerType, WorkerRole } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { audit } from '../lib/audit.js';
import { AppError, notFound } from '../lib/errors.js';
import { cfaCode } from '../lib/settings.js';
import { SIGN_MEANING, balancesByParty, balanceOfParty, statement, reverseEntry } from '../services/ledger.js';

/** USD accounts are the ones abroad; everything at destination is in CFA. */
const USD_TYPES: PartyType[] = [PartyType.CAR_SUPPLIER, PartyType.SHIPPING_COMPANY];

export const currencyForType = async (type: PartyType) =>
  USD_TYPES.includes(type) ? 'USD' : await cfaCode();

const partyInput = z.object({
  type: z.nativeEnum(PartyType),
  name: z.string().min(1, 'Name is required'),
  companyName: z.string().optional().nullable(),
  mobile: z.string().optional().nullable(),
  country: z.nativeEnum(Country).optional().nullable(),
  wholesaler: z.nativeEnum(WholesalerType).optional().nullable(),
  workerRole: z.nativeEnum(WorkerRole).optional().nullable(),
  note: z.string().optional().nullable(),
});

/**
 * Country is not optional for a car supplier: it decides whether the Canada
 * tax rule applies at all, so the system refuses to save one without it.
 */
function validateTypeSpecificFields(input: z.infer<typeof partyInput>) {
  if (input.type === PartyType.CAR_SUPPLIER) {
    if (!input.country)
      throw new AppError('Choose the supplier country — it decides how tax is handled');
    if (input.country === Country.CANADA && !input.wholesaler)
      throw new AppError(
        'For a Canadian supplier, say whether he invoices the price only, or the price plus tax',
      );
  }
  if (input.type === PartyType.WORKER && !input.workerRole)
    throw new AppError('Say whether this worker is in the garage or the showroom');
}

export async function partyRoutes(app: FastifyInstance) {
  /** Accounts of one type, each with its live balance and what the sign means. */
  app.get('/api/parties', async (request) => {
    const query = z
      .object({
        type: z.nativeEnum(PartyType).optional(),
        includeInactive: z.coerce.boolean().optional(),
        search: z.string().optional(),
      })
      .parse(request.query);

    const parties = await prisma.party.findMany({
      where: {
        ...(query.type ? { type: query.type } : {}),
        ...(query.includeInactive ? {} : { active: true }),
        ...(query.search
          ? {
              OR: [
                { name: { contains: query.search } },
                { companyName: { contains: query.search } },
                { mobile: { contains: query.search } },
              ],
            }
          : {}),
      },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });

    const balances = await balancesByParty();
    return parties.map((p) => {
      const balance = balances.get(p.id) ?? null;
      const meaning = SIGN_MEANING[p.type];
      return {
        ...p,
        balance: balance ?? '0',
        balanceLabel:
          !balance || balance.isZero() ? 'Settled' : balance.gt(0) ? meaning.positive : meaning.negative,
        meaning,
      };
    });
  });

  app.get('/api/parties/:id', async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const party = await prisma.party.findUnique({ where: { id } });
    if (!party) throw notFound('Account not found');
    const balance = await balanceOfParty(id);
    return { ...party, balance, meaning: SIGN_MEANING[party.type] };
  });

  app.post('/api/parties', async (request) => {
    const input = partyInput.parse(request.body);
    validateTypeSpecificFields(input);

    const party = await prisma.party.create({
      data: {
        type: input.type,
        name: input.name.trim(),
        companyName: input.companyName?.trim() || null,
        mobile: input.mobile?.trim() || null,
        currency: await currencyForType(input.type),
        country: input.type === PartyType.CAR_SUPPLIER ? input.country : null,
        wholesaler:
          input.type === PartyType.CAR_SUPPLIER && input.country === Country.CANADA
            ? input.wholesaler
            : null,
        workerRole: input.type === PartyType.WORKER ? input.workerRole : null,
        note: input.note || null,
      },
    });
    await audit(prisma, {
      userId: request.user?.id,
      action: 'CREATE',
      entity: 'Party',
      entityId: party.id,
      after: party,
      ip: request.ip,
    });
    return party;
  });

  app.patch('/api/parties/:id', async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const before = await prisma.party.findUnique({ where: { id } });
    if (!before) throw notFound('Account not found');

    const input = partyInput.partial().parse(request.body);
    const merged = { ...before, ...input } as z.infer<typeof partyInput>;
    // The type is what determines the currency and the ledger's sign meaning,
    // so it cannot be changed once the account has history.
    if (input.type && input.type !== before.type) {
      const entries = await prisma.ledgerEntry.count({ where: { partyId: id } });
      if (entries > 0)
        throw new AppError('This account already has transactions, so its type cannot be changed');
    }
    validateTypeSpecificFields(merged);

    const party = await prisma.party.update({
      where: { id },
      data: {
        name: merged.name,
        companyName: merged.companyName || null,
        mobile: merged.mobile || null,
        country: merged.type === PartyType.CAR_SUPPLIER ? merged.country : null,
        wholesaler:
          merged.type === PartyType.CAR_SUPPLIER && merged.country === Country.CANADA
            ? merged.wholesaler
            : null,
        workerRole: merged.type === PartyType.WORKER ? merged.workerRole : null,
        note: merged.note || null,
        ...(input.type ? { type: input.type, currency: await currencyForType(input.type) } : {}),
      },
    });
    await audit(prisma, {
      userId: request.user?.id,
      action: 'UPDATE',
      entity: 'Party',
      entityId: id,
      before,
      after: party,
      ip: request.ip,
    });
    return party;
  });

  /**
   * Removing a supplier hides him from the lists but keeps every past car and
   * ledger line intact. Deleting the row outright would silently corrupt the
   * history of cars you already bought from him.
   */
  app.post('/api/parties/:id/archive', async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const party = await prisma.party.findUnique({ where: { id } });
    if (!party) throw notFound('Account not found');

    const balance = await balanceOfParty(id);
    if (!balance.isZero())
      throw new AppError(
        `This account still has a balance of ${balance.toString()} ${party.currency}. Settle it before removing.`,
      );

    const updated = await prisma.party.update({ where: { id }, data: { active: false } });
    await audit(prisma, {
      userId: request.user?.id,
      action: 'ARCHIVE',
      entity: 'Party',
      entityId: id,
      before: party,
      after: updated,
      ip: request.ip,
    });
    return updated;
  });

  app.post('/api/parties/:id/restore', async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    return prisma.party.update({ where: { id }, data: { active: true } });
  });

  /** The full account statement, with a running balance. */
  app.get('/api/parties/:id/statement', async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const { from, to } = z
      .object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() })
      .parse(request.query);
    return statement(id, from, to);
  });

  /** Corrections are made by reversal, never by editing history. */
  app.post('/api/ledger/:id/reverse', async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const { reason } = z
      .object({ reason: z.string().min(3, 'Say why this line is being reversed') })
      .parse(request.body);
    const entry = await reverseEntry(id, reason, request.user?.id);
    await audit(prisma, {
      userId: request.user?.id,
      action: 'REVERSE',
      entity: 'LedgerEntry',
      entityId: id,
      after: entry,
      ip: request.ip,
    });
    return entry;
  });
}
