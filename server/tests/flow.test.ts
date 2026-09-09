/**
 * END-TO-END: the whole business, once, through the real API and a real MySQL
 * database. Buy in Canada -> ship a container -> arrive and lock the rate ->
 * repair in the garage -> sell from the showroom -> pay the supplier.
 *
 * Every expected number here is the one written in the plan and agreed before
 * any code was written.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/lib/db.js';
import { hashPassword } from '../src/lib/auth.js';

let app: FastifyInstance;
let cookie: string;

const PASSWORD = 'Test-Showroom-2026!';

async function resetDatabase() {
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of [
    'LedgerEntry', 'SalePayment', 'Sale', 'RepairJob', 'RepairPart', 'OriginExpense',
    'Transaction', 'OverheadExpense', 'Car', 'Shipment', 'Party', 'AuditLog',
    'Session', 'RecoveryCode', 'User', 'Setting',
  ]) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${table}\``);
  }
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
}

/** Calls the API exactly as the browser would, session cookie and all. */
async function api(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, body?: unknown) {
  const response = await app.inject({
    method,
    url,
    ...(body ? { payload: body as object } : {}),
    headers: cookie ? { cookie } : {},
  });
  const json = response.json();
  if (response.statusCode >= 400) {
    throw new Error(`${method} ${url} -> ${response.statusCode}: ${JSON.stringify(json)}`);
  }
  return json;
}

beforeAll(async () => {
  await resetDatabase();
  await prisma.user.create({
    data: { username: 'owner', passwordHash: await hashPassword(PASSWORD) },
  });

  app = await buildApp();
  await app.ready();

  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: 'owner', password: PASSWORD },
  });
  expect(login.statusCode).toBe(200);
  cookie = login.headers['set-cookie']!.toString().split(';')[0];
}, 60000);

afterAll(async () => {
  await app?.close();
  await prisma.$disconnect();
});

describe('security', () => {
  it('refuses every business endpoint without a session', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/cars' });
    expect(response.statusCode).toBe(401);
  });

  it('refuses a wrong password without revealing whether the user exists', async () => {
    const wrongPassword = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'owner', password: 'not-the-password' },
    });
    const noSuchUser = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'nobody', password: 'not-the-password' },
    });
    expect(wrongPassword.statusCode).toBe(401);
    expect(noSuchUser.json()).toEqual(wrongPassword.json());
  });
});

