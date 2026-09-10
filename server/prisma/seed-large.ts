/**
 * A FULL SHOWROOM, FOR TESTING WITH REAL VOLUME.
 *
 *   npm run seed:large            -> add the practice data to whatever is there
 *   npm run seed:large -- --wipe  -> ERASE every car, account and movement first
 *
 * It loads 50 cars standing in the showroom, plus the history behind them:
 * five suppliers (three American, two Canadian), five shipping companies, five
 * money transfer companies, the garage that repaired the damaged ones, and the
 * wires that paid for it all. A further batch of cars is already sold, so the
 * monthly report and the analysis pages have something to show.
 *
 * Every number is produced by the same money code the application uses — the
 * tax cap, the freight split, the rate locked at arrival — so what you see on
 * the screens is arithmetic you can check by hand, not invented figures.
 *
 * The data is deterministic: run it twice on an empty database and you get
 * exactly the same cars, which makes it useful for comparing before and after.
 */
import {
  CarStatus,
  LedgerKind,
  PartyType,
  ReservationStatus,
  SaleChannel,
  ServiceType,
  ShipmentStatus,
  TaxRefundMode,
  TransactionType,
} from '@prisma/client';
import { prisma, Prisma } from '../src/lib/db.js';
import {
  arrivalCostSnapshot,
  splitFreightEqually,
  splitTax,
  wireCfaCost,
} from '../src/lib/money.js';

const wipe = process.argv.includes('--wipe');
const D = (v: number | string) => new Prisma.Decimal(v);

/** The same sequence every run, so two runs can be compared line by line. */
function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = seededRandom(20260910);
const pick = <T>(values: readonly T[]): T => values[Math.floor(random() * values.length)];
const between = (min: number, max: number, step = 1) =>
  min + Math.round((random() * (max - min)) / step) * step;
const chance = (percent: number) => random() * 100 < percent;
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86400000);

if (wipe) {
  console.log('Erasing every car, account and movement…');
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of [
    'LedgerEntry', 'SalePayment', 'Sale', 'RepairJob', 'PartNeeded', 'RepairPart', 'OriginExpense',
    'CostAdjustment', 'Transaction', 'OverheadExpense', 'CarPhoto', 'Reservation',
    'Car', 'Shipment', 'Party',
  ]) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${table}\``);
  }
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
} else {
  // Running twice would fail halfway on a duplicate chassis number and leave
  // the data half written. Better to stop before touching anything.
  const already = await prisma.car.findFirst({ where: { vin: { startsWith: 'TEST5' } } });
  if (already) {
    console.log(
      'This practice data is already loaded.\n' +
        'Run "npm run seed:large -- --wipe" to clear everything and load it again.',
    );
    await prisma.$disconnect();
    process.exit(0);
  }
}

const cfa = (await prisma.setting.findUnique({ where: { key: 'cfaCode' } }))?.value ?? 'XOF';
const TAX_THRESHOLD = Number(
  (await prisma.setting.findUnique({ where: { key: 'taxThresholdUsd' } }))?.value ?? 500,
);

// ---------------------------------------------------------------------------
// Who you deal with
// ---------------------------------------------------------------------------

const supplier = async (data: {
  name: string;
  companyName: string;
  mobile: string;
  country: 'USA' | 'CANADA';
  wholesaler?: 'PRICE_ONLY' | 'PRICE_PLUS_TAX';
}) =>
  prisma.party.create({
    data: {
      type: PartyType.CAR_SUPPLIER,
      currency: 'USD',
      country: data.country,
      wholesaler: data.wholesaler ?? null,
      name: data.name,
      companyName: data.companyName,
      mobile: data.mobile,
    },
  });

const suppliers = [
  await supplier({ name: 'Mike Johnson', companyName: 'Texas Auto Auctions', mobile: '+1 214 555 0182', country: 'USA' }),
  await supplier({ name: 'Daniel Reeves', companyName: 'Atlanta Motors Direct', mobile: '+1 404 555 0143', country: 'USA' }),
  await supplier({ name: 'Carlos Rivera', companyName: 'Miami Export Autos', mobile: '+1 305 555 0166', country: 'USA' }),
  await supplier({ name: 'Pierre Tremblay', companyName: 'Montreal Auto Wholesale', mobile: '+1 514 555 0110', country: 'CANADA', wholesaler: 'PRICE_PLUS_TAX' }),
  await supplier({ name: 'Julie Bergeron', companyName: 'Ontario Vehicle Traders', mobile: '+1 613 555 0127', country: 'CANADA', wholesaler: 'PRICE_PLUS_TAX' }),
];
const canadians = suppliers.filter((s) => s.country === 'CANADA');

