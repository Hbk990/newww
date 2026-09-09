import { atomic } from '../lib/atomic.js';
import type { FastifyInstance } from 'fastify';
import {
  CarStatus,
  Country,
  LedgerKind,
  PartyType,
  TaxRefundMode,
  WholesalerType,
} from '@prisma/client';
import { z } from 'zod';
import { prisma, Prisma } from '../lib/db.js';
import { audit } from '../lib/audit.js';
import { AppError, notFound } from '../lib/errors.js';
import { taxThreshold } from '../lib/settings.js';
import { checkVin } from '../lib/vin.js';
import { splitTax, D } from '../lib/money.js';
import { post, type PostableEntry } from '../services/ledger.js';
import { carLabel, costBreakdown, getCarWithCosts, isEditableCost } from '../services/cars.js';

const money = z.coerce.number().nonnegative();

const originExpenseInput = z.object({
  amountUsd: money.positive('An expense must be more than zero'),
  note: z.string().optional().nullable(),
  date: z.coerce.date().optional(),
});

const purchaseInput = z.object({
  supplierId: z.coerce.number(),
  makeName: z.string().min(1, 'Choose or type a brand'),
  modelName: z.string().min(1, 'Choose or type a model'),
  year: z.coerce.number().int().min(1950).max(new Date().getFullYear() + 2),
  color: z.string().min(1, 'Colour is required'),
  vin: z.string().min(1, 'VIN is required'),
  purchasePriceUsd: money.positive('The purchase price must be more than zero'),
  purchaseDate: z.coerce.date(),
  taxUsd: money.optional().default(0),
  taxRefundMode: z.nativeEnum(TaxRefundMode).optional(),
  problemNote: z.string().optional().nullable(),
  originExpenses: z.array(originExpenseInput).optional().default([]),
  /** Set when the car will be sold in the origin country and never shipped. */
  askingPriceCfa: money.optional().nullable(),
});

