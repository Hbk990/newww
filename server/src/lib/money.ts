/**
 * MONEY ENGINE
 *
 * Every calculation in this system that touches money lives here, as pure
 * functions with no database and no side effects, so it can be tested against
 * hand-computed numbers.
 *
 * Non-negotiable rules:
 *  - decimal.js everywhere. A float would silently lose cents and, over a year
 *    of supplier balances, produce numbers that cannot be reconciled.
 *  - USD is rounded to 2 decimals. CFA is rounded to whole francs (XOF/XAF have
 *    no sub-unit in practice).
 *  - Splits always add back up to the total. Any rounding remainder is handed
 *    to the earliest rows rather than silently disappearing.
 */

import Decimal from 'decimal.js';

Decimal.set({ precision: 34, rounding: Decimal.ROUND_HALF_UP });

export type Num = Decimal | number | string;

export const D = (v: Num): Decimal => new Decimal(v ?? 0);

/** USD and other 2-decimal currencies. */
export const roundUsd = (v: Num): Decimal => D(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

/** CFA — whole francs, no sub-unit. */
export const roundCfa = (v: Num): Decimal => D(v).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

/** FX rates carry 6 decimals. */
export const roundRate = (v: Num): Decimal => D(v).toDecimalPlaces(6, Decimal.ROUND_HALF_UP);

export const sum = (values: Num[]): Decimal => values.reduce<Decimal>((a, v) => a.plus(D(v)), D(0));

// ---------------------------------------------------------------------------
// Rule 5 — Canada tax
// ---------------------------------------------------------------------------

export interface TaxSplit {
  /** min(tax, threshold) — this part enters the car's cost. */
  capitalizedUsd: Decimal;
  /** max(tax - threshold, 0) — this part is refundable to me. */
  refundableUsd: Decimal;
}

/**
 * Canadian "price + tax" suppliers invoice the car plus a tax amount.
 * Tax up to the threshold ($500) is a real cost of the car. Every dollar above
 * the threshold comes back to me, so it must NOT sit in the car's cost.
 *
 * $700 tax  ->  $500 into cost, $200 refundable   (i.e. cost + 700 - 200)
 */
export function splitTax(taxUsd: Num, thresholdUsd: Num = 500): TaxSplit {
  const tax = roundUsd(taxUsd);
  const threshold = roundUsd(thresholdUsd);
  if (tax.lte(0)) return { capitalizedUsd: D(0), refundableUsd: D(0) };
  const capitalized = Decimal.min(tax, threshold);
  return { capitalizedUsd: roundUsd(capitalized), refundableUsd: roundUsd(tax.minus(capitalized)) };
}

// ---------------------------------------------------------------------------
// Rule 2, USD layer — what the car costs while it is still abroad
// ---------------------------------------------------------------------------

export interface CarCostUsdInput {
  purchasePriceUsd: Num;
  originExpensesUsd?: Num[];
  taxCapitalizedUsd?: Num;
}

export function carCostUsd(input: CarCostUsdInput): Decimal {
  return roundUsd(
    D(input.purchasePriceUsd)
      .plus(sum(input.originExpensesUsd ?? []))
      .plus(D(input.taxCapitalizedUsd ?? 0)),
  );
}

// ---------------------------------------------------------------------------
// Freight split — equal by default, editable per car, always exact
// ---------------------------------------------------------------------------

/**
 * Split freight equally across N cars. Because e.g. $1,000 / 3 does not divide
 * evenly, the leftover cents go to the first cars, so the shares always add up
 * to exactly the freight invoice. Never leaves a stray cent unallocated.
 */
export function splitFreightEqually(totalUsd: Num, carCount: number): Decimal[] {
  if (carCount <= 0) throw new Error('A shipment must contain at least one car');
  const total = roundUsd(totalUsd);
  const cents = total.times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const base = cents.dividedToIntegerBy(carCount);
  const remainder = cents.minus(base.times(carCount)).toNumber();
  return Array.from({ length: carCount }, (_, i) =>
    base.plus(i < remainder ? 1 : 0).dividedBy(100),
  );
}

export interface ShareCheck {
  ok: boolean;
  totalOfShares: Decimal;
  difference: Decimal;
}

/** After manual edits, the shares must still equal the freight invoice. */
export function checkFreightShares(shares: Num[], totalUsd: Num): ShareCheck {
  const totalOfShares = roundUsd(sum(shares));
  const difference = roundUsd(totalOfShares.minus(roundUsd(totalUsd)));
  return { ok: difference.isZero(), totalOfShares, difference };
}

// ---------------------------------------------------------------------------
// Rule 1 + Rule 2, CFA layer — frozen the moment the shipment arrives
// ---------------------------------------------------------------------------

export interface ArrivalCostInput {
  purchasePriceUsd: Num;
  originExpensesUsd?: Num[];
  taxCapitalizedUsd?: Num;
  freightShareUsd: Num;
  /** The shipment's rate. Locked here and never applied again. */
  cfaRate: Num;
}

export interface ArrivalCostSnapshot {
  cfaRate: Decimal;
  purchaseCfa: Decimal;
  originExpensesCfa: Decimal;
  taxCapitalizedCfa: Decimal;
  freightCfa: Decimal;
  /** The sum of the four components above, in whole francs. */
  arrivalCostCfa: Decimal;
}

/**
 * Converts one car from USD to CFA at the shipment's locked rate.
 * Each component is rounded to whole francs on its own and then added, so the
 * total on screen always equals the visible lines added up by hand.
 */
export function arrivalCostSnapshot(input: ArrivalCostInput): ArrivalCostSnapshot {
  const rate = roundRate(input.cfaRate);
  if (rate.lte(0)) throw new Error('The CFA rate must be greater than zero');

  const purchaseCfa = roundCfa(D(input.purchasePriceUsd).times(rate));
  const originExpensesCfa = roundCfa(sum(input.originExpensesUsd ?? []).times(rate));
  const taxCapitalizedCfa = roundCfa(D(input.taxCapitalizedUsd ?? 0).times(rate));
  const freightCfa = roundCfa(D(input.freightShareUsd).times(rate));

  return {
    cfaRate: rate,
    purchaseCfa,
    originExpensesCfa,
    taxCapitalizedCfa,
    freightCfa,
    arrivalCostCfa: purchaseCfa.plus(originExpensesCfa).plus(taxCapitalizedCfa).plus(freightCfa),
  };
}

// ---------------------------------------------------------------------------
// Landed cost and profit
// ---------------------------------------------------------------------------

export interface LandedCostInput {
  /** Frozen at arrival. */
  arrivalCostCfa: Num;
  /** Garage labour, added after arrival — already in CFA, no rate involved. */
  labourCfa?: Num[];
  /** Garage parts, already in CFA. */
  partsCfa?: Num[];
}

export interface LandedCost {
  arrivalCostCfa: Decimal;
  repairsCfa: Decimal;
  labourCfa: Decimal;
  partsCfa: Decimal;
  landedCostCfa: Decimal;
}

export function landedCost(input: LandedCostInput): LandedCost {
  const arrival = roundCfa(input.arrivalCostCfa);
  const labour = roundCfa(sum(input.labourCfa ?? []));
  const parts = roundCfa(sum(input.partsCfa ?? []));
  const repairs = labour.plus(parts);
  return {
    arrivalCostCfa: arrival,
    labourCfa: labour,
    partsCfa: parts,
    repairsCfa: repairs,
    landedCostCfa: arrival.plus(repairs),
  };
}

export interface Profit {
  price: Decimal;
  cost: Decimal;
  profit: Decimal;
  /** Profit as a percentage of cost. Null when cost is zero. */
  marginPct: Decimal | null;
}

export function profitOf(price: Num, cost: Num, currency: 'USD' | 'CFA' = 'CFA'): Profit {
  const round = currency === 'USD' ? roundUsd : roundCfa;
  const p = round(price);
  const c = round(cost);
  return {
    price: p,
    cost: c,
    profit: round(p.minus(c)),
    marginPct: c.isZero() ? null : p.minus(c).dividedBy(c).times(100).toDecimalPlaces(2),
  };
}

// ---------------------------------------------------------------------------
// Treasury
// ---------------------------------------------------------------------------

/**
 * A wire: CFA leaves a transfer company, USD is credited to the supplier.
 * The optional fee is a real business expense and is deducted separately —
 * it must never be folded into the USD amount, or the supplier's balance
 * would be wrong.
 */
export function wireCfaCost(amountUsd: Num, rate: Num, feeCfa: Num = 0) {
  const usd = roundUsd(amountUsd);
  const r = roundRate(rate);
  if (r.lte(0)) throw new Error('The CFA rate must be greater than zero');
  const principalCfa = roundCfa(usd.times(r));
  const fee = roundCfa(feeCfa);
  return { amountUsd: usd, rate: r, principalCfa, feeCfa: fee, totalCfaOut: principalCfa.plus(fee) };
}

/** Paying a USD-denominated account (freight) with CFA cash. */
export function usdCreditedForCfa(amountCfa: Num, rate: Num): Decimal {
  const r = roundRate(rate);
  if (r.lte(0)) throw new Error('The CFA rate must be greater than zero');
  return roundUsd(D(amountCfa).dividedBy(r));
}

/** A balance is always the sum of its lines — never a stored number. */
export function balanceOf(entries: { amount: Num }[], currency: 'USD' | 'CFA'): Decimal {
  const round = currency === 'USD' ? roundUsd : roundCfa;
  return round(sum(entries.map((e) => e.amount)));
}

// ---------------------------------------------------------------------------
// Rule 6 — exchange differences, made visible instead of hidden
// ---------------------------------------------------------------------------

export interface FxCharge {
  /** USD added to the supplier's balance. */
  amountUsd: Num;
  /** The rate this charge was locked into a car's cost at. Null = car has not
   *  arrived yet, so no rate exists and no gain/loss can be recognised. */
  bookedRate: Num | null;
}

export interface FxSettlement {
  amountUsd: Num;
  /**
   * The rate actually paid on the day of the wire, or null for a settlement
   * that involved no currency exchange at all — a tax credit, or the proceeds
   * of a car sold abroad. Those reduce the balance without any rate risk, so
   * they consume the debt but produce no gain or loss.
   */
  rate: Num | null;
}

export interface FxResult {
  /** Positive = the rate moved against me (a loss); negative = a gain. */
  differenceCfa: Decimal;
  /** USD paid against charges that had no locked rate yet (paid before arrival). */
  unmatchedUsd: Decimal;
  /** USD wired beyond every charge on record — an advance to the supplier. */
  advanceUsd: Decimal;
}

/**
 * A car's cost is locked at the arrival rate. If the rate has moved by the time
 * I actually wire the money, that difference is a genuine gain or loss — but it
 * must NOT go back and change the car's cost.
 *
 * Because supplier accounts are running accounts (you never pay "for car X"),
 * settlements are applied to charges oldest-first, which is how a current
 * account is settled in practice. Both lists must already be in date order.
 */
export function exchangeDifference(charges: FxCharge[], settlements: FxSettlement[]): FxResult {
  const queue = charges.map((c) => ({
    remaining: roundUsd(c.amountUsd),
    bookedRate: c.bookedRate === null ? null : roundRate(c.bookedRate),
  }));

  let differenceCfa = D(0);
  let unmatchedUsd = D(0);
  let advanceUsd = D(0);
  let cursor = 0;

  for (const settlement of settlements) {
    let left = roundUsd(settlement.amountUsd);
    const settlementRate = settlement.rate === null ? null : roundRate(settlement.rate);

    while (left.gt(0)) {
      while (cursor < queue.length && queue[cursor].remaining.lte(0)) cursor++;
      if (cursor >= queue.length) {
        advanceUsd = advanceUsd.plus(left); // settled more than is owed
        left = D(0);
        break;
      }
      const charge = queue[cursor];
      const applied = Decimal.min(left, charge.remaining);
      if (charge.bookedRate === null) {
        unmatchedUsd = unmatchedUsd.plus(applied);
      } else if (settlementRate !== null) {
        differenceCfa = differenceCfa.plus(applied.times(settlementRate.minus(charge.bookedRate)));
      }
      charge.remaining = charge.remaining.minus(applied);
      left = left.minus(applied);
    }
  }

  return {
    differenceCfa: roundCfa(differenceCfa),
    unmatchedUsd: roundUsd(unmatchedUsd),
    advanceUsd: roundUsd(advanceUsd),
  };
}

// ---------------------------------------------------------------------------
// Rule 3 — the monthly report
// ---------------------------------------------------------------------------

export interface MonthlyPnlInput {
  /** Sale prices of cars sold in the period, in CFA. */
  salesCfa: Num[];
  /** Landed cost of exactly those cars — cost hits profit only when sold. */
  costOfCarsSoldCfa: Num[];
  /** Rent, salaries, utilities... never added to a car's cost. */
  overheadCfa: Num[];
  /** Visible transfer-company commissions paid in the period. */
  feesCfa?: Num[];
  /** From exchangeDifference(): positive = loss. */
  fxDifferenceCfa?: Num;
}

export interface MonthlyPnl {
  salesCfa: Decimal;
  costOfCarsSoldCfa: Decimal;
  grossProfitCfa: Decimal;
  overheadCfa: Decimal;
  feesCfa: Decimal;
  fxDifferenceCfa: Decimal;
  netProfitCfa: Decimal;
}

export function monthlyPnl(input: MonthlyPnlInput): MonthlyPnl {
  const salesCfa = roundCfa(sum(input.salesCfa));
  const cogs = roundCfa(sum(input.costOfCarsSoldCfa));
  const overhead = roundCfa(sum(input.overheadCfa));
  const fees = roundCfa(sum(input.feesCfa ?? []));
  const fx = roundCfa(input.fxDifferenceCfa ?? 0);
  const gross = salesCfa.minus(cogs);
  return {
    salesCfa,
    costOfCarsSoldCfa: cogs,
    grossProfitCfa: gross,
    overheadCfa: overhead,
    feesCfa: fees,
    fxDifferenceCfa: fx,
    netProfitCfa: gross.minus(overhead).minus(fees).minus(fx),
  };
}