const shippers = [];
for (const name of [
  'Atlantic Ro-Ro',
  'Sahel Shipping Line',
  'Grimaldi Express',
  'Ocean Star Cargo',
  'Dakar Marine Logistics',
]) {
  shippers.push(
    await prisma.party.create({ data: { type: PartyType.SHIPPING_COMPANY, name, currency: 'USD' } }),
  );
}

const transferCompanies = [];
for (const name of [
  'Western Transfer',
  'Wari Express',
  'Orange Money Business',
  'Ria Transfert',
  'MoneyGram Partner',
]) {
  transferCompanies.push(
    await prisma.party.create({ data: { type: PartyType.TRANSFER_COMPANY, name, currency: cfa } }),
  );
}

// The till you hold yourself is a transfer-company account too, but there must
// only ever be one of it — two would split the money and neither would be true.
let cashBox = await prisma.party.findFirst({
  where: { type: PartyType.TRANSFER_COMPANY, name: { contains: 'cash' } },
});
if (!cashBox) {
  cashBox = await prisma.party.create({
    data: { type: PartyType.TRANSFER_COMPANY, name: 'Cash box', currency: cfa, note: 'Money you hold yourself' },
  });
}
await prisma.setting.upsert({
  where: { key: 'defaultCashAccountId' },
  create: { key: 'defaultCashAccountId', value: String(cashBox.id) },
  update: { value: String(cashBox.id) },
});

const workers = [
  await prisma.party.create({ data: { type: PartyType.WORKER, name: 'Ibrahim Ndiaye', currency: cfa, workerRole: 'GARAGE', note: 'Painter' } }),
  await prisma.party.create({ data: { type: PartyType.WORKER, name: 'Moussa Sarr', currency: cfa, workerRole: 'GARAGE', note: 'Blacksmith' } }),
  await prisma.party.create({ data: { type: PartyType.WORKER, name: 'Cheikh Diop', currency: cfa, workerRole: 'GARAGE', note: 'Mechanic' } }),
];
const showroomWorker = await prisma.party.create({
  data: { type: PartyType.WORKER, name: 'Awa Fall', currency: cfa, workerRole: 'SHOWROOM' },
});
const partsSuppliers = [
  await prisma.party.create({ data: { type: PartyType.PARTS_SUPPLIER, name: 'Pieces Auto Centre', currency: cfa } }),
  await prisma.party.create({ data: { type: PartyType.PARTS_SUPPLIER, name: 'Dakar Auto Parts', currency: cfa } }),
];

const SERVICES: { type: ServiceType; worker: number; labour: [number, number]; note: string }[] = [
  { type: ServiceType.PAINTER, worker: 0, labour: [80000, 400000], note: 'Repainted' },
  { type: ServiceType.BLACKSMITH, worker: 1, labour: [60000, 350000], note: 'Panel straightened' },
  { type: ServiceType.MECHANIC, worker: 2, labour: [50000, 300000], note: 'Engine and brakes' },
];

// ---------------------------------------------------------------------------
// The cars
// ---------------------------------------------------------------------------

const MODELS: [string, string, number, number][] = [
  // make, model, cheapest, dearest — in USD, as bought at auction
  ['Toyota', 'Corolla', 6000, 11000], ['Toyota', 'Camry', 7500, 14000],
  ['Toyota', 'RAV4', 10000, 18000], ['Toyota', 'Hilux', 12000, 22000],
  ['Honda', 'Civic', 6500, 12000], ['Honda', 'CR-V', 9500, 17000],
  ['Honda', 'Accord', 7000, 13500], ['Nissan', 'Rogue', 8000, 15000],
  ['Nissan', 'Altima', 6500, 12500], ['Ford', 'Escape', 7000, 14000],
  ['Ford', 'F-150', 12000, 24000], ['Hyundai', 'Tucson', 8000, 15500],
  ['Hyundai', 'Elantra', 6000, 11500], ['Kia', 'Sportage', 8000, 15000],
  ['Kia', 'Optima', 6500, 12000], ['Mercedes-Benz', 'C 300', 13000, 24000],
  ['Mercedes-Benz', 'GLE 350', 18000, 32000], ['BMW', '320i', 12000, 22000],
  ['BMW', 'X5', 17000, 31000], ['Lexus', 'RX 350', 15000, 27000],
  ['Jeep', 'Grand Cherokee', 11000, 21000], ['Chevrolet', 'Malibu', 6000, 11000],
  ['Volkswagen', 'Tiguan', 8500, 16000], ['Mazda', 'CX-5', 8500, 16000],
];
const COLOURS = ['White', 'Black', 'Silver', 'Grey', 'Blue', 'Red', 'Dark blue', 'Beige'] as const;
const PROBLEMS = [
  'Front bumper cracked, seller says it drives fine',
  'Hail damage on the roof',
  'Rear quarter panel dented',
  'Airbag deployed, engine untouched',
  'Water damage on the carpets',
  'Left headlight and wing to replace',
];

