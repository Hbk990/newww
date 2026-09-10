/**
 * The features added for the showroom itself:
 *
 *  1. A buyer can hold a car with a deposit. The cash is real and lands in an
 *     account at once, but it is not profit, and when the sale happens it must
 *     count towards the price without being collected a second time.
 *  2. Photos are evidence. What is uploaded has to actually be an image, and an
 *     arrival photo on a sold car cannot be quietly deleted.
 *  3. The analysis pages have to agree with the ledger they are drawn from.
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
    'CostAdjustment', 'Transaction', 'OverheadExpense', 'CarPhoto', 'Reservation',
    'Car', 'Shipment', 'Party', 'AuditLog', 'Session', 'RecoveryCode', 'User', 'Setting',
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

/** A multipart upload, built by hand because there is no browser here. */
async function upload(carId: number, kind: string, content: Buffer, fileName: string) {
  const boundary = '----showroomtest';
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="kind"\r\n\r\n${kind}\r\n`),
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="${fileName}"\r\n` +
        'Content-Type: application/octet-stream\r\n\r\n',
    ),
    content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return app.inject({
    method: 'POST',
    url: `/api/cars/${carId}/photos`,
    payload,
    headers: { cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
  });
}

/** The smallest real PNG: an 8-byte signature is what the server checks. */
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 7),
]);

const ids = { usa: 0, canada: 0, shipper: 0, cashBox: 0, transferCo: 0, painter: 0, parts: 0 };

/**
 * Buys a car from a supplier, ships it with a quoted freight, lands it at the
 * given rate and puts it in the showroom with an asking price.
 */
async function carInShowroom(options: {
  supplierId: number;
  vin: string;
  priceUsd: number;
  quotedUsd: number;
  freightUsd: number;
  rate: number;
  asking: number;
  damaged?: boolean;
  arrivalDate?: string;
}) {
  const car = await api('POST', '/api/cars', {
    supplierId: options.supplierId,
    makeName: 'Toyota', modelName: 'Corolla', year: 2020, color: 'White',
    vin: options.vin, purchasePriceUsd: options.priceUsd, purchaseDate: '2026-01-10',
  });
  const shipment = await api('POST', `/api/cars/${car.id}/ship`, {
    reference: `Container ${options.vin.slice(-5)}`,
    shippingCompanyId: ids.shipper,
    departureDate: '2026-01-20',
    estimatedFreightUsd: options.quotedUsd,
  });
  await api('POST', `/api/shipments/${shipment.id}/arrive`, {
    cfaRate: options.rate,
    freightCostUsd: options.freightUsd,
    arrivalDate: options.arrivalDate ?? '2026-02-15',
  });
  await api('POST', `/api/cars/${car.id}/arrival-condition`, {
    damaged: options.damaged ?? false,
    driveAndRun: true,
  });
  if (options.damaged) {
    await api('POST', `/api/cars/${car.id}/repairs/jobs`, {
      serviceType: 'PAINTER', workerId: ids.painter, labourCostCfa: 300000, date: '2026-02-20',
    });
    await api('POST', `/api/cars/${car.id}/repairs/finish`, {});
  }
  await api('PATCH', `/api/cars/${car.id}`, { askingPriceCfa: options.asking });
  return car.id as number;
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

  ids.usa = (await api('POST', '/api/parties', { type: 'CAR_SUPPLIER', name: 'Mike Johnson', country: 'USA' })).id;
  ids.canada = (await api('POST', '/api/parties', {
    type: 'CAR_SUPPLIER', name: 'Pierre Tremblay', country: 'CANADA', wholesaler: 'PRICE_ONLY',
  })).id;
  ids.shipper = (await api('POST', '/api/parties', { type: 'SHIPPING_COMPANY', name: 'Atlantic Ro-Ro' })).id;
  ids.cashBox = (await api('POST', '/api/parties', { type: 'TRANSFER_COMPANY', name: 'Cash box' })).id;
  ids.transferCo = (await api('POST', '/api/parties', { type: 'TRANSFER_COMPANY', name: 'Western Transfer' })).id;
  ids.painter = (await api('POST', '/api/parties', { type: 'WORKER', name: 'Ibrahim', workerRole: 'GARAGE' })).id;
  ids.parts = (await api('POST', '/api/parties', { type: 'PARTS_SUPPLIER', name: 'Pieces Auto' })).id;
  await api('PATCH', '/api/settings', { defaultCashAccountId: ids.cashBox });
}, 60000);

afterAll(async () => {
  await app?.close();
  await prisma.$disconnect();
});

