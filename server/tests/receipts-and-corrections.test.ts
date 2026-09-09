/**
 * The two changes agreed with the owner:
 *
 *  1. A customer's payment lands in the cash box by itself. Selling a car and
 *     recording the money are one action, not two, so the cash can never be
 *     counted twice or forgotten.
 *  2. A cost recorded wrongly is corrected, never deleted. The original line
 *     stays, a correction sits beside it with a reason, and the profit follows.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/lib/db.js';
import { hashPassword } from '../src/lib/auth.js';

let app: FastifyInstance;
let cookie: string;
const PASSWORD = 'Test-Showroom-2026';

async function resetDatabase() {
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of [
    'LedgerEntry', 'SalePayment', 'Sale', 'RepairJob', 'RepairPart', 'OriginExpense',
    'CostAdjustment', 'Transaction', 'OverheadExpense', 'Car', 'Shipment', 'Party',
    'AuditLog', 'Session', 'RecoveryCode', 'User', 'Setting',
  ]) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${table}\``);
  }
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
}

async function api(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, body?: unknown) {
  const response = await app.inject({
    method, url, ...(body ? { payload: body as object } : {}), headers: cookie ? { cookie } : {},
  });
  const json = response.json();
  if (response.statusCode >= 400)
    throw new Error(`${method} ${url} -> ${response.statusCode}: ${JSON.stringify(json)}`);
  return json;
}

const ids = {
  supplier: 0, shipper: 0, cashBox: 0, transferCo: 0, painter: 0, parts: 0, car: 0, sale: 0,
};

/** Buys a car, ships it, lands it at rate 600 and puts it in the showroom. */
async function carInShowroom(vin: string, priceUsd: number, freightUsd: number) {
  const car = await api('POST', '/api/cars', {
    supplierId: ids.supplier,
    makeName: 'Toyota', modelName: 'Corolla', year: 2020, color: 'White',
    vin, purchasePriceUsd: priceUsd, purchaseDate: '2026-01-10',
  });
  const shipment = await api('POST', `/api/cars/${car.id}/ship`, {
    reference: `Container ${vin.slice(-5)}`,
    shippingCompanyId: ids.shipper,
    departureDate: '2026-01-20',
  });
  await api('POST', `/api/shipments/${shipment.id}/arrive`, {
    cfaRate: 600, freightCostUsd: freightUsd, arrivalDate: '2026-02-15',
  });
  await api('POST', `/api/cars/${car.id}/arrival-condition`, { damaged: false, driveAndRun: true });
  return car.id;
}

beforeAll(async () => {
  await resetDatabase();
  await prisma.user.create({ data: { username: 'owner', passwordHash: await hashPassword(PASSWORD) } });
  app = await buildApp();
  await app.ready();
  const login = await app.inject({
    method: 'POST', url: '/api/auth/login', payload: { username: 'owner', password: PASSWORD },
  });
  cookie = login.headers['set-cookie']!.toString().split(';')[0];

  ids.supplier = (await api('POST', '/api/parties', {
    type: 'CAR_SUPPLIER', name: 'Mike Johnson', country: 'USA',
  })).id;
  ids.shipper = (await api('POST', '/api/parties', {
    type: 'SHIPPING_COMPANY', name: 'Atlantic Ro-Ro',
  })).id;
  ids.cashBox = (await api('POST', '/api/parties', {
    type: 'TRANSFER_COMPANY', name: 'Cash box',
  })).id;
  ids.transferCo = (await api('POST', '/api/parties', {
    type: 'TRANSFER_COMPANY', name: 'Western Transfer',
  })).id;
  ids.painter = (await api('POST', '/api/parties', {
    type: 'WORKER', name: 'Ibrahim', workerRole: 'GARAGE',
  })).id;
  ids.parts = (await api('POST', '/api/parties', {
    type: 'PARTS_SUPPLIER', name: 'Pieces Auto',
  })).id;
  await api('PATCH', '/api/settings', { defaultCashAccountId: ids.cashBox });
}, 60000);

afterAll(async () => {
  await app?.close();
  await prisma.$disconnect();
});