const SHOWROOM_CARS = 50;
const SOLD_CARS = 14;
/** Cars still in the garage, so the board has something on it. */
const GARAGE_CARS = 6;
const TOTAL = SHOWROOM_CARS + SOLD_CARS + GARAGE_CARS;

/**
 * A chassis number that is obviously practice data and never a real car, and
 * whose last characters differ from car to car — the lists show the tail of the
 * VIN, so every car ending the same way would be unreadable.
 */
const vinFor = (index: number) =>
  // 17 characters like a real chassis number, and the car's own number at the
  // end — the lists show the tail of the VIN, so the tail has to be the part
  // that differs.
  `TEST5DM${(index * 7919 + 1000000).toString(36).toUpperCase().padStart(7, '0').slice(-7)}${String(index).padStart(3, '0')}`;

interface Planned {
  index: number;
  supplierId: number;
  supplierCountry: string | null;
  make: string;
  model: string;
  year: number;
  colour: string;
  priceUsd: number;
  taxUsd: number;
  refundMode: TaxRefundMode;
  originExpenseUsd: number | null;
  damaged: boolean;
  /** Still being repaired: it never reaches the showroom in this data. */
  inGarage: boolean;
}

const planned: Planned[] = [];
for (let index = 0; index < TOTAL; index++) {
  const [make, model, cheapest, dearest] = MODELS[index % MODELS.length];
  const from = suppliers[index % suppliers.length];
  const canadian = from.country === 'CANADA';
  planned.push({
    index,
    supplierId: from.id,
    supplierCountry: from.country,
    make,
    model,
    year: between(2016, 2023),
    colour: pick(COLOURS),
    priceUsd: between(cheapest, dearest, 250),
    // Only a Canadian price-plus-tax wholesaler invoices tax.
    taxUsd: canadian ? between(200, 1100, 50) : 0,
    refundMode: canadian ? (index % 2 === 0 ? TaxRefundMode.SUPPLIER_CREDIT : TaxRefundMode.SEPARATE_REFUND) : TaxRefundMode.NONE,
    originExpenseUsd: chance(35) ? between(120, 700, 20) : null,
    damaged: chance(38),
    inGarage: false,
  });
}

// Spread the cars that are still in the garage through the newer half of the
// stock, and make sure each of them is damaged.
for (let n = 0; n < GARAGE_CARS; n++) {
  const spec = planned[Math.min(TOTAL - 1 - n * 3, TOTAL - 1)];
  spec.inGarage = true;
  spec.damaged = true;
}

// ---------------------------------------------------------------------------
// Shipments — each one locks its own rate, and each carries 4 to 7 cars
// ---------------------------------------------------------------------------

const groups: Planned[][] = [];
for (let index = 0; index < planned.length; ) {
  const size = between(4, 7);
  groups.push(planned.slice(index, index + size));
  index += size;
}

/** The first shipment landed ten months ago; the last one three weeks ago. */
const FIRST_ARRIVAL = new Date('2025-11-12T00:00:00Z');
const step = Math.floor(275 / Math.max(groups.length - 1, 1));

let carsMade = 0;
interface Made {
  id: number;
  label: string;
  landed: Prisma.Decimal;
  asking: Prisma.Decimal;
  showroomAt: Date;
}
const made: Made[] = [];
const today = new Date('2026-09-10T00:00:00Z');