describe('a buyer holds a car with a deposit', () => {
  let carId = 0;

  it('puts the deposit in the cash box straight away', async () => {
    carId = await carInShowroom({
      supplierId: ids.usa, vin: '4T1B11HK5LU200001', priceUsd: 9000,
      quotedUsd: 1200, freightUsd: 1200, rate: 600, asking: 8000000,
    });

    await api('POST', `/api/cars/${carId}/reserve`, {
      customerName: 'Amadou Diallo', customerMobile: '77 000 00 00',
      depositCfa: 1000000, date: '2026-03-01',
    });

    const statement = await api('GET', `/api/parties/${ids.cashBox}/statement`);
    expect(statement.closingBalance).toBe('1000000');
    expect(statement.lines.at(-1).kind).toBe('RESERVATION_DEPOSIT');
  });

  it('shows the car as held in the showroom', async () => {
    const showroom = await api('GET', '/api/showroom');
    const car = showroom.find((c: { id: number }) => c.id === carId);
    expect(car.reservation.customerName).toBe('Amadou Diallo');
  });

  it('refuses a second deposit on the same car', async () => {
    await expect(
      api('POST', `/api/cars/${carId}/reserve`, { customerName: 'Someone else', depositCfa: 500000 }),
    ).rejects.toThrow(/already holding/i);
  });

  it('refuses to sell it to anyone but the man holding it', async () => {
    await expect(
      api('POST', `/api/cars/${carId}/sell`, {
        channel: 'LOCAL', price: 8000000, saleDate: '2026-03-05', buyerName: 'Moussa Ba',
      }),
    ).rejects.toThrow(/holding this car/i);
  });

  it('counts the deposit towards the price without taking the money twice', async () => {
    await api('POST', `/api/cars/${carId}/sell`, {
      channel: 'LOCAL', price: 8000000, saleDate: '2026-03-05',
      buyerName: 'Amadou Diallo', initialPayment: 3000000, paymentMethod: 'cash',
    });

    // 1,000,000 deposit + 3,000,000 paid now — the deposit is not added again.
    const statement = await api('GET', `/api/parties/${ids.cashBox}/statement`);
    expect(statement.closingBalance).toBe('4000000');

    const sales = await api('GET', '/api/sales');
    const sale = sales.find((s: { carId: number }) => s.carId === carId);
    expect(sale.paid).toBe('4000000');
    expect(sale.remaining).toBe('4000000');
    expect(sale.settled).toBe(false);
  });

  it('marks the reservation as converted, not left open', async () => {
    const reservations = await api('GET', '/api/reservations');
    expect(reservations.find((r: { carId: number }) => r.carId === carId).status).toBe('CONVERTED');
  });
});

describe('the buyer changes his mind', () => {
  it('takes the money back out again when it is refunded', async () => {
    const carId = await carInShowroom({
      supplierId: ids.usa, vin: '4T1B11HK5LU200002', priceUsd: 7000,
      quotedUsd: 900, freightUsd: 900, rate: 600, asking: 6500000,
    });
    const before = Number((await api('GET', `/api/parties/${ids.cashBox}/statement`)).closingBalance);

    const reservation = await api('POST', `/api/cars/${carId}/reserve`, {
      customerName: 'Fatou Sow', depositCfa: 500000, date: '2026-03-10',
    });
    await api('POST', `/api/reservations/${reservation.id}/cancel`, {
      outcome: 'REFUNDED', reason: 'She found another car',
    });

    const after = await api('GET', `/api/parties/${ids.cashBox}/statement`);
    expect(Number(after.closingBalance)).toBe(before);
    expect(after.lines.at(-1).kind).toBe('RESERVATION_REFUND');

    // The car is free again.
    const showroom = await api('GET', '/api/showroom');
    expect(showroom.find((c: { id: number }) => c.id === carId).reservation).toBeNull();
  });

  it('keeps the money, and says so, when the deposit is forfeited', async () => {
    const carId = await carInShowroom({
      supplierId: ids.usa, vin: '4T1B11HK5LU200003', priceUsd: 7000,
      quotedUsd: 900, freightUsd: 900, rate: 600, asking: 6500000,
    });
    const before = Number((await api('GET', `/api/parties/${ids.cashBox}/statement`)).closingBalance);

    const reservation = await api('POST', `/api/cars/${carId}/reserve`, {
      customerName: 'Ousmane Kane', depositCfa: 400000, date: '2026-03-12',
    });
    await api('POST', `/api/reservations/${reservation.id}/cancel`, {
      outcome: 'FORFEITED', reason: 'He never came back',
    });

    const after = await api('GET', `/api/parties/${ids.cashBox}/statement`);
    expect(Number(after.closingBalance)).toBe(before + 400000);

    const deposits = await api('GET', '/api/reports/deposits');
    expect(deposits.forfeitedCfa).toBe('400000');
  });
});

describe('photos', () => {
  let carId = 0;

  it('refuses a file that is not really an image', async () => {
    carId = await carInShowroom({
      supplierId: ids.usa, vin: '4T1B11HK5LU200004', priceUsd: 5000,
      quotedUsd: 700, freightUsd: 700, rate: 600, asking: 5000000,
    });
    const response = await upload(carId, 'ARRIVAL', Buffer.from('MZ this is a program'), 'photo.jpg');
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/not a photo/i);
  });

  it('accepts a real image and lists it on the car', async () => {
    const response = await upload(carId, 'ARRIVAL', PNG, 'arrival.png');
    expect(response.statusCode).toBe(200);
    // The name on disk is ours, never the one the file arrived with.
    expect(response.json().fileName).not.toContain('arrival.png');

    const photos = await api('GET', `/api/cars/${carId}/photos`);
    expect(photos).toHaveLength(1);
    expect(photos[0].kind).toBe('ARRIVAL');
  });

  it('keeps arrival photos on a car that has been sold', async () => {
    await api('POST', `/api/cars/${carId}/sell`, {
      channel: 'LOCAL', price: 5500000, saleDate: '2026-03-20', buyerName: 'Cheikh Fall',
      initialPayment: 5500000,
    });
    const photos = await api('GET', `/api/cars/${carId}/photos`);
    await expect(api('DELETE', `/api/photos/${photos[0].id}`)).rejects.toThrow(/stays on the record/i);
  });
});

