import { CarStatus, LedgerKind, PartyType, SaleChannel } from '@prisma/client';
import { prisma, Prisma } from '../lib/db.js';
import { D, exchangeDifference, monthlyPnl, roundCfa, sum } from '../lib/money.js';
import { balancesByParty } from './ledger.js';
import { carLabel, costBreakdown, landedCostOf } from './cars.js';

/** Ledger kinds that increase what I owe a car supplier. */
const SUPPLIER_CHARGE_KINDS: LedgerKind[] = [
  LedgerKind.CAR_PURCHASE,
  LedgerKind.TAX_CHARGE,
  LedgerKind.ORIGIN_EXPENSE,
  LedgerKind.ADJUSTMENT,
  LedgerKind.OPENING_BALANCE,
];

/**
 * Exchange difference on one supplier's running account (Rule 6).
 *
 * The car's cost was locked at the rate on the day its shipment arrived. The
 * money is wired later, at whatever the rate is then. That gap is a real gain
 * or loss and it belongs in the monthly report — not folded back into the car,
 * which would make a cost you already agreed change by itself.
 *
 * Because supplier accounts are running accounts, wires are applied to charges
 * oldest first — how a current account is settled in practice.
 */
export async function fxDifferenceForSupplier(supplierId: number, upTo?: Date) {
  const charges = await prisma.ledgerEntry.findMany({
    where: {
      partyId: supplierId,
      kind: { in: SUPPLIER_CHARGE_KINDS },
      amount: { gt: 0 },
      ...(upTo ? { date: { lte: upTo } } : {}),
    },
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
    include: { car: { select: { cfaRate: true } } },
  });

  // Everything that reduces the balance, in date order. A wire carries the rate
  // it was bought at; a tax credit or the proceeds of a car sold abroad involve
  // no exchange at all, so they clear the debt without any gain or loss.
  const settlements = await prisma.ledgerEntry.findMany({
    where: {
      partyId: supplierId,
      kind: {
        in: [
          LedgerKind.PAYMENT,
          LedgerKind.TAX_REFUND_CREDIT,
          LedgerKind.ORIGIN_SALE_PROCEEDS,
          LedgerKind.REVERSAL,
        ],
      },
      amount: { lt: 0 },
      ...(upTo ? { date: { lte: upTo } } : {}),
    },
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
    include: { transaction: { select: { rate: true } } },
  });

  return exchangeDifference(
    charges.map((c) => ({
      amountUsd: c.amount.toString(),
      bookedRate: c.car?.cfaRate ? c.car.cfaRate.toString() : null,
    })),
    settlements.map((s) => ({
      amountUsd: s.amount.negated().toString(),
      rate: s.transaction?.rate ? s.transaction.rate.toString() : null,
    })),
  );
}

/** Exchange difference arising within a period = cumulative(end) - cumulative(start). */
export async function fxDifferenceInPeriod(from: Date, to: Date) {
  const suppliers = await prisma.party.findMany({
    where: { type: PartyType.CAR_SUPPLIER },
    select: { id: true, name: true },
  });

  const dayBefore = new Date(from.getTime() - 1);
  let total = D(0);
  const perSupplier: { id: number; name: string; differenceCfa: string }[] = [];

  for (const supplier of suppliers) {
    const [end, start] = await Promise.all([
      fxDifferenceForSupplier(supplier.id, to),
      fxDifferenceForSupplier(supplier.id, dayBefore),
    ]);
    const difference = end.differenceCfa.minus(start.differenceCfa);
    if (!difference.isZero()) {
      perSupplier.push({ id: supplier.id, name: supplier.name, differenceCfa: difference.toString() });
    }
    total = total.plus(difference);
  }

  return { totalCfa: roundCfa(total), perSupplier };
}

/**
 * The monthly report. Rule 3 in one function: a car's cost reaches profit in
 * the month the car is SOLD, never when it was bought or paid for.
 */