for (const [groupIndex, group] of groups.entries()) {
  const shipper = shippers[groupIndex % shippers.length];
  const arrival = addDays(FIRST_ARRIVAL, groupIndex * step);
  const departure = addDays(arrival, -between(22, 40));
  const rate = between(588, 632);

  // What he billed, and what he had quoted when the cars left. Some shippers
  // are honest, some are not — that is what the freight page is for.
  const actualFreight = group.length * between(850, 1250, 25);
  const quoted = Math.round(actualFreight * (1 - between(-14, 8) / 100));
  const shares = splitFreightEqually(actualFreight, group.length);

  const shipment = await prisma.shipment.create({
    data: {
      reference: `${['MSCU', 'TGHU', 'CMAU', 'HLXU', 'SEGU'][groupIndex % 5]}-${4400000 + groupIndex * 1317}`,
      shippingCompanyId: shipper.id,
      estimatedFreightUsd: D(quoted),
      freightCostUsd: D(actualFreight),
      cfaRate: D(rate),
      departureDate: departure,
      arrivalDate: arrival,
      status: ShipmentStatus.ARRIVED,
    },
  });

  await prisma.ledgerEntry.create({
    data: {
      partyId: shipper.id,
      date: arrival,
      kind: LedgerKind.FREIGHT_INVOICE,
      amount: D(actualFreight),
      description: `Freight — shipment ${shipment.reference} (${group.length} cars)`,
      shipmentId: shipment.id,
    },
  });

  for (const [carIndex, spec] of group.entries()) {
    const tax = splitTax(spec.taxUsd, TAX_THRESHOLD);
    const purchaseDate = addDays(departure, -between(3, 20));

    const car = await prisma.car.create({
      data: {
        supplierId: spec.supplierId,
        makeName: spec.make,
        modelName: spec.model,
        year: spec.year,
        color: spec.colour,
        vin: vinFor(spec.index),
        purchasePriceUsd: D(spec.priceUsd),
        purchaseDate,
        taxUsd: D(spec.taxUsd),
        taxCapitalizedUsd: D(tax.capitalizedUsd.toString()),
        taxRefundableUsd: D(tax.refundableUsd.toString()),
        taxRefundMode: spec.taxUsd > 0 ? spec.refundMode : TaxRefundMode.NONE,
        problemNote: spec.damaged ? pick(PROBLEMS) : null,
        shipmentId: shipment.id,
        freightShareUsd: D(shares[carIndex].toString()),
        ...(spec.originExpenseUsd
          ? {
              originExpenses: {
                create: [{ amountUsd: D(spec.originExpenseUsd), note: 'Inland transport to port', date: addDays(purchaseDate, 2) }],
              },
            }
          : {}),
      },
    });
    carsMade += 1;

    // What he owes and what I owe him, exactly as the purchase screen posts it.
    const supplierLines: Prisma.LedgerEntryCreateManyInput[] = [
      { partyId: spec.supplierId, date: purchaseDate, kind: LedgerKind.CAR_PURCHASE, amount: D(spec.priceUsd), description: `Car purchased — ${spec.year} ${spec.make} ${spec.model}`, carId: car.id },
    ];
    if (spec.taxUsd > 0) {
      supplierLines.push({ partyId: spec.supplierId, date: purchaseDate, kind: LedgerKind.TAX_CHARGE, amount: D(spec.taxUsd), description: `Tax invoiced — ${spec.year} ${spec.make} ${spec.model}`, carId: car.id });
      if (spec.refundMode === TaxRefundMode.SUPPLIER_CREDIT && tax.refundableUsd.gt(0)) {
        supplierLines.push({ partyId: spec.supplierId, date: purchaseDate, kind: LedgerKind.TAX_REFUND_CREDIT, amount: D(tax.refundableUsd.negated().toString()), description: `Tax above $${TAX_THRESHOLD} credited back`, carId: car.id });
      }
    }
    if (spec.originExpenseUsd) {
      supplierLines.push({ partyId: spec.supplierId, date: addDays(purchaseDate, 2), kind: LedgerKind.ORIGIN_EXPENSE, amount: D(spec.originExpenseUsd), description: `Expense in ${spec.supplierCountry === 'CANADA' ? 'Canada' : 'the USA'} — Inland transport to port`, carId: car.id });
    }
    await prisma.ledgerEntry.createMany({ data: supplierLines });

    // The cost, frozen at this shipment's rate. Nothing recalculates it later.
    const snapshot = arrivalCostSnapshot({
      purchasePriceUsd: String(spec.priceUsd),
      originExpensesUsd: spec.originExpenseUsd ? [String(spec.originExpenseUsd)] : [],
      taxCapitalizedUsd: tax.capitalizedUsd.toString(),
      freightShareUsd: shares[carIndex].toString(),
      cfaRate: rate,
    });

    let repairsCfa = new Prisma.Decimal(0);
    let showroomAt = addDays(arrival, between(1, 4));

    // What a damaged car is waiting for. A car still in the garage keeps at
    // least one trade outstanding, which is what puts it in a column.
    const needs = spec.damaged
      ? {
          blacksmith: chance(70),
          painter: chance(75),
          mechanic: chance(45),
        }
      : { blacksmith: false, painter: false, mechanic: false };
    if (spec.damaged && !needs.blacksmith && !needs.painter && !needs.mechanic) needs.painter = true;

    // The trades this car actually needs, in the order a body shop works them.
    const wanted = [
      needs.blacksmith ? SERVICES[1] : null,
      needs.painter ? SERVICES[0] : null,
      needs.mechanic ? SERVICES[2] : null,
    ].filter(Boolean) as (typeof SERVICES)[number][];
    // A car still in the garage has had some of its trades done, never all.
    const doing = spec.inGarage ? wanted.slice(0, Math.max(0, wanted.length - 1)) : wanted;

    if (spec.damaged) {
      const finished = addDays(arrival, between(9, 28));
      for (const service of doing) {
        const labour = D(between(service.labour[0], service.labour[1], 5000));
        const worker = workers[service.worker];
        const job = await prisma.repairJob.create({
          data: { carId: car.id, serviceType: service.type, workerId: worker.id, labourCostCfa: labour, description: service.note, date: addDays(arrival, between(5, 20)) },
        });
        const entry = await prisma.ledgerEntry.create({
          data: { partyId: worker.id, date: job.date, kind: LedgerKind.LABOUR_CHARGE, amount: labour, description: `${service.type.toLowerCase()} — ${spec.year} ${spec.make} ${spec.model}`, carId: car.id },
        });
        await prisma.repairJob.update({ where: { id: job.id }, data: { ledgerEntryId: entry.id } });
        repairsCfa = repairsCfa.plus(labour);
      }
      if (doing.length > 0 && chance(70)) {
        const cost = D(between(45000, 380000, 5000));
        const from = pick(partsSuppliers);
        const part = await prisma.repairPart.create({
          data: { carId: car.id, description: 'Body panel, lights and fixings', costCfa: cost, partsSupplierId: from.id, date: addDays(arrival, between(6, 20)) },
        });
        const entry = await prisma.ledgerEntry.create({
          data: { partyId: from.id, date: part.date, kind: LedgerKind.PARTS_CHARGE, amount: cost, description: `Parts — ${spec.year} ${spec.make} ${spec.model}`, carId: car.id },
        });
        await prisma.repairPart.update({ where: { id: part.id }, data: { ledgerEntryId: entry.id } });
        repairsCfa = repairsCfa.plus(cost);
      }
      // What a car in the garage is still waiting for. This is a plan, not a
      // cost: nobody is charged for it until the part is recorded as bought.
      // A few lines are left without a price on purpose, so the board shows the
      // warning mark and you can see what an incomplete list looks like.
      if (spec.inGarage) {
        const waiting = wanted.filter((service) => !doing.includes(service));
        const catalogue: Record<string, string[]> = {
          PAINTER: ['Base coat and hardener, two litres', 'Clear coat and thinner'],
          BLACKSMITH: ['Front wing, right side', 'Bonnet catch and brackets'],
          MECHANIC: ['Front discs and brake pads', 'Radiator and hoses'],
        };
        const lines = waiting.flatMap((service) => catalogue[service.type] ?? []).slice(0, 3);
        for (const [index, description] of lines.entries()) {
          await prisma.partNeeded.create({
            data: {
              carId: car.id,
              description,
              partsSupplierId: chance(75) ? pick(partsSuppliers).id : null,
              estimatedCostCfa: index === 0 || chance(55) ? D(between(20000, 220000, 5000)) : null,
              createdAt: addDays(arrival, between(3, 10)),
            },
          });
        }
      }
      showroomAt = finished > today ? today : finished;
    }

    // Asked for a little above what it cost — except the few that got away.
    const landed = new Prisma.Decimal(snapshot.arrivalCostCfa.toString()).plus(repairsCfa);
    const margin = between(-6, 34) / 100;
    const asking = landed.times(1 + margin).dividedBy(25000).round().times(25000);

    await prisma.car.update({
      where: { id: car.id },
      data: {
        status: spec.inGarage ? CarStatus.IN_GARAGE : CarStatus.SHOWROOM,
        damaged: spec.damaged,
        driveAndRun: !spec.damaged || chance(60),
        needsBlacksmith: needs.blacksmith,
        needsPainter: needs.painter,
        needsMechanic: needs.mechanic,
        arrivedAt: arrival,
        arrivalNote: spec.damaged ? 'Damage confirmed on arrival, sent to the garage' : null,
        showroomAt: spec.inGarage ? null : showroomAt,
        cfaRate: D(snapshot.cfaRate.toString()),
        purchaseCfa: D(snapshot.purchaseCfa.toString()),
        originExpensesCfa: D(snapshot.originExpensesCfa.toString()),
        taxCapitalizedCfa: D(snapshot.taxCapitalizedCfa.toString()),
        freightCfa: D(snapshot.freightCfa.toString()),
        arrivalCostCfa: D(snapshot.arrivalCostCfa.toString()),
        askingPriceCfa: asking,
      },
    });

    // A car still in the garage is neither for sale nor sold.
    if (spec.inGarage) continue;

    made.push({ id: car.id, label: `${spec.year} ${spec.make} ${spec.model}`, landed, asking, showroomAt });
  }
}

