/**
 * Loads the worked example from the plan as practice data:
 * a Canadian and an American supplier, three cars in one container, one of them
 * repaired in the garage and sold, plus a deposit and a wire.
 *
 *   npm run seed:demo          -> add the demo data
 *   npm run seed:demo -- --wipe -> ERASE EVERYTHING first, then add it
 *
 * Use it to learn the system and check the numbers against your own arithmetic.
 * Run with --wipe once more before you start entering real cars.
 */
import {
  CarStatus,
  LedgerKind,
  PartyType,
  ServiceType,
  ShipmentStatus,
  TaxRefundMode,
  TransactionType,
} from '@prisma/client';
import { prisma, Prisma } from '../src/lib/db.js';
import { arrivalCostSnapshot, splitFreightEqually, splitTax, wireCfaCost } from '../src/lib/money.js';

const wipe = process.argv.includes('--wipe');
const D = (v: number | string) => new Prisma.Decimal(v);

if (wipe) {
  console.log('Erasing all business data…');
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of [
    'LedgerEntry', 'SalePayment', 'Sale', 'RepairJob', 'PartNeeded', 'RepairPart', 'OriginExpense',
    'Transaction', 'OverheadExpense', 'Car', 'Shipment', 'Party',
  ]) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${table}\``);
  }
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
}

const cfa = (await prisma.setting.findUnique({ where: { key: 'cfaCode' } }))?.value ?? 'XOF';

// --- Accounts ---------------------------------------------------------------

const canadian = await prisma.party.create({
  data: {
    type: PartyType.CAR_SUPPLIER,
    name: 'Pierre Tremblay',
    companyName: 'Montreal Auto Wholesale',
    mobile: '+1 514 555 0110',
    currency: 'USD',
    country: 'CANADA',
    wholesaler: 'PRICE_PLUS_TAX',
  },
});

const american = await prisma.party.create({
  data: {
    type: PartyType.CAR_SUPPLIER,
    name: 'Mike Johnson',
    companyName: 'Texas Auto Auctions',
    mobile: '+1 214 555 0182',
    currency: 'USD',
    country: 'USA',
  },
});

const shipper = await prisma.party.create({
  data: { type: PartyType.SHIPPING_COMPANY, name: 'Atlantic Ro-Ro', currency: 'USD' },
});

const transfer = await prisma.party.create({
  data: { type: PartyType.TRANSFER_COMPANY, name: 'Western Transfer', currency: cfa },
});

// Setup may already have made this, so never make a second one — two accounts
// called "Cash box" would split the money and neither would show the truth.
const existingCashBox = await prisma.party.findFirst({
  where: { type: PartyType.TRANSFER_COMPANY, name: { contains: 'cash' } },
});
if (!existingCashBox) {
  await prisma.party.create({
    data: {
      type: PartyType.TRANSFER_COMPANY,
      name: 'Cash box',
      currency: cfa,
      note: 'Money you hold yourself',
    },
  });
}

const painter = await prisma.party.create({
  data: { type: PartyType.WORKER, name: 'Ibrahim', currency: cfa, workerRole: 'GARAGE' },
});

const partsSupplier = await prisma.party.create({
  data: { type: PartyType.PARTS_SUPPLIER, name: 'Pieces Auto Centre', currency: cfa },
});

// --- The three cars ---------------------------------------------------------

const tax = splitTax(700, 500);

const cla = await prisma.car.create({
  data: {
    supplierId: canadian.id,
    makeName: 'Mercedes-Benz',
    modelName: 'CLA 300',
    year: 2019,
    color: 'Black',
    vin: 'WDDSJ4EB0KN712345',
    purchasePriceUsd: D(10000),
    purchaseDate: new Date('2026-01-10'),
    taxUsd: D(700),
    taxCapitalizedUsd: D(tax.capitalizedUsd.toString()),
    taxRefundableUsd: D(tax.refundableUsd.toString()),
    taxRefundMode: TaxRefundMode.SUPPLIER_CREDIT,
    problemNote: 'Front bumper cracked, seller says it drives fine',
    originExpenses: {
      create: [{ amountUsd: D(300), note: 'Inland transport to port', date: new Date('2026-01-12') }],
    },
  },
});