describe('a customer pays: the money arrives by itself', () => {
  it('puts the money in the cash box the moment the car is sold', async () => {
    ids.car = await carInShowroom('4T1B11HK5LU100001', 9000, 1200);

    const before = await api('GET', `/api/parties/${ids.cashBox}/statement`);
    expect(before.closingBalance).toBe('0');

    const result = await api('POST', `/api/cars/${ids.car}/sell`, {
      channel: 'LOCAL',
      price: 9000000,
      saleDate: '2026-03-01',
      buyerName: 'Amadou Diallo',
      initialPayment: 4000000,
      paymentMethod: 'cash',
    });
    ids.sale = result.sale.id;

    // No separate deposit was recorded, yet the cash box holds the money.
    const after = await api('GET', `/api/parties/${ids.cashBox}/statement`);
    expect(after.closingBalance).toBe('4000000');
    expect(after.lines.at(-1).kind).toBe('SALE_RECEIPT');
  });

  it('adds each instalment to the cash box as it comes in', async () => {
    await api('POST', `/api/sales/${ids.sale}/payments`, {
      amount: 3000000, date: '2026-03-10', method: 'cash',
    });
    expect(await api('GET', `/api/parties/${ids.cashBox}/statement`)).toMatchObject({
      closingBalance: '7000000',
    });
  });

  it('can send a payment to a different account when it was not cash', async () => {
    await api('POST', `/api/sales/${ids.sale}/payments`, {
      amount: 2000000,
      date: '2026-03-15',
      method: 'transfer',
      destinationAccountId: ids.transferCo,
    });
    expect(await api('GET', `/api/parties/${ids.cashBox}/statement`)).toMatchObject({
      closingBalance: '7000000', // unchanged
    });
    expect(await api('GET', `/api/parties/${ids.transferCo}/statement`)).toMatchObject({
      closingBalance: '2000000',
    });
  });

  it('refuses to put money anywhere but a cash or transfer account', async () => {
    const car = await carInShowroom('4T1B11HK5LU100002', 5000, 500);
    await expect(
      api('POST', `/api/cars/${car}/sell`, {
        channel: 'LOCAL', price: 6000000, saleDate: '2026-03-02', buyerName: 'X',
        initialPayment: 1000000, destinationAccountId: ids.painter,
      }),
    ).rejects.toThrow(/cash box or a transfer company/i);
  });

  it('moves a sale from the owing list to the paid list on its own', async () => {
    const sales = await api('GET', '/api/sales');
    const sale = sales.find((s: { id: number }) => s.id === ids.sale);
    expect(sale.remaining).toBe('0');
    expect(sale.settled).toBe(true);

    const other = sales.find((s: { id: number }) => s.id !== ids.sale);
    if (other) expect(other.settled).toBe(false);
  });
});

describe('moving money between my own accounts', () => {
  it('does not create money out of nowhere', async () => {
    const before = await api('GET', '/api/treasury/overview');

    await api('POST', '/api/treasury/transfer', {
      fromAccountId: ids.cashBox,
      toAccountId: ids.transferCo,
      amountCfa: 5000000,
      date: '2026-03-20',
      note: 'To pay the supplier',
    });

    const after = await api('GET', '/api/treasury/overview');
    // The total I hold is unchanged; only where it sits has changed.
    expect(after.totalAvailableCfa).toBe(before.totalAvailableCfa);
    expect(await api('GET', `/api/parties/${ids.cashBox}/statement`)).toMatchObject({
      closingBalance: '2000000',
    });
  });

  it('charges a transfer fee to the sending account as a real cost', async () => {
    const before = await api('GET', '/api/treasury/overview');
    await api('POST', '/api/treasury/transfer', {
      fromAccountId: ids.transferCo, toAccountId: ids.cashBox,
      amountCfa: 1000000, feeCfa: 15000, date: '2026-03-21',
    });
    const after = await api('GET', '/api/treasury/overview');
    expect(Number(before.totalAvailableCfa) - Number(after.totalAvailableCfa)).toBe(15000);
  });

  it('refuses a transfer to the same account', async () => {
    await expect(
      api('POST', '/api/treasury/transfer', {
        fromAccountId: ids.cashBox, toAccountId: ids.cashBox,
        amountCfa: 1000, date: '2026-03-22',
      }),
    ).rejects.toThrow(/two different accounts/i);
  });
});