// ---------------------------------------------------------------------------
// The cars that already sold
//
// Chosen from the ones that have stood long enough to have found a buyer, and
// spread across the whole period rather than bunched at the start — otherwise
// the monthly report would show six months in which nothing was sold.
// ---------------------------------------------------------------------------

const oldEnough = made.filter((car) => addDays(car.showroomAt, 10) <= today);
const stride = oldEnough.length / SOLD_CARS;
const soldIds = new Set<number>();
for (let n = 0; n < SOLD_CARS && n * stride < oldEnough.length; n++) {
  soldIds.add(oldEnough[Math.floor(n * stride)].id);
}
const soldCars = made.filter((car) => soldIds.has(car.id));
const showroomCarIds = made.filter((car) => !soldIds.has(car.id));

const BUYERS = [
  ['Amadou Diallo', '+221 77 123 4567'], ['Fatou Sow', '+221 76 234 5678'],
  ['Ousmane Kane', '+221 78 345 6789'], ['Ndeye Gueye', '+221 77 456 7890'],
  ['Cheikh Fall', '+221 70 567 8901'], ['Moussa Ba', '+221 76 678 9012'],
  ['Aissatou Sy', '+221 77 789 0123'], ['Ibrahima Sarr', '+221 78 890 1234'],
  ['Mariama Cisse', '+221 70 901 2345'], ['Modou Faye', '+221 77 012 3456'],
  ['Khady Ndour', '+221 76 543 2109'], ['Alioune Badara', '+221 78 654 3210'],
  ['Sokhna Mbaye', '+221 77 765 4321'], ['Babacar Thiam', '+221 70 876 5432'],
];