describe('the business, end to end', () => {
  const ids = {
    supplier: 0, usaSupplier: 0, shipper: 0, transfer: 0, painter: 0, partsSupplier: 0,
    cla: 0, camry: 0, rav4: 0, shipment: 0,
  };

  it('sets up the accounts', async () => {
    ids.supplier = (
      await api('POST', '/api/parties', {
        type: 'CAR_SUPPLIER',
        name: 'Pierre Tremblay',
        companyName: 'Montreal Auto Wholesale',
        mobile: '+1 514 555 0110',
        country: 'CANADA',
        wholesaler: 'PRICE_PLUS_TAX',
      })
    ).id;

    ids.usaSupplier = (
      await api('POST', '/api/parties', {
        type: 'CAR_SUPPLIER',
        name: 'Mike Johnson',
        companyName: 'Texas Auto Auctions',
        country: 'USA',
      })
    ).id;

    ids.shipper = (
      await api('POST', '/api/parties', { type: 'SHIPPING_COMPANY', name: 'Atlantic Ro-Ro' })
    ).id;
    ids.transfer = (
      await api('POST', '/api/parties', { type: 'TRANSFER_COMPANY', name: 'Western Transfer' })
    ).id;
    ids.painter = (
      await api('POST', '/api/parties', { type: 'WORKER', name: 'Ibrahim', workerRole: 'GARAGE' })
    ).id;
    ids.partsSupplier = (
      await api('POST', '/api/parties', { type: 'PARTS_SUPPLIER', name: 'Pieces Auto Centre' })
    ).id;

    expect(ids.supplier).toBeGreaterThan(0);
  });

  it('refuses a Canadian supplier without saying how he invoices', async () => {
    await expect(
      api('POST', '/api/parties', { type: 'CAR_SUPPLIER', name: 'X', country: 'CANADA' }),
    ).rejects.toThrow(/price only.*price plus tax/i);
  });

  it('refuses tax on a USA purchase', async () => {
    await expect(
      api('POST', '/api/cars', {
        supplierId: ids.usaSupplier,
        makeName: 'Ford', modelName: 'Escape', year: 2019, color: 'White',
        vin: '1FMCU9GD5KUA12345',
        purchasePriceUsd: 8000, purchaseDate: '2026-01-05', taxUsd: 300,
      }),
    ).rejects.toThrow(/USA suppliers have no tax/i);
  });

  it('buys the Mercedes and applies the Canada tax rule', async () => {
    const car = await api('POST', '/api/cars', {
      supplierId: ids.supplier,
      makeName: 'Mercedes-Benz',
      modelName: 'CLA 300',
      year: 2019,
      color: 'Black',
      vin: 'WDDSJ4EB0KN712345',
      purchasePriceUsd: 10000,
      purchaseDate: '2026-01-10',
      taxUsd: 700,
      taxRefundMode: 'SUPPLIER_CREDIT',
      problemNote: 'Front bumper cracked, seller says it drives fine',
      originExpenses: [{ amountUsd: 300, note: 'Inland transport to port + seller fixed the wing mirror' }],
    });
    ids.cla = car.id;

    // $500 into the car's cost, $200 refundable — exactly "cost + 700 - 200".
    expect(car.taxCapitalizedUsd).toBe('500');
    expect(car.taxRefundableUsd).toBe('200');
  });

  it('refuses to guess how an over-threshold tax comes back', async () => {
    await expect(
      api('POST', '/api/cars', {
        supplierId: ids.supplier,
        makeName: 'Kia', modelName: 'Sorento', year: 2020, color: 'Grey',
        vin: '5XYPG4A38LG654321',
        purchasePriceUsd: 9000, purchaseDate: '2026-01-11', taxUsd: 900,
      }),
    ).rejects.toThrow(/credits it to your account or refunds it separately/i);
  });

  it('rejects a mistyped VIN before it reaches the database', async () => {
    await expect(
      api('POST', '/api/cars', {
        supplierId: ids.supplier,
        makeName: 'Toyota', modelName: 'Camry', year: 2020, color: 'Silver',
        vin: '4T1B11HK5LU12345', // 16 characters
        purchasePriceUsd: 9000, purchaseDate: '2026-01-11',
      }),
    ).rejects.toThrow(/17 characters/i);
  });

  it('charges everything to the supplier account, net of the tax credit', async () => {
    const statement = await api('GET', `/api/parties/${ids.supplier}/statement`);
    // 10,000 car + 700 tax + 300 expenses - 200 credited = 10,800
    expect(statement.closingBalance).toBe('10800');
    expect(statement.balanceLabel).toBe('You owe him');
    expect(statement.lines).toHaveLength(4);
  });

  it('buys two more cars for the same container', async () => {
    ids.camry = (
      await api('POST', '/api/cars', {
        supplierId: ids.usaSupplier,
        makeName: 'Toyota', modelName: 'Camry', year: 2020, color: 'Silver',
        vin: '4T1B11HK5LU123456',
        purchasePriceUsd: 9000, purchaseDate: '2026-01-12',
      })
    ).id;

    ids.rav4 = (
      await api('POST', '/api/cars', {
        supplierId: ids.usaSupplier,
        makeName: 'Toyota', modelName: 'RAV4', year: 2021, color: 'Blue',
        vin: '2T3P1RFV8MC123456',
        purchasePriceUsd: 12000, purchaseDate: '2026-01-12',
      })
    ).id;

    expect(await api('GET', `/api/parties/${ids.usaSupplier}/statement`)).toMatchObject({
      closingBalance: '21000',
    });
  });

  it('loads a container and splits the freight equally', async () => {
    const shipment = await api('POST', '/api/shipments', {
      reference: 'MSCU-7781234',
      shippingCompanyId: ids.shipper,
      freightCostUsd: 3600,
      carIds: [ids.cla, ids.camry, ids.rav4],
    });
    ids.shipment = shipment.id;

    const detail = await api('GET', `/api/shipments/${ids.shipment}`);
    expect(detail.cars.map((c: { freightShareUsd: string }) => c.freightShareUsd)).toEqual([
      '1200', '1200', '1200',
    ]);
  });

  it('refuses manual shares that do not add up to the freight invoice', async () => {
    await expect(
      api('POST', `/api/shipments/${ids.shipment}/shares`, {
        shares: [
          { carId: ids.cla, amountUsd: 1200 },
          { carId: ids.camry, amountUsd: 1200 },
          { carId: ids.rav4, amountUsd: 1000 },
        ],
      }),
    ).rejects.toThrow(/\$200 missing/i);
  });

  it('will not let a car be marked damaged before it has arrived', async () => {
    await expect(
      api('POST', `/api/cars/${ids.cla}/arrival-condition`, { damaged: true, driveAndRun: false }),
    ).rejects.toThrow(/not been marked as arrived/i);
  });

  it('sails, arrives, and locks one rate onto every car in the container', async () => {
    await api('POST', `/api/shipments/${ids.shipment}/ship`, { departureDate: '2026-01-20' });
    await api('POST', `/api/shipments/${ids.shipment}/arrive`, {
      cfaRate: 600,
      arrivalDate: '2026-02-15',
    });

    const car = await api('GET', `/api/cars/${ids.cla}`);
    // (10,000 + 300 + 500 + 1,200) x 600 = 7,200,000
    expect(car.costs.cfa.purchaseCfa).toBe('6000000');
    expect(car.costs.cfa.originExpensesCfa).toBe('180000');
    expect(car.costs.cfa.taxCapitalizedCfa).toBe('300000');
    expect(car.costs.cfa.freightCfa).toBe('720000');
    expect(car.costs.cfa.arrivalCostCfa).toBe('7200000');
    expect(car.status).toBe('ARRIVED');

    // The freight invoice landed on the shipping company's USD account.
    expect(await api('GET', `/api/parties/${ids.shipper}/statement`)).toMatchObject({
      closingBalance: '3600',
    });
  });

  it('refuses to change a cost once it is frozen', async () => {
    await expect(
      api('PATCH', `/api/cars/${ids.cla}`, { purchasePriceUsd: 11000 }),
    ).rejects.toThrow(/already arrived and its cost is locked/i);
  });

  it('sends the damaged car to the garage and the sound ones to the showroom', async () => {
    await api('POST', `/api/cars/${ids.cla}/arrival-condition`, {
      damaged: true,
      driveAndRun: true,
      arrivalNote: 'Bumper and left wing need work; engine fine',
    });
    await api('POST', `/api/cars/${ids.camry}/arrival-condition`, { damaged: false, driveAndRun: true });
    await api('POST', `/api/cars/${ids.rav4}/arrival-condition`, { damaged: false, driveAndRun: true });

    expect((await api('GET', '/api/garage')).map((c: { id: number }) => c.id)).toEqual([ids.cla]);
    expect(await api('GET', '/api/showroom')).toHaveLength(2);
  });

  it('repairs the car, charging the worker and the parts supplier', async () => {
    await api('POST', `/api/cars/${ids.cla}/repairs/jobs`, {
      serviceType: 'PAINTER',
      workerId: ids.painter,
      labourCostCfa: 150000,
      description: 'Bumper and left wing repainted',
      date: '2026-02-20',
    });
    await api('POST', `/api/cars/${ids.cla}/repairs/parts`, {
      description: 'Front bumper + left mirror glass',
      costCfa: 200000,
      partsSupplierId: ids.partsSupplier,
      date: '2026-02-20',
    });

    // Each of them is now owed, without a franc having moved yet.
    expect(await api('GET', `/api/parties/${ids.painter}/statement`)).toMatchObject({
      closingBalance: '150000',
      balanceLabel: 'You owe him',
    });
    expect(await api('GET', `/api/parties/${ids.partsSupplier}/statement`)).toMatchObject({
      closingBalance: '200000',
    });

    const finished = await api('POST', `/api/cars/${ids.cla}/repairs/finish`, {
      askingPriceCfa: 9000000,
    });
    // 7,200,000 frozen at arrival + 350,000 of repairs
    expect(finished.costs.landedCostCfa).toBe('7550000');
  });

  it('sells the car and reports the agreed profit', async () => {
    const result = await api('POST', `/api/cars/${ids.cla}/sell`, {
      channel: 'LOCAL',
      price: 9000000,
      saleDate: '2026-02-28',
      buyerName: 'Amadou Diallo',
      buyerMobile: '+221 77 123 4567',
      initialPayment: 5000000,
      paymentMethod: 'cash',
    });

    expect(result.profit.profit).toBe('1450000');
    expect(result.profit.marginPct).toBe('19.21');

    const [sale] = await api('GET', '/api/sales');
    expect(sale.paid).toBe('5000000');
    expect(sale.remaining).toBe('4000000');
  });

  it('refuses an instalment bigger than what is still owed', async () => {
    const [sale] = await api('GET', '/api/sales');
    await expect(
      api('POST', `/api/sales/${sale.id}/payments`, { amount: 5000000, date: '2026-03-05' }),
    ).rejects.toThrow(/more than the 4000000/i);
  });

  it('takes the rest of the money', async () => {
    const [sale] = await api('GET', '/api/sales');
    const result = await api('POST', `/api/sales/${sale.id}/payments`, {
      amount: 4000000,
      date: '2026-03-05',
      method: 'transfer',
    });
    expect(result.remaining).toBe('0');
  });
});