describe('correcting a cost after the car is sold', () => {
  let carId = 0;

  it('sets up a car with a repair that was recorded twice', async () => {
    carId = await carInShowroom('4T1B11HK5LU100003', 8000, 1000);
    // Send it to the garage instead by marking it damaged.
    await prisma.car.update({ where: { id: carId }, data: { status: 'IN_GARAGE', damaged: true } });

    await api('POST', `/api/cars/${carId}/repairs/jobs`, {
      serviceType: 'PAINTER', workerId: ids.painter, labourCostCfa: 100000,
      description: 'Repaint', date: '2026-03-01',
    });
    await api('POST', `/api/cars/${carId}/repairs/jobs`, {
      serviceType: 'PAINTER', workerId: ids.painter, labourCostCfa: 100000,
      description: 'Repaint (entered twice by mistake)', date: '2026-03-01',
    });
    await api('POST', `/api/cars/${carId}/repairs/finish`, { askingPriceCfa: 7000000 });

    const car = await api('GET', `/api/cars/${carId}`);
    // (8,000 + 1,000) x 600 = 5,400,000, plus 200,000 of repairs
    expect(car.costs.landedCostCfa).toBe('5600000');
  });

  it('sells it, so the mistake is now inside a reported profit', async () => {
    const result = await api('POST', `/api/cars/${carId}/sell`, {
      channel: 'LOCAL', price: 7000000, saleDate: '2026-03-25', buyerName: 'Fatou Sow',
    });
    expect(result.profit.profit).toBe('1400000'); // understated by the double entry
  });

  it('will not let the wrong repair simply be deleted', async () => {
    const car = await api('GET', `/api/cars/${carId}`);
    await expect(api('DELETE', `/api/repairs/jobs/${car.repairJobs[1].id}`)).rejects.toThrow();
  });

  it('corrects the cost instead, keeping the original line and the reason', async () => {
    const result = await api('POST', `/api/cars/${carId}/cost-adjustments`, {
      amountCfa: -100000,
      reason: 'The repaint was entered twice on 1 March',
      partyId: ids.painter,
      date: '2026-04-02',
    });

    expect(result.costs.landedCostCfa).toBe('5500000');
    expect(result.costs.adjustmentsCfa).toBe('-100000');

    // The original repairs are both still there, untouched.
    const car = await api('GET', `/api/cars/${carId}`);
    expect(car.repairJobs).toHaveLength(2);
    expect(car.costs.repairsCfa).toBe('200000');
  });

  it('shows the corrected profit everywhere it is reported', async () => {
    const sales = await api('GET', '/api/sales');
    const sale = sales.find((s: { carId: number }) => s.carId === carId);
    expect(sale.profit.profit).toBe('1500000'); // was 1,400,000

    const report = await api('GET', '/api/reports/monthly?year=2026&month=3');
    const line = report.lines.find((l: { carId: number }) => l.carId === carId);
    expect(line.cost).toBe('5500000');
    expect(line.profit).toBe('1500000');
  });

  it('also corrects what the worker is owed, in the same breath', async () => {
    const statement = await api('GET', `/api/parties/${ids.painter}/statement`);
    // 100,000 + 100,000 charged, then 100,000 corrected away.
    expect(statement.closingBalance).toBe('100000');
    expect(statement.lines.at(-1).kind).toBe('ADJUSTMENT');
    expect(statement.lines.at(-1).description).toContain('entered twice');
  });

  it('insists on a reason', async () => {
    await expect(
      api('POST', `/api/cars/${carId}/cost-adjustments`, { amountCfa: -1000, reason: 'x' }),
    ).rejects.toThrow(/why this correction/i);
  });

  it('refuses a correction that would take the cost below zero', async () => {
    await expect(
      api('POST', `/api/cars/${carId}/cost-adjustments`, {
        amountCfa: -99000000, reason: 'A mistake in the correction itself',
      }),
    ).rejects.toThrow(/cost to -/i);
  });

  it('keeps every correction on the record', async () => {
    const list = await api('GET', `/api/cars/${carId}/cost-adjustments`);
    expect(list).toHaveLength(1);
    expect(list[0].reason).toContain('entered twice');
  });
});