let sales = 0;
let stillOwed = new Prisma.Decimal(0);

for (const [index, sold] of soldCars.entries()) {
  const [buyerName, buyerMobile] = BUYERS[index % BUYERS.length];
  const wanted = addDays(sold.showroomAt, between(6, 80));
  const saleDate = wanted > today ? addDays(today, -between(1, 6)) : wanted;

  // Sold near the asking price — a little haggling either way.
  const price = sold.asking.times(1 + between(-6, 3) / 100).dividedBy(25000).round().times(25000);
  const account = index % 3 === 0 ? pick(transferCompanies) : cashBox;
  const payInFull = chance(65);
  const firstPayment = payInFull ? price : price.times(between(30, 70) / 100).dividedBy(25000).round().times(25000);

  const sale = await prisma.sale.create({
    data: {
      carId: sold.id,
      channel: SaleChannel.LOCAL,
      currency: cfa,
      price,
      saleDate,
      buyerName,
      buyerMobile,
    },
  });
  await prisma.car.update({ where: { id: sold.id }, data: { status: CarStatus.SOLD } });
  sales += 1;

  /** Records a payment and puts the money into an account the same moment. */
  const receive = async (amount: Prisma.Decimal, date: Date, method: string) => {
    const payment = await prisma.salePayment.create({
      data: { saleId: sale.id, amount, date, method, destinationAccountId: account.id },
    });
    const transaction = await prisma.transaction.create({
      data: {
        type: TransactionType.SALE_RECEIPT,
        date,
        transferCompanyId: account.id,
        amountCfa: amount,
        note: `Payment from ${buyerName} — ${sold.label}`,
      },
    });
    const entry = await prisma.ledgerEntry.create({
      data: {
        partyId: account.id,
        date,
        kind: LedgerKind.SALE_RECEIPT,
        amount,
        description: `Payment from ${buyerName} (${method}) — ${sold.label}`,
        carId: sold.id,
        saleId: sale.id,
        transactionId: transaction.id,
      },
    });
    await prisma.salePayment.update({ where: { id: payment.id }, data: { ledgerEntryId: entry.id } });
  };

  await receive(firstPayment, saleDate, 'cash');

  if (!payInFull) {
    const rest = price.minus(firstPayment);
    const secondDate = addDays(saleDate, between(15, 60));
    if (secondDate <= today && chance(55)) {
      await receive(rest, secondDate, 'transfer');
    } else {
      stillOwed = stillOwed.plus(rest);
    }
  }
}