describe('treasury and the monthly report', () => {
  it('a deposit moves money without touching profit', async () => {
    const [transfer] = await api('GET', '/api/parties?type=TRANSFER_COMPANY');
    await api('POST', '/api/treasury/deposit', {
      transferCompanyId: transfer.id,
      amountCfa: 30000000,
      date: '2026-02-01',
      note: 'Cash from sales',
    });

    const overview = await api('GET', '/api/treasury/overview');
    expect(overview.totalAvailableCfa).toBe('30000000');

    // February: nothing was sold yet at deposit time, but the deposit itself
    // must not appear anywhere in the profit calculation.
    const february = await api('GET', '/api/reports/monthly?year=2026&month=2');
    expect(february.salesCfa).toBe('9000000'); // the CLA, sold on the 28th
    expect(february.costOfCarsSoldCfa).toBe('7550000');
    expect(february.grossProfitCfa).toBe('1450000');
  });

  it('wires USD to the supplier and clears his balance', async () => {
    const [transfer] = await api('GET', '/api/parties?type=TRANSFER_COMPANY');
    const suppliers = await api('GET', '/api/parties?type=CAR_SUPPLIER');
    const canadian = suppliers.find((s: { country: string }) => s.country === 'CANADA');

    const { breakdown } = await api('POST', '/api/treasury/wire', {
      transferCompanyId: transfer.id,
      supplierId: canadian.id,
      amountUsd: 10800,
      rate: 610,
      feeCfa: 25000,
      date: '2026-02-25',
      note: 'Settling the CLA',
    });

    // The commission leaves my treasury but never inflates what he received.
    expect(breakdown.principalCfa).toBe('6588000');
    expect(breakdown.totalCfaOut).toBe('6613000');

    expect(await api('GET', `/api/parties/${canadian.id}/statement`)).toMatchObject({
      closingBalance: '0',
      balanceLabel: 'Settled',
    });

    // 30,000,000 - 6,588,000 - 25,000
    expect(await api('GET', '/api/treasury/overview')).toMatchObject({
      totalAvailableCfa: '23387000',
    });
  });

  it('reports the exchange loss without touching the car cost', async () => {
    const suppliers = await api('GET', '/api/parties?type=CAR_SUPPLIER');
    const canadian = suppliers.find((s: { country: string }) => s.country === 'CANADA');

    // Cost was locked at 600; the money was wired at 610.
    const fx = await api('GET', `/api/reports/exchange-difference/${canadian.id}`);
    expect(fx.differenceCfa).toBe('108000');

    // And the car itself is untouched.
    const car = await api('GET', '/api/reports/inventory');
    expect(car.find((c: { vin: string }) => c.vin === 'WDDSJ4EB0KN712345')).toBeUndefined();
  });

  it('subtracts overhead only at the bottom of the month', async () => {
    await api('POST', '/api/overhead', {
      category: 'RENT',
      amountCfa: 500000,
      date: '2026-02-05',
      note: 'Showroom rent',
    });

    const february = await api('GET', '/api/reports/monthly?year=2026&month=2');
    expect(february.grossProfitCfa).toBe('1450000');
    expect(february.overheadCfa).toBe('500000');
    expect(february.feesCfa).toBe('25000');
    expect(february.fxDifferenceCfa).toBe('108000');
    // 1,450,000 - 500,000 - 25,000 - 108,000
    expect(february.netProfitCfa).toBe('817000');
  });

  it('a month of only buying and depositing is not a loss', async () => {
    const january = await api('GET', '/api/reports/monthly?year=2026&month=1');
    expect(january.salesCfa).toBe('0');
    expect(january.costOfCarsSoldCfa).toBe('0');
    expect(january.netProfitCfa).toBe('0');
  });
});