const camry = await prisma.car.create({
  data: {
    supplierId: american.id,
    makeName: 'Toyota', modelName: 'Camry', year: 2020, color: 'Silver',
    vin: '4T1B11HK5LU123456',
    purchasePriceUsd: D(9000),
    purchaseDate: new Date('2026-01-12'),
  },
});

const rav4 = await prisma.car.create({
  data: {
    supplierId: american.id,
    makeName: 'Toyota', modelName: 'RAV4', year: 2021, color: 'Blue',
    vin: '2T3P1RFV8MC123456',
    purchasePriceUsd: D(12000),
    purchaseDate: new Date('2026-01-12'),
  },
});

await prisma.ledgerEntry.createMany({
  data: [
    { partyId: canadian.id, date: new Date('2026-01-10'), kind: LedgerKind.CAR_PURCHASE, amount: D(10000), description: 'Car purchased — 2019 Mercedes-Benz CLA 300', carId: cla.id },
    { partyId: canadian.id, date: new Date('2026-01-10'), kind: LedgerKind.TAX_CHARGE, amount: D(700), description: 'Tax invoiced — 2019 Mercedes-Benz CLA 300', carId: cla.id },
    { partyId: canadian.id, date: new Date('2026-01-12'), kind: LedgerKind.ORIGIN_EXPENSE, amount: D(300), description: 'Expense in Canada — Inland transport to port', carId: cla.id },
    { partyId: canadian.id, date: new Date('2026-01-10'), kind: LedgerKind.TAX_REFUND_CREDIT, amount: D(-200), description: 'Tax above $500 credited back', carId: cla.id },
    { partyId: american.id, date: new Date('2026-01-12'), kind: LedgerKind.CAR_PURCHASE, amount: D(9000), description: 'Car purchased — 2020 Toyota Camry', carId: camry.id },
    { partyId: american.id, date: new Date('2026-01-12'), kind: LedgerKind.CAR_PURCHASE, amount: D(12000), description: 'Car purchased — 2021 Toyota RAV4', carId: rav4.id },
  ],
});

// --- One container, one rate ------------------------------------------------

const RATE = 600;
const cars = [cla, camry, rav4];
const shares = splitFreightEqually(3600, cars.length);

const shipment = await prisma.shipment.create({
  data: {
    reference: 'MSCU-7781234',
    shippingCompanyId: shipper.id,
    freightCostUsd: D(3600),
    cfaRate: D(RATE),
    departureDate: new Date('2026-01-20'),
    arrivalDate: new Date('2026-02-15'),
    status: ShipmentStatus.ARRIVED,
  },
});

for (const [index, car] of cars.entries()) {
  const expenses = await prisma.originExpense.findMany({ where: { carId: car.id } });
  const snapshot = arrivalCostSnapshot({
    purchasePriceUsd: car.purchasePriceUsd.toString(),
    originExpensesUsd: expenses.map((e) => e.amountUsd.toString()),
    taxCapitalizedUsd: car.taxCapitalizedUsd.toString(),
    freightShareUsd: shares[index].toString(),
    cfaRate: RATE,
  });

  await prisma.car.update({
    where: { id: car.id },
    data: {
      shipmentId: shipment.id,
      freightShareUsd: D(shares[index].toString()),
      status: car.id === cla.id ? CarStatus.IN_GARAGE : CarStatus.SHOWROOM,
      damaged: car.id === cla.id,
      driveAndRun: true,
      arrivedAt: new Date('2026-02-15'),
      showroomAt: car.id === cla.id ? null : new Date('2026-02-15'),
      arrivalNote: car.id === cla.id ? 'Bumper and left wing need work; engine fine' : null,
      cfaRate: D(snapshot.cfaRate.toString()),
      purchaseCfa: D(snapshot.purchaseCfa.toString()),
      originExpensesCfa: D(snapshot.originExpensesCfa.toString()),
      taxCapitalizedCfa: D(snapshot.taxCapitalizedCfa.toString()),
      freightCfa: D(snapshot.freightCfa.toString()),
      arrivalCostCfa: D(snapshot.arrivalCostCfa.toString()),
      askingPriceCfa: car.id === cla.id ? D(9000000) : null,
    },
  });
}

