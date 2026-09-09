/**
 * These tests are the safety net for real money. Every number below was
 * computed by hand first; the code must agree with the hand calculation.
 */
import { describe, it, expect } from 'vitest';
import {
  splitTax,
  carCostUsd,
  splitFreightEqually,
  checkFreightShares,
  arrivalCostSnapshot,
  landedCost,
  profitOf,
  wireCfaCost,
  usdCreditedForCfa,
  balanceOf,
  exchangeDifference,
  monthlyPnl,
} from '../src/lib/money.js';

describe('Canada tax (Rule 5)', () => {
  it('caps tax at 500 and makes the excess refundable', () => {
    const t = splitTax(700);
    expect(t.capitalizedUsd.toString()).toBe('500');
    expect(t.refundableUsd.toString()).toBe('200');
  });

  it('adds the whole tax to cost when it is under the threshold', () => {
    const t = splitTax(450);
    expect(t.capitalizedUsd.toString()).toBe('450');
    expect(t.refundableUsd.toString()).toBe('0');
  });

  it('treats exactly 500 as fully capitalized, nothing refundable', () => {
    const t = splitTax(500);
    expect(t.capitalizedUsd.toString()).toBe('500');
    expect(t.refundableUsd.toString()).toBe('0');
  });

  it('is a no-op for USA suppliers (no tax)', () => {
    const t = splitTax(0);
    expect(t.capitalizedUsd.toString()).toBe('0');
    expect(t.refundableUsd.toString()).toBe('0');
  });

  it('honours a threshold changed in settings', () => {
    const t = splitTax(700, 600);
    expect(t.capitalizedUsd.toString()).toBe('600');
    expect(t.refundableUsd.toString()).toBe('100');
  });
});

describe('freight split', () => {
  it('splits evenly when it divides exactly', () => {
    const shares = splitFreightEqually(3600, 3);
    expect(shares.map(String)).toEqual(['1200', '1200', '1200']);
  });

  it('never loses a cent on an awkward division', () => {
    const shares = splitFreightEqually(1000, 3);
    expect(shares.map(String)).toEqual(['333.34', '333.33', '333.33']);
    expect(shares.reduce((a, b) => a.plus(b)).toString()).toBe('1000');
  });

  it('gives a single car the whole freight', () => {
    expect(splitFreightEqually(1450.75, 1).map(String)).toEqual(['1450.75']);
  });

  it('refuses a shipment with no cars', () => {
    expect(() => splitFreightEqually(1000, 0)).toThrow();
  });

  it('detects manual shares that no longer add up', () => {
    expect(checkFreightShares([1500, 1000, 1100], 3600).ok).toBe(true);
    const bad = checkFreightShares([1500, 1000, 1000], 3600);
    expect(bad.ok).toBe(false);
    expect(bad.difference.toString()).toBe('-100');
  });
});

describe('rate locking and cost layers (Rules 1 & 2)', () => {
  it('converts every component at the one locked rate', () => {
    const snap = arrivalCostSnapshot({
      purchasePriceUsd: 10000,
      originExpensesUsd: [300],
      taxCapitalizedUsd: 500,
      freightShareUsd: 1200,
      cfaRate: 600,
    });
    expect(snap.purchaseCfa.toString()).toBe('6000000');
    expect(snap.originExpensesCfa.toString()).toBe('180000');
    expect(snap.taxCapitalizedCfa.toString()).toBe('300000');
    expect(snap.freightCfa.toString()).toBe('720000');
    expect(snap.arrivalCostCfa.toString()).toBe('7200000');
  });

  it('the on-screen lines always add up to the total', () => {
    const snap = arrivalCostSnapshot({
      purchasePriceUsd: 8333.33,
      originExpensesUsd: [125.55, 40.1],
      taxCapitalizedUsd: 0,
      freightShareUsd: 1033.33,
      cfaRate: 612.5,
    });
    const byHand = snap.purchaseCfa
      .plus(snap.originExpensesCfa)
      .plus(snap.taxCapitalizedCfa)
      .plus(snap.freightCfa);
    expect(snap.arrivalCostCfa.toString()).toBe(byHand.toString());
  });

  it('rejects a zero or negative rate', () => {
    expect(() =>
      arrivalCostSnapshot({ purchasePriceUsd: 1000, freightShareUsd: 100, cfaRate: 0 }),
    ).toThrow();
  });
});

