import { CarStatus, type Car, type OriginExpense, type RepairJob, type RepairPart } from '@prisma/client';
import { prisma, Prisma } from '../lib/db.js';
import { notFound } from '../lib/errors.js';
import { carCostUsd, landedCost, roundCfa, roundUsd, sum, D } from '../lib/money.js';

export type CarWithCosts = Car & {
  originExpenses: OriginExpense[];
  repairJobs: RepairJob[];
  repairParts: RepairPart[];
};

/**
 * The cost of one car, shown the way it is built up: the USD layer while the
 * car is abroad, then the CFA layer frozen at the shipment's rate, then the
 * garage work added on top in CFA.
 *
 * Nothing here recomputes the frozen snapshot — it reads Car.arrivalCostCfa,
 * which was written once when the shipment arrived. That is what guarantees a
 * car's cost never moves after the fact.
 */
export function costBreakdown(car: CarWithCosts) {
  const originExpensesUsd = car.originExpenses.map((e) => e.amountUsd);
  const usd = {
    purchasePriceUsd: roundUsd(car.purchasePriceUsd),
    originExpensesUsd: roundUsd(sum(originExpensesUsd)),
    taxInvoicedUsd: roundUsd(car.taxUsd),
    taxCapitalizedUsd: roundUsd(car.taxCapitalizedUsd),
    taxRefundableUsd: roundUsd(car.taxRefundableUsd),
    freightShareUsd: car.freightShareUsd ? roundUsd(car.freightShareUsd) : null,
    totalCostUsd: carCostUsd({
      purchasePriceUsd: car.purchasePriceUsd,
      originExpensesUsd,
      taxCapitalizedUsd: car.taxCapitalizedUsd,
    }),
  };

  const labour = car.repairJobs.map((j) => j.labourCostCfa);
  const parts = car.repairParts.map((p) => p.costCfa);

  // No rate yet: the car has not arrived, so it has no CFA cost at all.
  if (car.arrivalCostCfa === null) {
    return {
      usd,
      arrived: false,
      cfa: null,
      repairsCfa: roundCfa(sum([...labour, ...parts])),
      landedCostCfa: null,
    };
  }

  const lc = landedCost({
    arrivalCostCfa: car.arrivalCostCfa,
    labourCfa: labour,
    partsCfa: parts,
  });

  return {
    usd,
    arrived: true,
    cfa: {
      cfaRate: car.cfaRate,
      purchaseCfa: car.purchaseCfa,
      originExpensesCfa: car.originExpensesCfa,
      taxCapitalizedCfa: car.taxCapitalizedCfa,
      freightCfa: car.freightCfa,
      arrivalCostCfa: car.arrivalCostCfa,
    },
    repairsCfa: lc.repairsCfa,
    labourCfa: lc.labourCfa,
    partsCfa: lc.partsCfa,
    landedCostCfa: lc.landedCostCfa,
  };
}

export async function getCarWithCosts(id: number): Promise<CarWithCosts> {
  const car = await prisma.car.findUnique({
    where: { id },
    include: {
      originExpenses: { orderBy: { date: 'asc' } },
      repairJobs: { orderBy: { date: 'asc' } },
      repairParts: { orderBy: { date: 'asc' } },
    },
  });
  if (!car) throw notFound('Car not found');
  return car;
}

export const carLabel = (car: { year: number; makeName: string; modelName: string; vin: string }) =>
  `${car.year} ${car.makeName} ${car.modelName} (${car.vin.slice(-6)})`;

/** Statuses where the car is still abroad and its cost can still be edited. */
export const isEditableCost = (status: CarStatus) =>
  status === CarStatus.PURCHASED || status === CarStatus.SHIPPED;

/** Landed cost of a set of cars — used by the reports for cost of goods sold. */
export async function landedCostOf(carIds: number[]): Promise<Map<number, Prisma.Decimal>> {
  if (carIds.length === 0) return new Map();
  const cars = await prisma.car.findMany({
    where: { id: { in: carIds } },
    include: { originExpenses: true, repairJobs: true, repairParts: true },
  });
  return new Map(
    cars.map((car) => {
      const breakdown = costBreakdown(car);
      return [car.id, new Prisma.Decimal((breakdown.landedCostCfa ?? D(0)).toString())];
    }),
  );
}