describe('the analysis pages', () => {
  it('separates suppliers, and counts repairs against the one whose car needed them', async () => {
    const damaged = await carInShowroom({
      supplierId: ids.canada, vin: '2T1B11HK5LU200005', priceUsd: 6000,
      quotedUsd: 800, freightUsd: 800, rate: 600, asking: 5000000, damaged: true,
    });
    await api('POST', `/api/cars/${damaged}/sell`, {
      channel: 'LOCAL', price: 5000000, saleDate: '2026-03-25', buyerName: 'Ndeye Gueye',
      initialPayment: 5000000,
    });

    const rows = await api('GET', '/api/reports/by-supplier');
    const canada = rows.find((r: { supplierId: number }) => r.supplierId === ids.canada);
    expect(canada.carsSold).toBe(1);
    expect(canada.repairsCfa).toBe('300000');
    expect(canada.damagedPct).toBe(100);
    // (6000 + 800) x 600 + 300,000 repairs = 4,380,000 against a 5,000,000 sale.
    expect(canada.costCfa).toBe('4380000');
    expect(canada.profitCfa).toBe('620000');

    const usa = rows.find((r: { supplierId: number }) => r.supplierId === ids.usa);
    expect(usa.damagedPct).toBe(0);
  });

  it('flags a car whose cost has passed what it is priced at', async () => {
    const carId = await carInShowroom({
      supplierId: ids.usa, vin: '4T1B11HK5LU200006', priceUsd: 8000,
      quotedUsd: 1000, freightUsd: 1000, rate: 600, asking: 5000000,
    });
    const risk = await api('GET', '/api/reports/at-risk');
    const row = risk.find((r: { carId: number }) => r.carId === carId);
    // (8000 + 1000) x 600 = 5,400,000 cost against a 5,000,000 price.
    expect(row.severity).toBe('loss');
    expect(row.marginCfa).toBe('-400000');
  });

  it('shows what a shipper quoted against what he actually billed', async () => {
    await carInShowroom({
      supplierId: ids.usa, vin: '4T1B11HK5LU200007', priceUsd: 5000,
      quotedUsd: 1000, freightUsd: 1400, rate: 600, asking: 5000000,
      arrivalDate: '2026-03-01',
    });
    const freight = await api('GET', '/api/reports/freight-accuracy');
    const row = freight.rows.find((r: { reference: string }) => r.reference.endsWith('00007'));
    expect(row.estimatedUsd).toBe('1000');
    expect(row.actualUsd).toBe('1400');
    expect(row.differenceUsd).toBe('400');
    expect(row.overPct).toBe('40');

    const company = freight.byCompany.find((c: { companyId: number }) => c.companyId === ids.shipper);
    expect(Number(company.differenceUsd)).toBeGreaterThan(0);
  });

  it('remembers every rate that has been locked or wired at', async () => {
    await api('POST', '/api/treasury/deposit', {
      transferCompanyId: ids.transferCo, amountCfa: 6000000, date: '2026-03-02',
    });
    await api('POST', '/api/treasury/wire', {
      transferCompanyId: ids.transferCo, supplierId: ids.usa,
      amountUsd: 9000, rate: 620, date: '2026-03-03',
    });

    const history = await api('GET', '/api/reports/rate-history');
    expect(history.points.some((p: { kind: string }) => p.kind === 'shipment')).toBe(true);
    expect(history.summary.averageWireRate).toBe(620);
    expect(history.summary.highest).toBe(620);
  });

  it('adds up the stock by stage without counting a sold car', async () => {
    const stages = await api('GET', '/api/reports/stock-by-stage');
    const showroom = stages.find((s: { stage: string }) => s.stage === 'SHOWROOM');
    const stock = await api('GET', '/api/reports/inventory');
    const showroomCars = stock.filter((c: { status: string }) => c.status === 'SHOWROOM');
    expect(showroom.cars).toBe(showroomCars.length);
  });

  it('puts the sales of a month in that month, and takes overhead off it', async () => {
    const trend = await api('GET', '/api/reports/trend?months=24');
    const march = trend.find((m: { month: string }) => m.month === '2026-03');
    const monthly = await api('GET', '/api/reports/monthly?year=2026&month=3');
    expect(march.salesCfa).toBe(monthly.salesCfa);
    expect(march.carsSold).toBe(monthly.carsSold);
    expect(Number(march.netProfitCfa)).toBe(
      Number(march.salesCfa) - Number(march.costCfa) - Number(monthly.overheadCfa),
    );
  });
});