describe('a car bought and sold in the USA', () => {
  it('settles inside the supplier account and never converts to CFA', async () => {
    const suppliers = await api('GET', '/api/parties?type=CAR_SUPPLIER');
    const american = suppliers.find((s: { country: string }) => s.country === 'USA');

    const before = await api('GET', `/api/parties/${american.id}/statement`);

    const car = await api('POST', '/api/cars', {
      supplierId: american.id,
      makeName: 'Honda', modelName: 'Accord', year: 2018, color: 'Red',
      vin: '1HGCV1F34JA123456',
      purchasePriceUsd: 7000,
      purchaseDate: '2026-03-01',
    });

    const result = await api('POST', `/api/cars/${car.id}/sell`, {
      channel: 'ORIGIN',
      price: 8500,
      saleDate: '2026-03-10',
      buyerName: 'Dallas dealer',
    });

    expect(result.profit.profit).toBe('1500'); // 8,500 - 7,000, in USD
    const after = await api('GET', `/api/parties/${american.id}/statement`);
    // The proceeds came off what I owe him: +7,000 for the car, -8,500 for the sale.
    expect(Number(after.closingBalance)).toBe(Number(before.closingBalance) - 1500);

    const sold = await api('GET', `/api/cars/${car.id}`);
    expect(sold.status).toBe('SOLD_IN_ORIGIN');
    expect(sold.costs.cfa).toBeNull(); // never converted
  });
});