// ---------------------------------------------------------------------------
// Deposits holding three of the cars still in the showroom
// ---------------------------------------------------------------------------

for (let n = 0; n < 3; n++) {
  const car = showroomCarIds[n * 7 + 2];
  if (!car) break;
  const [name, mobile] = BUYERS[(n + 4) % BUYERS.length];
  const date = addDays(today, -between(4, 30));
  const deposit = car.asking.times(between(10, 25) / 100).dividedBy(25000).round().times(25000);

  const transaction = await prisma.transaction.create({
    data: { type: TransactionType.RESERVATION_DEPOSIT, date, transferCompanyId: cashBox.id, amountCfa: deposit, note: `Deposit from ${name}` },
  });
  const entry = await prisma.ledgerEntry.create({
    data: { partyId: cashBox.id, date, kind: LedgerKind.RESERVATION_DEPOSIT, amount: deposit, description: `Deposit to hold a car — ${name}`, carId: car.id, transactionId: transaction.id },
  });
  await prisma.reservation.create({
    data: {
      carId: car.id,
      customerName: name,
      customerMobile: mobile,
      depositCfa: deposit,
      date,
      note: 'Coming back with the rest',
      status: ReservationStatus.ACTIVE,
      destinationAccountId: cashBox.id,
      ledgerEntryId: entry.id,
    },
  });
}

// ---------------------------------------------------------------------------
// The money: what went into the transfer companies, and what left them
// ---------------------------------------------------------------------------

for (const [index, company] of transferCompanies.entries()) {
  const amount = D(between(18, 45) * 1000000);
  const date = addDays(FIRST_ARRIVAL, -between(5, 25) + index * 3);
  const transaction = await prisma.transaction.create({
    data: { type: TransactionType.DEPOSIT, date, transferCompanyId: company.id, amountCfa: amount, note: 'Cash taken to the transfer company' },
  });
  await prisma.ledgerEntry.create({
    data: { partyId: company.id, date, kind: LedgerKind.DEPOSIT, amount, description: 'Deposit — cash taken to the transfer company', transactionId: transaction.id },
  });
}

/** Wires to suppliers, each at the rate of its own day. */
for (let n = 0; n < 16; n++) {
  const company = transferCompanies[n % transferCompanies.length];
  const to = suppliers[n % suppliers.length];
  const date = addDays(FIRST_ARRIVAL, between(0, 280));
  const wire = wireCfaCost(between(4, 14) * 1000, between(596, 638), between(10000, 35000, 5000));

  const transaction = await prisma.transaction.create({
    data: {
      type: TransactionType.WIRE_TO_SUPPLIER,
      date,
      transferCompanyId: company.id,
      counterpartyId: to.id,
      amountCfa: D(wire.principalCfa.toString()),
      amountUsd: D(wire.amountUsd.toString()),
      rate: D(wire.rate.toString()),
      feeCfa: D(wire.feeCfa.toString()),
      note: `Payment on account — ${to.name}`,
    },
  });
  await prisma.ledgerEntry.createMany({
    data: [
      { partyId: company.id, date, kind: LedgerKind.WIRE_OUT, amount: D(wire.principalCfa.negated().toString()), description: `Wire of $${wire.amountUsd} to ${to.name} at ${wire.rate}`, transactionId: transaction.id },
      { partyId: company.id, date, kind: LedgerKind.FEE, amount: D(wire.feeCfa.negated().toString()), description: 'Transfer commission', transactionId: transaction.id },
      { partyId: to.id, date, kind: LedgerKind.PAYMENT, amount: D(wire.amountUsd.negated().toString()), description: `Payment received by wire via ${company.name}`, transactionId: transaction.id },
    ],
  });
}