export async function monthlyReport(year: number, month: number) {
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  const sales = await prisma.sale.findMany({
    where: { saleDate: { gte: from, lte: to }, channel: SaleChannel.LOCAL },
    include: { car: true },
  });
  const costs = await landedCostOf(sales.map((s) => s.carId));

  const overhead = await prisma.overheadExpense.findMany({
    where: { date: { gte: from, lte: to } },
  });

  const fees = await prisma.ledgerEntry.findMany({
    where: { kind: LedgerKind.FEE, date: { gte: from, lte: to } },
  });

  const fx = await fxDifferenceInPeriod(from, to);

  const pnl = monthlyPnl({
    salesCfa: sales.map((s) => s.price.toString()),
    costOfCarsSoldCfa: sales.map((s) => (costs.get(s.carId) ?? new Prisma.Decimal(0)).toString()),
    overheadCfa: overhead.map((o) => o.amountCfa.toString()),
    feesCfa: fees.map((f) => f.amount.abs().toString()),
    fxDifferenceCfa: fx.totalCfa,
  });

  // Cars sold abroad settle in USD inside the supplier's account, so they are
  // reported separately rather than mixed into the CFA result.
  const originSales = await prisma.sale.findMany({
    where: { saleDate: { gte: from, lte: to }, channel: SaleChannel.ORIGIN },
    include: { car: { include: { originExpenses: true, repairJobs: true, repairParts: true, costAdjustments: true } } },
  });

  return {
    period: { year, month, from, to },
    ...pnl,
    carsSold: sales.length,
    lines: sales.map((s) => ({
      carId: s.carId,
      label: carLabel(s.car),
      price: s.price,
      cost: costs.get(s.carId) ?? new Prisma.Decimal(0),
      profit: D(s.price.toString()).minus((costs.get(s.carId) ?? new Prisma.Decimal(0)).toString()),
      saleDate: s.saleDate,
    })),
    overheadLines: overhead,
    fx,
    originSales: originSales.map((s) => {
      const breakdown = costBreakdown(s.car);
      return {
        carId: s.carId,
        label: carLabel(s.car),
        priceUsd: s.price,
        costUsd: breakdown.usd.totalCostUsd.toString(),
        profitUsd: D(s.price.toString()).minus(breakdown.usd.totalCostUsd).toString(),
      };
    }),
  };
}

/** What the business is holding right now. */
export async function dashboard() {
  const [cars, balances, parties, refunds] = await Promise.all([
    prisma.car.findMany({
      where: { active: true, status: { notIn: [CarStatus.SOLD, CarStatus.SOLD_IN_ORIGIN] } },
      include: { originExpenses: true, repairJobs: true, repairParts: true, costAdjustments: true },
    }),
    balancesByParty(),
    prisma.party.findMany({ where: { active: true } }),
    prisma.car.findMany({
      where: { taxRefundableUsd: { gt: 0 }, taxRefundSettled: false, active: true },
      include: { supplier: { select: { id: true, name: true } } },
    }),
  ]);

  const byStatus = Object.fromEntries(
    Object.values(CarStatus).map((status) => [status, cars.filter((c) => c.status === status).length]),
  );

  const stockValueCfa = cars
    .filter((c) => c.arrivalCostCfa !== null)
    .reduce((acc, car) => acc.plus(costBreakdown(car).landedCostCfa ?? D(0)), D(0));

  const abroadValueUsd = cars
    .filter((c) => c.arrivalCostCfa === null)
    .reduce((acc, car) => acc.plus(costBreakdown(car).usd.totalCostUsd), D(0));

  const totalFor = (type: PartyType) =>
    parties
      .filter((p) => p.type === type)
      .reduce((acc, p) => acc.plus(D((balances.get(p.id) ?? new Prisma.Decimal(0)).toString())), D(0));

  return {
    carsByStatus: byStatus,
    carsInStock: cars.length,
    stockValueCfa: roundCfa(stockValueCfa),
    abroadValueUsd: abroadValueUsd.toDecimalPlaces(2),
    owedToSuppliersUsd: totalFor(PartyType.CAR_SUPPLIER).toDecimalPlaces(2),
    owedToShippingUsd: totalFor(PartyType.SHIPPING_COMPANY).toDecimalPlaces(2),
    treasuryCfa: roundCfa(totalFor(PartyType.TRANSFER_COMPANY)),
    owedToWorkersCfa: roundCfa(totalFor(PartyType.WORKER)),
    owedToPartsSuppliersCfa: roundCfa(totalFor(PartyType.PARTS_SUPPLIER)),
    owedByCustomersCfa: roundCfa(totalFor(PartyType.CUSTOMER)),
    taxRefundsPending: refunds.map((c) => ({
      carId: c.id,
      label: carLabel(c),
      supplier: c.supplier.name,
      amountUsd: c.taxRefundableUsd,
      mode: c.taxRefundMode,
    })),
    taxRefundsPendingTotalUsd: sum(refunds.map((r) => r.taxRefundableUsd.toString())).toDecimalPlaces(2),
  };
}