describe('the audit trail', () => {
  it('records who did what', async () => {
    const entries = await api('GET', '/api/audit?entity=Car');
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].user.username).toBe('owner');
  });
});

describe('guards found while reviewing the code', () => {
  let shipmentId = 0;
  let carA = 0;
  let carB = 0;
  let shipperId = 0;

  it('sets up a fresh draft shipment', async () => {
    const suppliers = await api('GET', '/api/parties?type=CAR_SUPPLIER');
    const american = suppliers.find((s: { country: string }) => s.country === 'USA');
    [{ id: shipperId }] = await api('GET', '/api/parties?type=SHIPPING_COMPANY');

    carA = (
      await api('POST', '/api/cars', {
        supplierId: american.id,
        makeName: 'Nissan', modelName: 'Rogue', year: 2019, color: 'White',
        vin: '5N1AT2MV8KC123456',
        purchasePriceUsd: 7500, purchaseDate: '2026-04-01',
      })
    ).id;
    carB = (
      await api('POST', '/api/cars', {
        supplierId: american.id,
        makeName: 'Ford', modelName: 'Escape', year: 2020, color: 'Grey',
        vin: '1FMCU9G67LU123456',
        purchasePriceUsd: 8500, purchaseDate: '2026-04-01',
      })
    ).id;

    shipmentId = (
      await api('POST', '/api/shipments', {
        reference: 'TEST-CONTAINER-2',
        shippingCompanyId: shipperId,
        freightCostUsd: 2000,
        carIds: [carA, carB],
      })
    ).id;
    expect(shipmentId).toBeGreaterThan(0);
  });

  it('refuses freight shares that leave a car out, even when the total matches', async () => {
    await expect(
      api('POST', `/api/shipments/${shipmentId}/shares`, {
        shares: [{ carId: carA, amountUsd: 2000 }],
      }),
    ).rejects.toThrow(/share for every car/i);
  });

  it('refuses a share for a car that is not on the shipment', async () => {
    await expect(
      api('POST', `/api/shipments/${shipmentId}/shares`, {
        shares: [
          { carId: carA, amountUsd: 1000 },
          { carId: 99999, amountUsd: 1000 },
        ],
      }),
    ).rejects.toThrow(/not on this shipment/i);
  });

  it('accepts an uneven split that still adds up', async () => {
    const result = await api('POST', `/api/shipments/${shipmentId}/shares`, {
      shares: [
        { carId: carA, amountUsd: 1300 }, // the bigger car took more space
        { carId: carB, amountUsd: 700 },
      ],
    });
    expect(result.cars.map((c: { freightShareUsd: string }) => c.freightShareUsd).sort()).toEqual([
      '1300', '700',
    ]);
  });

  it('will not sell a car abroad while it is loaded on a shipment', async () => {
    await expect(
      api('POST', `/api/cars/${carA}/sell`, {
        channel: 'ORIGIN',
        price: 9000,
        saleDate: '2026-04-05',
        buyerName: 'Someone',
      }),
    ).rejects.toThrow(/already loaded onto a shipment/i);
  });

  it('debits the treasury exactly what was handed over when freight is paid in CFA', async () => {
    const [transfer] = await api('GET', '/api/parties?type=TRANSFER_COMPANY');
    const before = await api('GET', `/api/parties/${transfer.id}/statement`);

    // A rate that does not divide evenly: 1,000,000 / 613 is not a round number
    // of dollars, so a naive round-trip through USD would drift.
    const result = await api('POST', '/api/treasury/pay-shipping', {
      shippingCompanyId: shipperId,
      transferCompanyId: transfer.id,
      payCurrency: 'CFA',
      amount: 1000000,
      rate: 613,
      date: '2026-04-06',
    });

    const after = await api('GET', `/api/parties/${transfer.id}/statement`);
    expect(Number(before.closingBalance) - Number(after.closingBalance)).toBe(1000000);
    expect(result.amountUsd).toBe('1631.32'); // 1,000,000 / 613
  });
});