await prisma.ledgerEntry.create({
  data: {
    partyId: shipper.id,
    date: new Date('2026-02-15'),
    kind: LedgerKind.FREIGHT_INVOICE,
    amount: D(3600),
    description: 'Freight — shipment MSCU-7781234 (3 cars)',
    shipmentId: shipment.id,
  },
});

// --- Garage -----------------------------------------------------------------

await prisma.repairJob.create({
  data: {
    carId: cla.id,
    serviceType: ServiceType.PAINTER,
    workerId: painter.id,
    labourCostCfa: D(150000),
    description: 'Bumper and left wing repainted',
    date: new Date('2026-02-20'),
  },
});
await prisma.repairPart.create({
  data: {
    carId: cla.id,
    description: 'Front bumper + left mirror glass',
    costCfa: D(200000),
    partsSupplierId: partsSupplier.id,
    date: new Date('2026-02-20'),
  },
});
await prisma.ledgerEntry.createMany({
  data: [
    { partyId: painter.id, date: new Date('2026-02-20'), kind: LedgerKind.LABOUR_CHARGE, amount: D(150000), description: 'Painter — 2019 Mercedes-Benz CLA 300', carId: cla.id },
    { partyId: partsSupplier.id, date: new Date('2026-02-20'), kind: LedgerKind.PARTS_CHARGE, amount: D(200000), description: 'Front bumper + left mirror glass — 2019 Mercedes-Benz CLA 300', carId: cla.id },
  ],
});

// --- Treasury: a deposit and a wire -----------------------------------------

const deposit = await prisma.transaction.create({
  data: {
    type: TransactionType.DEPOSIT,
    date: new Date('2026-02-01'),
    transferCompanyId: transfer.id,
    amountCfa: D(30000000),
    note: 'Cash from previous sales',
  },
});
await prisma.ledgerEntry.create({
  data: { partyId: transfer.id, date: new Date('2026-02-01'), kind: LedgerKind.DEPOSIT, amount: D(30000000), description: 'Deposit — Cash from previous sales', transactionId: deposit.id },
});

const wire = wireCfaCost(10800, 610, 25000);
const wireTx = await prisma.transaction.create({
  data: {
    type: TransactionType.WIRE_TO_SUPPLIER,
    date: new Date('2026-02-25'),
    transferCompanyId: transfer.id,
    counterpartyId: canadian.id,
    amountCfa: D(wire.principalCfa.toString()),
    amountUsd: D(wire.amountUsd.toString()),
    rate: D(wire.rate.toString()),
    feeCfa: D(wire.feeCfa.toString()),
    note: 'Settling the CLA',
  },
});
await prisma.ledgerEntry.createMany({
  data: [
    { partyId: transfer.id, date: new Date('2026-02-25'), kind: LedgerKind.WIRE_OUT, amount: D(wire.principalCfa.negated().toString()), description: 'Wire of $10800 to Pierre Tremblay at 610', transactionId: wireTx.id },
    { partyId: transfer.id, date: new Date('2026-02-25'), kind: LedgerKind.FEE, amount: D(wire.feeCfa.negated().toString()), description: 'Transfer commission', transactionId: wireTx.id },
    { partyId: canadian.id, date: new Date('2026-02-25'), kind: LedgerKind.PAYMENT, amount: D(-10800), description: 'Payment received by wire — Settling the CLA', transactionId: wireTx.id },
  ],
});

await prisma.overheadExpense.create({
  data: { category: 'RENT', amountCfa: D(500000), date: new Date('2026-02-05'), note: 'Showroom rent' },
});

console.log(`
Demo data loaded.

  Mercedes CLA 300 — in the garage, cost so far 7,550,000 ${cfa}
    (10,000 + 300 expenses + 500 tax + 1,200 freight) x 600 = 7,200,000
    + 150,000 painter + 200,000 parts                       =   350,000

  Finish its repair and sell it at 9,000,000 to see a profit of 1,450,000 ${cfa}.

  Pierre Tremblay's account is settled: 10,000 + 700 + 300 - 200 - 10,800 = 0.
  The wire went out at 610 while the cost was locked at 600, so the February
  report shows an exchange loss of 108,000 ${cfa}.

Run "npm run seed:demo -- --wipe" to clear this before entering real cars.
`);

await prisma.$disconnect();