/** Freight paid to the shipping companies. */
for (const [index, shipper] of shippers.entries()) {
  const company = transferCompanies[index % transferCompanies.length];
  const date = addDays(FIRST_ARRIVAL, between(30, 260));
  const paid = wireCfaCost(between(2, 6) * 1000, between(598, 634), 0);

  const transaction = await prisma.transaction.create({
    data: {
      type: TransactionType.PAY_SHIPPING,
      date,
      transferCompanyId: company.id,
      counterpartyId: shipper.id,
      amountCfa: D(paid.principalCfa.toString()),
      amountUsd: D(paid.amountUsd.toString()),
      rate: D(paid.rate.toString()),
      note: `Freight paid — ${shipper.name}`,
    },
  });
  await prisma.ledgerEntry.createMany({
    data: [
      { partyId: company.id, date, kind: LedgerKind.PAYMENT, amount: D(paid.principalCfa.negated().toString()), description: `Freight paid to ${shipper.name} ($${paid.amountUsd} at ${paid.rate})`, transactionId: transaction.id },
      { partyId: shipper.id, date, kind: LedgerKind.PAYMENT, amount: D(paid.amountUsd.negated().toString()), description: `Payment received via ${company.name}`, transactionId: transaction.id },
    ],
  });
}

/** Something paid to the garage and the parts shops, so they are not all owed. */
for (const party of [...workers, ...partsSuppliers]) {
  const owed = await prisma.ledgerEntry.aggregate({ where: { partyId: party.id }, _sum: { amount: true } });
  const balance = owed._sum.amount ?? new Prisma.Decimal(0);
  if (balance.lte(0)) continue;
  const paying = balance.times(between(45, 85) / 100).dividedBy(5000).round().times(5000);
  const company = pick(transferCompanies);
  const date = addDays(today, -between(10, 60));

  const transaction = await prisma.transaction.create({
    data: {
      type: party.type === PartyType.WORKER ? TransactionType.PAY_WORKER : TransactionType.PAY_PARTS_SUPPLIER,
      date,
      transferCompanyId: company.id,
      counterpartyId: party.id,
      amountCfa: paying,
      note: `Paid ${party.name}`,
    },
  });
  await prisma.ledgerEntry.createMany({
    data: [
      { partyId: company.id, date, kind: LedgerKind.PAYMENT, amount: paying.negated(), description: `Paid ${party.name}`, transactionId: transaction.id },
      { partyId: party.id, date, kind: LedgerKind.PAYMENT, amount: paying.negated(), description: `Payment received via ${company.name}`, transactionId: transaction.id },
    ],
  });
}

// ---------------------------------------------------------------------------
// What the business costs every month, whether or not a car sells
// ---------------------------------------------------------------------------

for (let month = 0; month < 11; month++) {
  const date = new Date(Date.UTC(2025, 10 + month, 3));
  if (date > today) break;
  await prisma.overheadExpense.create({
    data: { category: 'RENT', amountCfa: D(500000), date, note: 'Showroom rent' },
  });
  const salary = D(150000);
  const overhead = await prisma.overheadExpense.create({
    data: { category: 'SALARY', amountCfa: salary, date: addDays(date, 2), note: 'Showroom salary', partyId: showroomWorker.id },
  });
  await prisma.ledgerEntry.create({
    data: { partyId: showroomWorker.id, date: overhead.date, kind: LedgerKind.SALARY_CHARGE, amount: salary, description: 'Salary — showroom' },
  });
  await prisma.overheadExpense.create({
    data: { category: 'OTHER', amountCfa: D(between(40000, 120000, 5000)), date: addDays(date, 5), note: 'Electricity and water' },
  });
}

// ---------------------------------------------------------------------------

const inShowroom = await prisma.car.count({ where: { status: CarStatus.SHOWROOM } });
const inGarage = await prisma.car.count({ where: { status: CarStatus.IN_GARAGE } });
const stock = await prisma.car.aggregate({ where: { status: CarStatus.SHOWROOM }, _sum: { arrivalCostCfa: true } });

console.log(`
Practice data loaded.

  ${carsMade} cars in total — ${inShowroom} in the showroom, ${inGarage} in the garage, ${sales} sold
  5 suppliers: 3 in the USA, 2 in Canada (both invoice tax)
  ${shippers.length} shipping companies · ${transferCompanies.length} money transfer companies + your cash box
  ${groups.length} shipments, each with its own locked rate
  3 cars are held for a buyer with a deposit
  Arrival cost of the showroom stock: ${stock._sum.arrivalCostCfa?.toFixed(0) ?? 0} ${cfa} before repairs

  Every chassis number starts with TEST5 so this data can always be told apart
  from real cars. Run "npm run seed:large -- --wipe" to clear it out before you
  start entering your own.
`);

await prisma.$disconnect();