describe('grouping cars into one shipment', () => {
  let carA = 0;
  let carB = 0;
  let carC = 0;
  let shipmentId = 0;

  const buy = async (vin: string, model: string, price: number) =>
    (await api('POST', '/api/cars', {
      supplierId: ids.supplier,
      makeName: 'Ford', modelName: model, year: 2021, color: 'Blue',
      vin, purchasePriceUsd: price, purchaseDate: '2026-05-01',
    })).id;

  it('starts a shipment with a name you choose', async () => {
    carA = await buy('1FMCU9G61MU200001', 'Escape', 6000);

    const shipment = await api('POST', `/api/cars/${carA}/ship`, {
      reference: 'February container',
      shippingCompanyId: ids.shipper,
      departureDate: '2026-05-05',
    });
    shipmentId = shipment.id;

    expect(shipment.reference).toBe('February container');
    expect(shipment.status).toBe('SHIPPED');
    // Freight is not known yet, so nothing is guessed.
    expect(shipment.freightCostUsd).toBe('0');
  });

  it('refuses to start one without a name — there would be no way to find it again', async () => {
    const car = await buy('1FMCU9G61MU200009', 'Edge', 4000);
    await expect(
      api('POST', `/api/cars/${car}/ship`, { shippingCompanyId: ids.shipper }),
    ).rejects.toThrow(/give this shipment a name/i);
  });

  it('offers that shipment as open for more cars', async () => {
    const open = await api('GET', '/api/shipments/open');
    const found = open.find((s: { id: number }) => s.id === shipmentId);
    expect(found.reference).toBe('February container');
    expect(found.cars).toHaveLength(1);
  });

  it('adds a car bought later to the same group', async () => {
    carB = await buy('1FMCU9G61MU200002', 'Explorer', 7000);
    const shipment = await api('POST', `/api/cars/${carB}/ship`, { shipmentId });
    expect(shipment.id).toBe(shipmentId);
    expect(shipment.cars).toHaveLength(2);
  });

  it('adds several at once when they are loaded together', async () => {
    carC = await buy('1FMCU9G61MU200003', 'Bronco', 9000);
    const extra = await buy('1FMCU9G61MU200004', 'Ranger', 5000);
    const shipment = await api('POST', `/api/cars/${carC}/ship`, {
      shipmentId, alsoCarIds: [extra],
    });
    expect(shipment.cars).toHaveLength(4);
  });

  it('enters the freight when the cars land, not before', async () => {
    const result = await api('POST', `/api/shipments/${shipmentId}/arrive`, {
      cfaRate: 600,
      freightCostUsd: 4000,      // the invoice, known only now
      arrivalDate: '2026-06-15',
    });
    expect(result.freightCostUsd).toBe('4000');
    // 4,000 across four cars
    expect(result.cars.every((c: { freightShareUsd: string }) => c.freightShareUsd === '1000')).toBe(true);

    // (6,000 + 1,000) x 600
    const landed = await api('GET', `/api/cars/${carA}`);
    expect(landed.costs.cfa.arrivalCostCfa).toBe('4200000');
  });

  it('puts the freight on the shipping company account as owed, not paid', async () => {
    const statement = await api('GET', `/api/parties/${ids.shipper}/statement`);
    expect(Number(statement.closingBalance)).toBeGreaterThanOrEqual(4000);
    expect(statement.balanceLabel).toBe('You owe him');
    const line = statement.lines.find((l: { kind: string; amount: string }) =>
      l.kind === 'FREIGHT_INVOICE' && l.amount === '4000');
    expect(line.description).toContain('Ford Escape');
  });

  it('refuses to arrive a shipment with no freight entered', async () => {
    const car = await buy('1FMCU9G61MU200005', 'Fusion', 3000);
    const shipment = await api('POST', `/api/cars/${car}/ship`, {
      reference: 'March container', shippingCompanyId: ids.shipper,
    });
    await expect(
      api('POST', `/api/shipments/${shipment.id}/arrive`, { cfaRate: 600 }),
    ).rejects.toThrow(/enter the freight invoice/i);
  });

  it('splits the freight unevenly when the big car took more space', async () => {
    const big = await buy('1FMCU9G61MU200006', 'Expedition', 12000);
    const small = await buy('1FMCU9G61MU200007', 'Fiesta', 3000);
    const shipment = await api('POST', `/api/cars/${big}/ship`, {
      reference: 'April container', shippingCompanyId: ids.shipper, alsoCarIds: [small],
    });

    await expect(
      api('POST', `/api/shipments/${shipment.id}/arrive`, {
        cfaRate: 600, freightCostUsd: 2000,
        shares: [{ carId: big, amountUsd: 1400 }, { carId: small, amountUsd: 500 }],
      }),
    ).rejects.toThrow(/\$100 missing/i);

    await api('POST', `/api/shipments/${shipment.id}/arrive`, {
      cfaRate: 600, freightCostUsd: 2000,
      shares: [{ carId: big, amountUsd: 1400 }, { carId: small, amountUsd: 600 }],
    });

    const landedBig = await api('GET', `/api/cars/${big}`);
    expect(landedBig.freightShareUsd).toBe('1400');
    expect(landedBig.costs.cfa.arrivalCostCfa).toBe('8040000'); // (12,000 + 1,400) x 600
  });

  it('will not add a car to a shipment that already arrived', async () => {
    const late = await buy('1FMCU9G61MU200008', 'Maverick', 4000);
    await expect(
      api('POST', `/api/cars/${late}/ship`, { shipmentId }),
    ).rejects.toThrow(/already arrived/i);
  });

  it('refuses to ship a car that is already on a shipment', async () => {
    await expect(
      api('POST', `/api/cars/${carA}/ship`, { shipmentId }),
    ).rejects.toThrow(/already on a shipment/i);
  });
});