describe('landed cost and profit', () => {
  it('adds garage work on top of the frozen arrival cost', () => {
    const lc = landedCost({
      arrivalCostCfa: 7200000,
      labourCfa: [150000],
      partsCfa: [200000],
    });
    expect(lc.repairsCfa.toString()).toBe('350000');
    expect(lc.landedCostCfa.toString()).toBe('7550000');
  });

  it('leaves an undamaged car at its arrival cost', () => {
    expect(landedCost({ arrivalCostCfa: 7200000 }).landedCostCfa.toString()).toBe('7200000');
  });

  it('computes profit and margin', () => {
    const p = profitOf(9000000, 7550000);
    expect(p.profit.toString()).toBe('1450000');
    expect(p.marginPct?.toString()).toBe('19.21');
  });

  it('shows a loss as a negative number rather than hiding it', () => {
    expect(profitOf(7000000, 7550000).profit.toString()).toBe('-550000');
  });
});

describe('THE WORKED EXAMPLE — Mercedes CLA 300, end to end', () => {
  it('reproduces every number agreed in the plan', () => {
    // Canadian "price + tax" supplier: $10,000 car, $700 tax, $300 origin expenses.
    const tax = splitTax(700);
    expect(tax.capitalizedUsd.toString()).toBe('500');
    expect(tax.refundableUsd.toString()).toBe('200');

    // Supplier's USD account: everything charged, minus the refund he credits back.
    const supplierOwed = balanceOf(
      [
        { amount: 10000 }, // car
        { amount: 700 }, // tax as invoiced
        { amount: 300 }, // origin expenses
        { amount: -200 }, // refundable tax credited to the account
      ],
      'USD',
    );
    expect(supplierOwed.toString()).toBe('10800');

    // The car's own USD cost carries only the capitalized half of the tax.
    const costUsd = carCostUsd({
      purchasePriceUsd: 10000,
      originExpensesUsd: [300],
      taxCapitalizedUsd: tax.capitalizedUsd,
    });
    expect(costUsd.toString()).toBe('10800');

    // Shipment: 3 cars, $3,600 freight, rate locked at 600.
    const shares = splitFreightEqually(3600, 3);
    expect(shares[0].toString()).toBe('1200');

    const snap = arrivalCostSnapshot({
      purchasePriceUsd: 10000,
      originExpensesUsd: [300],
      taxCapitalizedUsd: tax.capitalizedUsd,
      freightShareUsd: shares[0],
      cfaRate: 600,
    });
    expect(snap.arrivalCostCfa.toString()).toBe('7200000');

    // Damaged -> garage: painter 150,000 + parts 200,000.
    const lc = landedCost({
      arrivalCostCfa: snap.arrivalCostCfa,
      labourCfa: [150000],
      partsCfa: [200000],
    });
    expect(lc.landedCostCfa.toString()).toBe('7550000');

    // Sold at 9,000,000 CFA.
    expect(profitOf(9000000, lc.landedCostCfa).profit.toString()).toBe('1450000');
  });
});

