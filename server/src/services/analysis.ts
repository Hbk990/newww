import { CarStatus, LedgerKind, PartyType, ReservationStatus, SaleChannel, ShipmentStatus } from '@prisma/client';
import { prisma, Prisma } from '../lib/db.js';
import { D, roundCfa, roundUsd, sum } from '../lib/money.js';
import { carLabel, costBreakdown } from './cars.js';

/**
 * WHICH SUPPLIER ACTUALLY MAKES YOU MONEY.
 *
 * A supplier's cars can look cheap and still lose: the tax, the expenses he
 * charges in the origin country, the freight and the repairs a damaged car
 * needs are all real cost, and they land on different screens. This puts them
 * in one row per supplier so the comparison is honest.
 */
export async function profitBySupplier(from?: Date, to?: Date) {
  const sales = await prisma.sale.findMany({
    where: {
      channel: SaleChannel.LOCAL,
      ...(from || to ? { saleDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    },
    include: {
      car: {
        include: {
          supplier: true,
          originExpenses: true,
          repairJobs: true,
          repairParts: true,
          costAdjustments: true,
        },
      },
    },
  });

  const bySupplier = new Map<
    number,
    {
      supplierId: number;
      name: string;
      country: string | null;
      carsSold: number;
      revenueCfa: Prisma.Decimal;
      costCfa: Prisma.Decimal;
      repairsCfa: Prisma.Decimal;
      damagedCount: number;
      daysToSell: number[];
    }
  >();

  for (const sale of sales) {
    const car = sale.car;
    const costs = costBreakdown(car);
    const row =
      bySupplier.get(car.supplierId) ??
      {
        supplierId: car.supplierId,
        name: car.supplier.name,
        country: car.supplier.country,
        carsSold: 0,
        revenueCfa: new Prisma.Decimal(0),
        costCfa: new Prisma.Decimal(0),
        repairsCfa: new Prisma.Decimal(0),
        damagedCount: 0,
        daysToSell: [] as number[],
      };

    row.carsSold += 1;
    row.revenueCfa = row.revenueCfa.plus(sale.price);
    row.costCfa = row.costCfa.plus((costs.landedCostCfa ?? D(0)).toString());
    row.repairsCfa = row.repairsCfa.plus(costs.repairsCfa.toString());
    if (car.damaged) row.damagedCount += 1;
    if (car.showroomAt) {
      row.daysToSell.push(
        Math.max(0, Math.floor((sale.saleDate.getTime() - car.showroomAt.getTime()) / 86400000)),
      );
    }
    bySupplier.set(car.supplierId, row);
  }

  return [...bySupplier.values()]
    .map((row) => {
      const profit = row.revenueCfa.minus(row.costCfa);
      return {
        supplierId: row.supplierId,
        name: row.name,
        country: row.country,
        carsSold: row.carsSold,
        revenueCfa: row.revenueCfa.toString(),
        costCfa: row.costCfa.toString(),
        repairsCfa: row.repairsCfa.toString(),
        profitCfa: profit.toString(),
        profitPerCarCfa: roundCfa(profit.dividedBy(row.carsSold).toString()).toString(),
        marginPct: row.costCfa.isZero()
          ? null
          : profit.dividedBy(row.costCfa).times(100).toDecimalPlaces(1).toString(),
        /** How often his cars arrive needing work — the hidden cost. */
        damagedPct: Math.round((row.damagedCount / row.carsSold) * 100),
        averageDaysToSell: row.daysToSell.length
          ? Math.round(row.daysToSell.reduce((a, b) => a + b, 0) / row.daysToSell.length)
          : null,
      };
    })
    .sort((a, b) => Number(b.profitCfa) - Number(a.profitCfa));
}

/**
 * WHAT THE SHIPPER QUOTED AGAINST WHAT HE BILLED.
 *
 * A shipper who quotes low and invoices high costs you money you never planned
 * for, and it is invisible one shipment at a time.
 */
export async function freightAccuracy() {
  const shipments = await prisma.shipment.findMany({
    where: { status: ShipmentStatus.ARRIVED, estimatedFreightUsd: { not: null } },
    include: {
      shippingCompany: { select: { id: true, name: true } },
      cars: { select: { id: true, year: true, makeName: true, modelName: true } },
    },
    orderBy: { arrivalDate: 'desc' },
  });

  const rows = shipments.map((shipment) => {
    const estimated = shipment.estimatedFreightUsd!;
    const actual = shipment.freightCostUsd;
    const difference = actual.minus(estimated);
    return {
      shipmentId: shipment.id,
      reference: shipment.reference,
      company: shipment.shippingCompany.name,
      companyId: shipment.shippingCompany.id,
      arrivalDate: shipment.arrivalDate,
      cars: shipment.cars.length,
      estimatedUsd: estimated.toString(),
      actualUsd: actual.toString(),
      differenceUsd: difference.toString(),
      overPct: estimated.isZero()
        ? null
        : difference.dividedBy(estimated).times(100).toDecimalPlaces(1).toString(),
    };
  });

  const byCompany = new Map<number, { name: string; shipments: number; estimated: Prisma.Decimal; actual: Prisma.Decimal }>();
  for (const row of rows) {
    const entry = byCompany.get(row.companyId) ?? {
      name: row.company,
      shipments: 0,
      estimated: new Prisma.Decimal(0),
      actual: new Prisma.Decimal(0),
    };
    entry.shipments += 1;
    entry.estimated = entry.estimated.plus(row.estimatedUsd);
    entry.actual = entry.actual.plus(row.actualUsd);
    byCompany.set(row.companyId, entry);
  }

  return {
    rows,
    byCompany: [...byCompany.entries()].map(([id, entry]) => ({
      companyId: id,
      name: entry.name,
      shipments: entry.shipments,
      estimatedUsd: entry.estimated.toString(),
      actualUsd: entry.actual.toString(),
      differenceUsd: entry.actual.minus(entry.estimated).toString(),
      overPct: entry.estimated.isZero()
        ? null
        : entry.actual.minus(entry.estimated).dividedBy(entry.estimated).times(100).toDecimalPlaces(1).toString(),
    })),
  };
}

/**
 * EVERY RATE YOU HAVE ACTUALLY PAID.
 *
 * Not a published rate — the ones your transfer companies and shipments really
 * used. Seeing them together is what tells you whether to wire now or wait.
 */
export async function rateHistory() {
  const [shipments, wires] = await Promise.all([
    prisma.shipment.findMany({
      where: { cfaRate: { not: null }, arrivalDate: { not: null } },
      select: { id: true, reference: true, cfaRate: true, arrivalDate: true },
      orderBy: { arrivalDate: 'asc' },
    }),
    prisma.transaction.findMany({
      where: { rate: { not: null } },
      include: { counterparty: { select: { name: true } }, transferCompany: { select: { name: true } } },
      orderBy: { date: 'asc' },
    }),
  ]);

  const points = [
    ...shipments.map((s) => ({
      date: s.arrivalDate!,
      rate: s.cfaRate!.toString(),
      kind: 'shipment' as const,
      label: `Cost locked — ${s.reference}`,
    })),
    ...wires.map((w) => ({
      date: w.date,
      rate: w.rate!.toString(),
      kind: 'wire' as const,
      label: `Wire${w.counterparty ? ` to ${w.counterparty.name}` : ''}${
        w.transferCompany ? ` via ${w.transferCompany.name}` : ''
      }`,
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  const rates = points.map((p) => Number(p.rate));
  const wireRates = points.filter((p) => p.kind === 'wire').map((p) => Number(p.rate));

  return {
    points,
    summary: {
      count: points.length,
      lowest: rates.length ? Math.min(...rates) : null,
      highest: rates.length ? Math.max(...rates) : null,
      latest: rates.length ? rates[rates.length - 1] : null,
      averageWireRate: wireRates.length
        ? Number((wireRates.reduce((a, b) => a + b, 0) / wireRates.length).toFixed(2))
        : null,
    },
  };
}

/**
 * CARS THAT ARE ABOUT TO LOSE MONEY.
 *
 * Repairs creep. A car whose cost has climbed past what you can sell it for is
 * something you want to know at the garage stage — when you can still stop —
 * not on the day you sell it.
 */
export async function carsAtRisk() {
  const cars = await prisma.car.findMany({
    where: {
      active: true,
      status: { in: [CarStatus.ARRIVED, CarStatus.IN_GARAGE, CarStatus.SHOWROOM] },
      askingPriceCfa: { not: null },
    },
    include: {
      supplier: { select: { id: true, name: true } },
      originExpenses: true,
      repairJobs: true,
      repairParts: true,
      costAdjustments: true,
    },
  });

  return cars
    .map((car) => {
      const costs = costBreakdown(car);
      const cost = D((costs.landedCostCfa ?? 0).toString());
      const asking = D(car.askingPriceCfa!.toString());
      const margin = asking.minus(cost);
      const marginPct = cost.isZero() ? null : margin.dividedBy(cost).times(100).toDecimalPlaces(1);
      return {
        carId: car.id,
        label: carLabel(car),
        status: car.status,
        supplier: car.supplier.name,
        landedCostCfa: cost.toString(),
        askingPriceCfa: asking.toString(),
        marginCfa: margin.toString(),
        marginPct: marginPct ? marginPct.toString() : null,
        repairsCfa: costs.repairsCfa.toString(),
        /** Already under water, or close enough that one more repair does it. */
        severity: margin.lte(0) ? ('loss' as const) : marginPct && marginPct.lt(10) ? ('thin' as const) : ('ok' as const),
      };
    })
    .filter((row) => row.severity !== 'ok')
    .sort((a, b) => Number(a.marginCfa) - Number(b.marginCfa));
}

/** Deposits currently held, and deposits kept when buyers walked away. */
export async function depositSummary(from?: Date, to?: Date) {
  const [active, forfeited] = await Promise.all([
    prisma.reservation.findMany({
      where: { status: ReservationStatus.ACTIVE },
      include: { car: { select: { id: true, year: true, makeName: true, modelName: true } } },
    }),
    prisma.reservation.findMany({
      where: {
        status: ReservationStatus.FORFEITED,
        ...(from || to ? { closedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      },
    }),
  ]);

  return {
    heldCount: active.length,
    heldTotalCfa: roundCfa(sum(active.map((r) => r.depositCfa.toString()))).toString(),
    held: active.map((r) => ({
      id: r.id,
      carId: r.carId,
      label: `${r.car.year} ${r.car.makeName} ${r.car.modelName}`,
      customerName: r.customerName,
      depositCfa: r.depositCfa.toString(),
      daysHeld: Math.floor((Date.now() - r.date.getTime()) / 86400000),
    })),
    forfeitedCfa: roundCfa(sum(forfeited.map((r) => r.depositCfa.toString()))).toString(),
    forfeitedCount: forfeited.length,
  };
}

/** Twelve months of sales, cost and profit, for the trend on the dashboard. */
export async function monthlyTrend(months = 12) {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));

  const sales = await prisma.sale.findMany({
    where: { channel: SaleChannel.LOCAL, saleDate: { gte: start } },
    include: {
      car: { include: { originExpenses: true, repairJobs: true, repairParts: true, costAdjustments: true } },
    },
  });
  const overheads = await prisma.overheadExpense.findMany({ where: { date: { gte: start } } });

  const buckets = new Map<string, { sales: Prisma.Decimal; cost: Prisma.Decimal; overhead: Prisma.Decimal; cars: number }>();
  for (let i = 0; i < months; i++) {
    const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    buckets.set(date.toISOString().slice(0, 7), {
      sales: new Prisma.Decimal(0),
      cost: new Prisma.Decimal(0),
      overhead: new Prisma.Decimal(0),
      cars: 0,
    });
  }

  for (const sale of sales) {
    const key = sale.saleDate.toISOString().slice(0, 7);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.sales = bucket.sales.plus(sale.price);
    bucket.cost = bucket.cost.plus((costBreakdown(sale.car).landedCostCfa ?? D(0)).toString());
    bucket.cars += 1;
  }
  for (const overhead of overheads) {
    const bucket = buckets.get(overhead.date.toISOString().slice(0, 7));
    if (bucket) bucket.overhead = bucket.overhead.plus(overhead.amountCfa);
  }

  return [...buckets.entries()].map(([month, b]) => ({
    month,
    salesCfa: b.sales.toString(),
    costCfa: b.cost.toString(),
    grossProfitCfa: b.sales.minus(b.cost).toString(),
    netProfitCfa: b.sales.minus(b.cost).minus(b.overhead).toString(),
    carsSold: b.cars,
  }));
}

/** Where money is tied up right now, by stage of the journey. */
export async function stockByStage() {
  const cars = await prisma.car.findMany({
    where: { active: true, status: { notIn: [CarStatus.SOLD, CarStatus.SOLD_IN_ORIGIN] } },
    include: { originExpenses: true, repairJobs: true, repairParts: true, costAdjustments: true },
  });

  const stages = [CarStatus.PURCHASED, CarStatus.SHIPPED, CarStatus.ARRIVED, CarStatus.IN_GARAGE, CarStatus.SHOWROOM];
  return stages.map((stage) => {
    const inStage = cars.filter((car) => car.status === stage);
    const valueCfa = inStage.reduce((acc, car) => {
      const costs = costBreakdown(car);
      return acc.plus((costs.landedCostCfa ?? D(0)).toString());
    }, D(0));
    const valueUsd = inStage.reduce((acc, car) => {
      const costs = costBreakdown(car);
      return costs.arrived ? acc : acc.plus(costs.usd.totalCostUsd);
    }, D(0));
    return {
      stage,
      cars: inStage.length,
      valueCfa: roundCfa(valueCfa).toString(),
      valueUsd: roundUsd(valueUsd).toString(),
    };
  });
}

/** What each account is owed or holding, in one list for the dashboard. */
export async function accountTotals() {
  const parties = await prisma.party.findMany({ where: { active: true } });
  const balances = await prisma.ledgerEntry.groupBy({ by: ['partyId'], _sum: { amount: true } });
  const byId = new Map(balances.map((b) => [b.partyId, b._sum.amount ?? new Prisma.Decimal(0)]));

  const totals = (type: PartyType) =>
    parties
      .filter((p) => p.type === type)
      .reduce((acc, p) => acc.plus(byId.get(p.id) ?? new Prisma.Decimal(0)), new Prisma.Decimal(0));

  return {
    suppliersUsd: totals(PartyType.CAR_SUPPLIER).toString(),
    shippingUsd: totals(PartyType.SHIPPING_COMPANY).toString(),
    treasuryCfa: totals(PartyType.TRANSFER_COMPANY).toString(),
    workersCfa: totals(PartyType.WORKER).toString(),
    partsCfa: totals(PartyType.PARTS_SUPPLIER).toString(),
    customersCfa: totals(PartyType.CUSTOMER).toString(),
  };
}

export { LedgerKind };