describe('finding a car', () => {
  it('searches the showroom by brand and by supplier', async () => {
    const all = await api('GET', '/api/showroom');
    expect(all.length).toBeGreaterThan(0);

    const byBrand = await api('GET', '/api/showroom?search=Toyota');
    expect(byBrand.every((c: { makeName: string }) => c.makeName === 'Toyota')).toBe(true);

    const bySupplier = await api('GET', '/api/showroom?search=Mike');
    expect(bySupplier.length).toBeGreaterThan(0);

    expect(await api('GET', '/api/showroom?search=Lamborghini')).toHaveLength(0);
  });

  it('searches all cars by supplier name too', async () => {
    const bySupplier = await api('GET', '/api/cars?search=Mike');
    expect(bySupplier.length).toBeGreaterThan(0);
    expect(bySupplier.every((c: { supplier: { name: string } }) => c.supplier.name.includes('Mike'))).toBe(true);
  });
});

describe('the arrival preview', () => {
  it('sends each car full cost, so the preview cannot understate what it will land at', async () => {
    // Caught in a browser run: the preview showed only the freight, so a car
    // about to cost 6,039,000 was previewed at 854,000.
    const car = await api('POST', '/api/cars', {
      supplierId: ids.supplier,
      makeName: 'Toyota', modelName: 'Hilux', year: 2023, color: 'White',
      vin: '5TFAX5GN0LX100001', purchasePriceUsd: 8500, purchaseDate: '2026-07-01',
    });
    const created = await api('POST', `/api/cars/${car.id}/ship`, {
      reference: 'Preview container', shippingCompanyId: ids.shipper,
    });
    // Freight is entered at arrival now, so the preview reads it from the form,
    // not from the shipment. What matters is that the car's own cost is sent.
    const withShipment = await api('GET', `/api/cars/${car.id}`);
    expect(created.id).toBe(withShipment.shipment.id);
    const shipment = await api('GET', `/api/shipments/${withShipment.shipment.id}`);
    const onBoard = shipment.cars[0];

    expect(onBoard.costs.usd.totalCostUsd).toBe('8500');

    // What the preview multiplies out, and what arrival then actually locks.
    const previewed = Math.round((Number(onBoard.costs.usd.totalCostUsd) + 1400) * 610);
    expect(previewed).toBe(6039000);

    await api('POST', `/api/shipments/${withShipment.shipment.id}/arrive`, {
      cfaRate: 610, freightCostUsd: 1400,
    });
    const landed = await api('GET', `/api/cars/${car.id}`);
    expect(landed.costs.cfa.arrivalCostCfa).toBe(String(previewed));
  });
});