describe('treasury', () => {
  it('keeps the wire fee out of the USD credited to the supplier', () => {
    const w = wireCfaCost(10000, 610, 25000);
    expect(w.principalCfa.toString()).toBe('6100000');
    expect(w.totalCfaOut.toString()).toBe('6125000'); // fee leaves my treasury
    expect(w.amountUsd.toString()).toBe('10000'); // supplier still credited exactly $10,000
  });

  it('converts a CFA payment into the USD credited to a freight account', () => {
    expect(usdCreditedForCfa(6100000, 610).toString()).toBe('10000');
  });

  it('lets a transfer company go negative when I overdraw it', () => {
    const bal = balanceOf(
      [{ amount: 30000000 }, { amount: -20000000 }, { amount: -15000000 }],
      'CFA',
    );
    expect(bal.toString()).toBe('-5000000'); // I owe the transfer company
  });

  it('shows a supplier owing me once I have overpaid him', () => {
    const bal = balanceOf([{ amount: 10800 }, { amount: -12000 }], 'USD');
    expect(bal.toString()).toBe('-1200');
  });
});

describe('exchange differences (Rule 6)', () => {
  it('is zero when I pay at the same rate the cost was locked at', () => {
    const fx = exchangeDifference([{ amountUsd: 10800, bookedRate: 600 }], [{ amountUsd: 10800, rate: 600 }]);
    expect(fx.differenceCfa.toString()).toBe('0');
  });

  it('reports a loss when the rate moved against me before I paid', () => {
    // Cost locked at 600, actually wired at 610 -> 10,000 x 10 = 100,000 CFA lost.
    const fx = exchangeDifference([{ amountUsd: 10000, bookedRate: 600 }], [{ amountUsd: 10000, rate: 610 }]);
    expect(fx.differenceCfa.toString()).toBe('100000');
  });

  it('reports a gain as a negative difference', () => {
    const fx = exchangeDifference([{ amountUsd: 10000, bookedRate: 600 }], [{ amountUsd: 10000, rate: 590 }]);
    expect(fx.differenceCfa.toString()).toBe('-100000');
  });

  it('settles a running account oldest charge first', () => {
    // Two cars at different locked rates; one partial wire covers the first
    // charge and half of the second.
    const fx = exchangeDifference(
      [
        { amountUsd: 10000, bookedRate: 600 },
        { amountUsd: 10000, bookedRate: 620 },
      ],
      [{ amountUsd: 15000, rate: 610 }],
    );
    // 10,000 x (610-600) = +100,000 ; 5,000 x (610-620) = -50,000
    expect(fx.differenceCfa.toString()).toBe('50000');
  });

  it('recognises nothing on cars that have not arrived yet', () => {
    const fx = exchangeDifference([{ amountUsd: 8000, bookedRate: null }], [{ amountUsd: 8000, rate: 615 }]);
    expect(fx.differenceCfa.toString()).toBe('0');
    expect(fx.unmatchedUsd.toString()).toBe('8000');
  });

  it('flags money wired beyond what is owed as an advance', () => {
    const fx = exchangeDifference([{ amountUsd: 5000, bookedRate: 600 }], [{ amountUsd: 8000, rate: 600 }]);
    expect(fx.advanceUsd.toString()).toBe('3000');
  });
});

describe('monthly report (Rule 3)', () => {
  it('charges a car to profit only in the month it is sold', () => {
    const r = monthlyPnl({
      salesCfa: [9000000, 6500000],
      costOfCarsSoldCfa: [7550000, 5800000],
      overheadCfa: [500000, 300000], // rent + showroom salary
      feesCfa: [25000],
      fxDifferenceCfa: 100000,
    });
    expect(r.grossProfitCfa.toString()).toBe('2150000');
    expect(r.netProfitCfa.toString()).toBe('1225000');
  });

  it('a month of pure deposits and purchases is NOT a loss', () => {
    // 30,000,000 CFA deposited and cars bought, nothing sold yet.
    // Deposits move my own money between pockets; they never touch profit.
    const r = monthlyPnl({ salesCfa: [], costOfCarsSoldCfa: [], overheadCfa: [500000] });
    expect(r.grossProfitCfa.toString()).toBe('0');
    expect(r.netProfitCfa.toString()).toBe('-500000'); // only the real overhead
  });
});