export async function carRoutes(app: FastifyInstance) {
  app.get('/api/cars', async (request) => {
    const q = z
      .object({
        status: z.union([z.nativeEnum(CarStatus), z.array(z.nativeEnum(CarStatus))]).optional(),
        supplierId: z.coerce.number().optional(),
        shipmentId: z.coerce.number().optional(),
        unassigned: z.coerce.boolean().optional(),
        search: z.string().optional(),
      })
      .parse(request.query);

    const statuses = q.status ? (Array.isArray(q.status) ? q.status : [q.status]) : undefined;

    const cars = await prisma.car.findMany({
      where: {
        active: true,
        ...(statuses ? { status: { in: statuses } } : {}),
        ...(q.supplierId ? { supplierId: q.supplierId } : {}),
        ...(q.shipmentId ? { shipmentId: q.shipmentId } : {}),
        ...(q.unassigned ? { shipmentId: null } : {}),
        ...(q.search
          ? {
              OR: [
                { vin: { contains: q.search } },
                { makeName: { contains: q.search } },
                { modelName: { contains: q.search } },
                { color: { contains: q.search } },
                { supplier: { name: { contains: q.search } } },
                { supplier: { companyName: { contains: q.search } } },
              ],
            }
          : {}),
      },
      include: {
        supplier: { select: { id: true, name: true, companyName: true, country: true } },
        shipment: {
          select: {
            id: true,
            reference: true,
            status: true,
            shippingCompany: { select: { id: true, name: true } },
          },
        },
        originExpenses: true,
        repairJobs: true,
        repairParts: true, costAdjustments: true,
        sale: { select: { id: true, price: true, currency: true, saleDate: true } },
      },
      orderBy: { purchaseDate: 'desc' },
    });

    return cars.map((car) => ({ ...car, costs: costBreakdown(car), label: carLabel(car) }));
  });

  app.get('/api/cars/:id', async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const car = await getCarWithCosts(id);
    const full = await prisma.car.findUniqueOrThrow({
      where: { id },
      include: {
        supplier: true,
        shipment: { include: { shippingCompany: { select: { id: true, name: true } } } },
        originExpenses: { orderBy: { date: 'asc' } },
        repairJobs: { include: { worker: { select: { id: true, name: true } } } },
        repairParts: { include: { partsSupplier: { select: { id: true, name: true } } } },
        sale: { include: { payments: true } },
        ledger: { orderBy: { id: 'asc' } },
      },
    });
    return { ...full, costs: costBreakdown(car), label: carLabel(car) };
  });

  /**
   * Buying a car. This is the one place the Canada tax rule is applied, and it
   * writes every corresponding line into the supplier's USD account in the same
   * database transaction as the car itself — so a car can never exist without
   * its debt, or a debt without its car.
   */
  app.post('/api/cars', async (request) => atomic(async (tx) => {
    const input = purchaseInput.parse(request.body);

    const supplier = await tx.party.findUnique({ where: { id: input.supplierId } });
    if (!supplier || supplier.type !== PartyType.CAR_SUPPLIER) throw notFound('Supplier not found');
    if (!supplier.active) throw new AppError('That supplier has been archived');

    const vinCheck = checkVin(input.vin);
    if (!vinCheck.wellFormed) throw new AppError(vinCheck.message ?? 'That VIN is not valid');

    // Tax only exists for a Canadian supplier who invoices price + tax.
    const taxApplies =
      supplier.country === Country.CANADA && supplier.wholesaler === WholesalerType.PRICE_PLUS_TAX;
    if (input.taxUsd > 0 && !taxApplies)
      throw new AppError(
        supplier.country === Country.USA
          ? 'USA suppliers have no tax — leave the tax empty'
          : 'This supplier is set to invoice the price only. Change his type if he now charges tax.',
      );

    const threshold = await taxThreshold();
    const tax = splitTax(input.taxUsd, threshold);
    const refundMode =
      tax.refundableUsd.gt(0)
        ? (input.taxRefundMode && input.taxRefundMode !== TaxRefundMode.NONE
            ? input.taxRefundMode
            : (() => {
                throw new AppError(
                  `Tax of $${input.taxUsd} is $${tax.refundableUsd.toString()} over the $${threshold} limit. Say whether the supplier credits it to your account or refunds it separately.`,
                );
              })())
        : TaxRefundMode.NONE;

    const car = await (async () => {
      const created = await tx.car.create({
        data: {
          supplierId: supplier.id,
          makeName: input.makeName.trim(),
          modelName: input.modelName.trim(),
          year: input.year,
          color: input.color.trim(),
          vin: vinCheck.normalized,
          purchasePriceUsd: new Prisma.Decimal(input.purchasePriceUsd),
          purchaseDate: input.purchaseDate,
          taxUsd: new Prisma.Decimal(input.taxUsd),
          taxCapitalizedUsd: new Prisma.Decimal(tax.capitalizedUsd.toString()),
          taxRefundableUsd: new Prisma.Decimal(tax.refundableUsd.toString()),
          taxRefundMode: refundMode,
          problemNote: input.problemNote || null,
          askingPriceCfa: input.askingPriceCfa ? new Prisma.Decimal(input.askingPriceCfa) : null,
          originExpenses: {
            create: input.originExpenses.map((e) => ({
              amountUsd: new Prisma.Decimal(e.amountUsd),
              note: e.note || null,
              date: e.date ?? input.purchaseDate,
            })),
          },
        },
        include: { originExpenses: true },
      });

      const label = carLabel(created);
      const entries: PostableEntry[] = [
        {
          partyId: supplier.id,
          date: input.purchaseDate,
          kind: LedgerKind.CAR_PURCHASE,
          amount: created.purchasePriceUsd,
          description: `Car purchased — ${label}`,
          carId: created.id,
        },
      ];

      if (D(input.taxUsd).gt(0)) {
        entries.push({
          partyId: supplier.id,
          date: input.purchaseDate,
          kind: LedgerKind.TAX_CHARGE,
          amount: new Prisma.Decimal(input.taxUsd),
          description: `Tax invoiced — ${label}`,
          carId: created.id,
        });
      }

      for (const expense of created.originExpenses) {
        entries.push({
          partyId: supplier.id,
          date: expense.date,
          kind: LedgerKind.ORIGIN_EXPENSE,
          amount: expense.amountUsd,
          description: `Expense in ${supplier.country === Country.CANADA ? 'Canada' : 'USA'}${
            expense.note ? ` — ${expense.note}` : ''
          } — ${label}`,
          carId: created.id,
        });
      }

      // The refundable part of the tax comes straight back off his account.
      if (refundMode === TaxRefundMode.SUPPLIER_CREDIT) {
        entries.push({
          partyId: supplier.id,
          date: input.purchaseDate,
          kind: LedgerKind.TAX_REFUND_CREDIT,
          amount: new Prisma.Decimal(tax.refundableUsd.negated().toString()),
          description: `Tax above $${threshold} credited back — ${label}`,
          carId: created.id,
        });
      }

      await post(tx, entries, request.user?.id);
      return created;
    })();

    await audit(tx, {
      userId: request.user?.id,
      action: 'CREATE',
      entity: 'Car',
      entityId: car.id,
      after: car,
      ip: request.ip,
    });

    return {
      ...car,
      vinWarning: vinCheck.checkDigitValid ? null : vinCheck.message,
      taxSummary: tax.refundableUsd.gt(0)
        ? `$${tax.capitalizedUsd} added to this car's cost, $${tax.refundableUsd} refundable`
        : null,
    };
  }));

  /** Details can be corrected while the car is abroad; money cannot, once frozen. */
  app.patch('/api/cars/:id', async (request) => atomic(async (tx) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const before = await tx.car.findUnique({ where: { id } });
    if (!before) throw notFound('Car not found');

    const input = purchaseInput
      .partial()
      .omit({ supplierId: true, originExpenses: true, taxUsd: true, taxRefundMode: true })
      .extend({ damaged: z.boolean().optional(), driveAndRun: z.boolean().optional() })
      .parse(request.body);

    if (input.purchasePriceUsd !== undefined && !isEditableCost(before.status))
      throw new AppError(
        'This car has already arrived and its cost is locked. Reverse the ledger line instead, so the correction stays visible.',
      );

    const priceChanged =
      input.purchasePriceUsd !== undefined &&
      !before.purchasePriceUsd.equals(new Prisma.Decimal(input.purchasePriceUsd));

    const car = await (async () => {
      const updated = await tx.car.update({
        where: { id },
        data: {
          ...(input.makeName ? { makeName: input.makeName.trim() } : {}),
          ...(input.modelName ? { modelName: input.modelName.trim() } : {}),
          ...(input.year ? { year: input.year } : {}),
          ...(input.color ? { color: input.color.trim() } : {}),
          ...(input.purchaseDate ? { purchaseDate: input.purchaseDate } : {}),
          ...(input.purchasePriceUsd !== undefined
            ? { purchasePriceUsd: new Prisma.Decimal(input.purchasePriceUsd) }
            : {}),
          ...(input.problemNote !== undefined ? { problemNote: input.problemNote || null } : {}),
          ...(input.askingPriceCfa !== undefined
            ? { askingPriceCfa: input.askingPriceCfa ? new Prisma.Decimal(input.askingPriceCfa) : null }
            : {}),
          ...(input.damaged !== undefined ? { damaged: input.damaged } : {}),
          ...(input.driveAndRun !== undefined ? { driveAndRun: input.driveAndRun } : {}),
        },
      });

      // A corrected price posts the difference, so the supplier's balance follows.
      if (priceChanged) {
        const difference = updated.purchasePriceUsd.minus(before.purchasePriceUsd);
        await post(
          tx,
          [
            {
              partyId: before.supplierId,
              date: new Date(),
              kind: LedgerKind.ADJUSTMENT,
              amount: difference,
              description: `Purchase price corrected from $${before.purchasePriceUsd} to $${updated.purchasePriceUsd} — ${carLabel(updated)}`,
              carId: id,
            },
          ],
          request.user?.id,
        );
      }

      return updated;
    })();

    await audit(tx, {
      userId: request.user?.id,
      action: 'UPDATE',
      entity: 'Car',
      entityId: id,
      before,
      after: car,
      ip: request.ip,
    });
    return car;
  }));

  /** An extra expense that turned up later — still charged to the supplier. */
  app.post('/api/cars/:id/origin-expenses', async (request) => atomic(async (tx) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const input = originExpenseInput.parse(request.body);
    const car = await tx.car.findUnique({ where: { id }, include: { supplier: true } });
    if (!car) throw notFound('Car not found');

    if (car.arrivalCostCfa !== null || !isEditableCost(car.status))
      throw new AppError(
        'This car has arrived and its cost is frozen, so an expense can no longer be added to it. Record it against the supplier from the Money screen instead.',
      );

    const expense = await (async () => {
      const created = await tx.originExpense.create({
        data: {
          carId: id,
          amountUsd: new Prisma.Decimal(input.amountUsd),
          note: input.note || null,
          date: input.date ?? new Date(),
        },
      });
      await post(
        tx,
        [
          {
            partyId: car.supplierId,
            date: created.date,
            kind: LedgerKind.ORIGIN_EXPENSE,
            amount: created.amountUsd,
            description: `Expense in origin country${input.note ? ` — ${input.note}` : ''} — ${carLabel(car)}`,
            carId: id,
          },
        ],
        request.user?.id,
      );
      return created;
    })();

    await audit(tx, {
      userId: request.user?.id,
      action: 'CREATE',
      entity: 'OriginExpense',
      entityId: expense.id,
      after: expense,
      ip: request.ip,
    });
    return expense;
  }));

  /** Marks a separately-refunded tax as actually received, so it stops chasing you. */
  app.post('/api/cars/:id/tax-refund/settle', async (request) => atomic(async (tx) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const car = await tx.car.findUnique({ where: { id } });
    if (!car) throw notFound('Car not found');
    if (car.taxRefundableUsd.lte(0)) throw new AppError('This car has no refundable tax');
    if (car.taxRefundSettled) throw new AppError('That refund is already marked as received');

    const updated = await tx.car.update({
      where: { id },
      data: { taxRefundSettled: true, taxRefundSettledAt: new Date() },
    });
    await audit(tx, {
      userId: request.user?.id,
      action: 'TAX_REFUND_SETTLED',
      entity: 'Car',
      entityId: id,
      before: car,
      after: updated,
      ip: request.ip,
    });
    return updated;
  }));
}
