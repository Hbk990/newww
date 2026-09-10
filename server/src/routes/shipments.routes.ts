import { atomic } from '../lib/atomic.js';
import type { FastifyInstance } from 'fastify';
import { CarStatus, LedgerKind, PartyType, ShipmentStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma, Prisma, type Tx } from '../lib/db.js';
import { audit } from '../lib/audit.js';
import { AppError, notFound } from '../lib/errors.js';
import {
  arrivalCostSnapshot,
  checkFreightShares,
  splitFreightEqually,
} from '../lib/money.js';
import { post } from '../services/ledger.js';
import { carLabel, costBreakdown } from '../services/cars.js';

const money = z.coerce.number().nonnegative();

/**
 * A shipment holds 1..N cars. One car arriving alone is simply a shipment
 * containing one car — there is no separate single-car path anywhere in the
 * system, which is what keeps the cost maths identical in both cases.
 */
export async function shipmentRoutes(app: FastifyInstance) {
  app.get('/api/shipments', async (request) => {
    const { status } = z
      .object({ status: z.nativeEnum(ShipmentStatus).optional() })
      .parse(request.query);

    const shipments = await prisma.shipment.findMany({
      where: status ? { status } : {},
      include: {
        shippingCompany: { select: { id: true, name: true, companyName: true } },
        cars: {
          select: {
            id: true,
            makeName: true,
            modelName: true,
            year: true,
            vin: true,
            freightShareUsd: true,
            status: true,
            damaged: true,
            driveAndRun: true,
          },
        },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    return shipments.map((s) => ({ ...s, carCount: s.cars.length }));
  });

  app.get('/api/shipments/:id', async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const shipment = await prisma.shipment.findUnique({
      where: { id },
      include: {
        shippingCompany: true,
        cars: {
          include: {
            supplier: { select: { id: true, name: true } },
            originExpenses: true,
            repairJobs: true,
            repairParts: true,
            costAdjustments: true,
          },
          orderBy: { id: 'asc' },
        },
        ledger: true,
      },
    });
    if (!shipment) throw notFound('Shipment not found');
    return {
      ...shipment,
      cars: shipment.cars.map((car) => ({
        ...car,
        label: carLabel(car),
        costs: costBreakdown(car),
      })),
    };
  });

  app.post('/api/shipments', async (request) => atomic(async (tx) => {
    const input = z
      .object({
        /** What you call this shipment — how you recognise the group later. */
        reference: z.string().min(1, 'Give this shipment a name so you can recognise it'),
        shippingCompanyId: z.coerce.number(),
        /** Usually left until arrival, when the invoice is known. */
        freightCostUsd: money.optional().default(0),
        estimatedFreightUsd: money.optional(),
        departureDate: z.coerce.date().optional().nullable(),
        note: z.string().optional().nullable(),
        carIds: z.array(z.coerce.number()).optional().default([]),
      })
      .parse(request.body);

    const company = await tx.party.findUnique({ where: { id: input.shippingCompanyId } });
    if (!company || company.type !== PartyType.SHIPPING_COMPANY)
      throw notFound('Shipping company not found');

    const shipment = await (async () => {
      const created = await tx.shipment.create({
        data: {
          reference: input.reference.trim(),
          shippingCompanyId: input.shippingCompanyId,
          freightCostUsd: new Prisma.Decimal(input.freightCostUsd),
          estimatedFreightUsd:
            input.estimatedFreightUsd === undefined
              ? null
              : new Prisma.Decimal(input.estimatedFreightUsd),
          departureDate: input.departureDate ?? null,
          note: input.note || null,
        },
      });
      if (input.carIds.length > 0) await assignCars(tx, created.id, input.carIds);
      return created;
    })();

    await audit(tx, {
      userId: request.user?.id,
      action: 'CREATE',
      entity: 'Shipment',
      entityId: shipment.id,
      after: shipment,
      ip: request.ip,
    });
    return shipment;
  }));

  app.patch('/api/shipments/:id', async (request) => atomic(async (tx) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const before = await tx.shipment.findUnique({ where: { id } });
    if (!before) throw notFound('Shipment not found');
    if (before.status === ShipmentStatus.ARRIVED)
      throw new AppError('This shipment has arrived and its costs are locked');

    const input = z
      .object({
        reference: z.string().min(1).optional(),
        shippingCompanyId: z.coerce.number().optional(),
        freightCostUsd: money.optional(),
        departureDate: z.coerce.date().optional().nullable(),
        note: z.string().optional().nullable(),
      })
      .parse(request.body);

    if (input.shippingCompanyId !== undefined) {
      const company = await tx.party.findUnique({ where: { id: input.shippingCompanyId } });
      if (!company || !company.active || company.type !== PartyType.SHIPPING_COMPANY)
        throw new AppError('Choose an active shipping company');
    }

    const shipment = await (async () => {
      const updated = await tx.shipment.update({
        where: { id },
        data: {
          ...(input.reference ? { reference: input.reference.trim() } : {}),
          ...(input.shippingCompanyId ? { shippingCompanyId: input.shippingCompanyId } : {}),
          ...(input.freightCostUsd !== undefined
            ? { freightCostUsd: new Prisma.Decimal(input.freightCostUsd) }
            : {}),
          ...(input.departureDate !== undefined ? { departureDate: input.departureDate } : {}),
          ...(input.note !== undefined ? { note: input.note || null } : {}),
        },
      });
      // Freight changed -> the per-car shares must follow, or they stop adding up.
      if (input.freightCostUsd !== undefined) await resplitEqually(tx, id);
      return updated;
    })();

    await audit(tx, {
      userId: request.user?.id,
      action: 'UPDATE',
      entity: 'Shipment',
      entityId: id,
      before,
      after: shipment,
      ip: request.ip,
    });
    return shipment;
  }));

  /** Add cars. Freight is re-split equally each time the load changes. */
  app.post('/api/shipments/:id/cars', async (request) => atomic(async (tx) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const { carIds } = z.object({ carIds: z.array(z.coerce.number()).min(1) }).parse(request.body);

    const shipment = await tx.shipment.findUnique({ where: { id } });
    if (!shipment) throw notFound('Shipment not found');
    if (shipment.status === ShipmentStatus.ARRIVED)
      throw new AppError('This shipment has already arrived');

    await assignCars(tx, id, carIds);
    await audit(tx, {
      userId: request.user?.id,
      action: 'ASSIGN_CARS',
      entity: 'Shipment',
      entityId: id,
      after: { carIds },
      ip: request.ip,
    });
    return tx.shipment.findUnique({ where: { id }, include: { cars: true } });
  }));

  app.delete('/api/shipments/:id/cars/:carId', async (request) => atomic(async (tx) => {
    const { id, carId } = z
      .object({ id: z.coerce.number(), carId: z.coerce.number() })
      .parse(request.params);

    const shipment = await tx.shipment.findUnique({ where: { id } });
    if (!shipment) throw notFound('Shipment not found');
    if (shipment.status === ShipmentStatus.ARRIVED)
      throw new AppError('This shipment has already arrived');

    const car = await tx.car.findUnique({ where: { id: carId } });
    if (!car || car.shipmentId !== id) throw new AppError('This car is not on this shipment');
    if (car.arrivalCostCfa !== null || (car.status !== CarStatus.PURCHASED && car.status !== CarStatus.SHIPPED))
      throw new AppError('An arrived or sold car cannot be removed from a shipment');

    await (async () => {
      await tx.car.update({
        where: { id: carId },
        data: { shipmentId: null, freightShareUsd: null, status: CarStatus.PURCHASED },
      });
      await resplitEqually(tx, id);
    })();
    await audit(tx, { userId: request.user?.id, action: 'REMOVE_CAR', entity: 'Shipment', entityId: id,
      before: { carId }, ip: request.ip });
    return tx.shipment.findUnique({ where: { id }, include: { cars: true } });
  }));

  /**
   * Manual freight shares — for the container where one big SUV really did take
   * more space. The shares must still add up to the freight invoice exactly,
   * or a few dollars would quietly vanish from the cars' costs.
   */
  app.post('/api/shipments/:id/shares', async (request) => atomic(async (tx) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const { shares } = z
      .object({ shares: z.array(z.object({ carId: z.coerce.number(), amountUsd: money })).min(1) })
      .parse(request.body);

    const shipment = await tx.shipment.findUnique({ where: { id }, include: { cars: true } });
    if (!shipment) throw notFound('Shipment not found');
    if (shipment.status === ShipmentStatus.ARRIVED)
      throw new AppError('This shipment has arrived and its costs are locked');

    // Shares for a subset would pass the total check while leaving the cars
    // that were left out carrying stale amounts.
    const onShipment = new Set(shipment.cars.map((car) => car.id));
    const given = new Set(shares.map((share) => share.carId));
    if (given.size !== shares.length) throw new AppError('Give each car exactly one freight share; duplicate cars are not allowed');
    const foreign = shares.filter((share) => !onShipment.has(share.carId));
    if (foreign.length > 0)
      throw new AppError('One of those cars is not on this shipment');
    if (given.size !== onShipment.size)
      throw new AppError(
        `Give a share for every car on this shipment — ${onShipment.size} car(s), ${given.size} given.`,
      );

    const check = checkFreightShares(
      shares.map((s) => s.amountUsd),
      shipment.freightCostUsd.toString(),
    );
    if (!check.ok)
      throw new AppError(
        `The shares add up to $${check.totalOfShares} but the freight is $${shipment.freightCostUsd}. That is $${check.difference.abs()} ${check.difference.gt(0) ? 'too much' : 'missing'}.`,
      );

    await (async () => {
      for (const share of shares) {
        await tx.car.update({
          where: { id: share.carId },
          data: { freightShareUsd: new Prisma.Decimal(share.amountUsd) },
        });
      }
    })();
    return tx.shipment.findUnique({ where: { id }, include: { cars: true } });
  }));

  /** The shipment sails. */
  app.post('/api/shipments/:id/ship', async (request) => atomic(async (tx) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const { departureDate } = z
      .object({ departureDate: z.coerce.date().optional() })
      .parse(request.body ?? {});

    const shipment = await tx.shipment.findUnique({ where: { id }, include: { cars: true } });
    if (!shipment) throw notFound('Shipment not found');
    if (shipment.status !== ShipmentStatus.DRAFT)
      throw new AppError('This shipment has already sailed');
    if (shipment.cars.length === 0) throw new AppError('Add at least one car before shipping');

    const updated = await (async () => {
      await tx.car.updateMany({ where: { shipmentId: id }, data: { status: CarStatus.SHIPPED } });
      return tx.shipment.update({
        where: { id },
        data: { status: ShipmentStatus.SHIPPED, departureDate: departureDate ?? new Date() },
      });
    })();

    await audit(tx, {
      userId: request.user?.id,
      action: 'SHIP',
      entity: 'Shipment',
      entityId: id,
      after: updated,
      ip: request.ip,
    });
    return updated;
  }));

  /**
   * ARRIVAL — the single most important operation in the system.
   *
   * One rate is entered here and it does four things at once, for every car in
   * the shipment: converts the purchase price, the origin expenses, the
   * capitalized tax and the freight share into CFA. The result is written into
   * the car row as a frozen snapshot and is never recalculated, so a car's cost
   * cannot drift when the exchange rate moves next week.
   *
   * The freight invoice is posted to the shipping company's USD account in the
   * same transaction.
   */
  app.post('/api/shipments/:id/arrive', async (request) => atomic(async (tx) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const input = z
      .object({
        cfaRate: z.coerce.number().positive('Enter the CFA rate used for this shipment'),
        arrivalDate: z.coerce.date().optional(),
        /** The freight invoice, which is normally only known now. */
        freightCostUsd: money.optional(),
        /** Optional uneven split; otherwise the freight is divided equally. */
        shares: z.array(z.object({ carId: z.coerce.number(), amountUsd: money })).optional(),
      })
      .parse(request.body);

    const shipment = await tx.shipment.findUnique({
      where: { id },
      include: { cars: { include: { originExpenses: true } } },
    });
    if (!shipment) throw notFound('Shipment not found');
    if (shipment.status === ShipmentStatus.ARRIVED)
      throw new AppError('This shipment has already been marked as arrived');
    if (shipment.cars.length === 0) throw new AppError('This shipment has no cars');

    // The freight invoice arrives with the cars, so it is entered here. An
    // amount given now replaces whatever was recorded when they sailed.
    const freight =
      input.freightCostUsd === undefined
        ? shipment.freightCostUsd
        : new Prisma.Decimal(input.freightCostUsd);
    if (freight.lte(0))
      throw new AppError('Enter the freight invoice for this shipment before marking it arrived');

    // Shares given by hand must cover every car and add up to the invoice;
    // otherwise the freight is divided equally.
    let shares: { toString(): string }[];
    if (input.shares && input.shares.length > 0) {
      const onShipment = new Set(shipment.cars.map((car) => car.id));
      const given = new Map(input.shares.map((share) => [share.carId, share.amountUsd]));
      if (input.shares.some((share) => !onShipment.has(share.carId)))
        throw new AppError('One of those cars is not on this shipment');
      if (given.size !== onShipment.size)
        throw new AppError(
          `Give a freight share for every car on this shipment — ${onShipment.size} car(s), ${given.size} given.`,
        );
      const check = checkFreightShares([...given.values()], freight.toString());
      if (!check.ok)
        throw new AppError(
          `The shares add up to $${check.totalOfShares} but the freight is $${freight}. That is $${check.difference.abs()} ${check.difference.gt(0) ? 'too much' : 'missing'}.`,
        );
      shares = shipment.cars.map((car) => given.get(car.id)!);
    } else {
      shares = splitFreightEqually(freight.toString(), shipment.cars.length);
    }

    const arrivalDate = input.arrivalDate ?? new Date();

    const result = await (async () => {
      for (const [index, car] of shipment.cars.entries()) {
        const snapshot = arrivalCostSnapshot({
          purchasePriceUsd: car.purchasePriceUsd.toString(),
          originExpensesUsd: car.originExpenses.map((e) => e.amountUsd.toString()),
          taxCapitalizedUsd: car.taxCapitalizedUsd.toString(),
          freightShareUsd: shares[index].toString(),
          cfaRate: input.cfaRate,
        });

        await tx.car.update({
          where: { id: car.id },
          data: {
            status: CarStatus.ARRIVED,
            arrivedAt: arrivalDate,
            freightShareUsd: new Prisma.Decimal(shares[index].toString()),
            cfaRate: new Prisma.Decimal(snapshot.cfaRate.toString()),
            purchaseCfa: new Prisma.Decimal(snapshot.purchaseCfa.toString()),
            originExpensesCfa: new Prisma.Decimal(snapshot.originExpensesCfa.toString()),
            taxCapitalizedCfa: new Prisma.Decimal(snapshot.taxCapitalizedCfa.toString()),
            freightCfa: new Prisma.Decimal(snapshot.freightCfa.toString()),
            arrivalCostCfa: new Prisma.Decimal(snapshot.arrivalCostCfa.toString()),
          },
        });
      }

      // What I now owe the shipping company, in USD.
      await post(
        tx,
        [
          {
            partyId: shipment.shippingCompanyId,
            date: arrivalDate,
            kind: LedgerKind.FREIGHT_INVOICE,
            amount: freight,
            description: `Freight — ${shipment.cars.length} car${shipment.cars.length > 1 ? 's' : ''}: ${shipment.cars
              .map((c) => `${c.year} ${c.makeName} ${c.modelName}`)
              .join(', ')}`,
            shipmentId: shipment.id,
          },
        ],
        request.user?.id,
      );

      return tx.shipment.update({
        where: { id },
        data: {
          status: ShipmentStatus.ARRIVED,
          arrivalDate,
          freightCostUsd: freight,
          cfaRate: new Prisma.Decimal(input.cfaRate),
        },
        include: { cars: true },
      });
    })();

    await audit(tx, {
      userId: request.user?.id,
      action: 'ARRIVE',
      entity: 'Shipment',
      entityId: id,
      after: { cfaRate: input.cfaRate, arrivalDate, cars: result.cars.map((c) => c.id) },
      ip: request.ip,
    });
    return result;
  }));


  /**
   * SHIP A CAR STRAIGHT FROM THE CAR LIST.
   *
   * Creating a shipment, adding the car and marking it sailed were three
   * actions on a screen the owner had to go and find. This does all three at
   * once, in one transaction, from wherever the car is shown.
   *
   * Other cars still waiting in the origin country can travel with it, which is
   * the normal case for a container.
   */
  /**
   * SHIP A CAR STRAIGHT FROM THE CAR LIST.
   *
   * Eight cars rarely leave at once — they are bought over weeks and loaded as
   * they are ready. So shipping a car either starts a new shipment or adds it
   * to one that has not arrived yet, and the shipment carries a name you chose
   * so you can recognise the group when the next car is ready to join it.
   *
   * Freight is not asked for here. The invoice is normally only known when the
   * cars land, and it is entered then.
   */
  app.post('/api/cars/:id/ship', async (request) => atomic(async (tx) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const input = z
      .object({
        /** Join this shipment... */
        shipmentId: z.coerce.number().optional(),
        /** ...or start a new one with this name and company. */
        reference: z.string().optional(),
        shippingCompanyId: z.coerce.number().optional(),
        /** What the shipper quoted. Compared with his invoice on arrival. */
        estimatedFreightUsd: money.optional(),
        departureDate: z.coerce.date().optional().nullable(),
        /** Other cars loaded at the same time. */
        alsoCarIds: z.array(z.coerce.number()).optional().default([]),
        note: z.string().optional().nullable(),
      })
      .parse(request.body);

    const car = await tx.car.findUnique({ where: { id } });
    if (!car) throw notFound('Car not found');
    if (car.shipmentId)
      throw new AppError('This car is already on a shipment. Open that shipment to change it.');
    if (car.status !== CarStatus.PURCHASED)
      throw new AppError(`This car cannot be shipped — it is ${car.status.toLowerCase().replace(/_/g, ' ')}.`);

    const carIds = [...new Set([id, ...input.alsoCarIds])];
    const departureDate = input.departureDate ?? new Date();

    let shipment;
    if (input.shipmentId) {
      // Joining a group that is already on its way.
      const existing = await tx.shipment.findUnique({ where: { id: input.shipmentId } });
      if (!existing) throw notFound('Shipment not found');
      if (existing.status === ShipmentStatus.ARRIVED)
        throw new AppError(
          `"${existing.reference}" has already arrived, so nothing more can be added to it.`,
        );
      shipment = existing;
    } else {
      if (!input.reference?.trim())
        throw new AppError('Give this shipment a name so you can recognise it later');
      if (!input.shippingCompanyId) throw new AppError('Choose the shipping company');
      const company = await tx.party.findUnique({ where: { id: input.shippingCompanyId } });
      if (!company || company.type !== PartyType.SHIPPING_COMPANY)
        throw notFound('Shipping company not found');

      shipment = await tx.shipment.create({
        data: {
          reference: input.reference.trim(),
          shippingCompanyId: company.id,
          estimatedFreightUsd:
            input.estimatedFreightUsd === undefined
              ? null
              : new Prisma.Decimal(input.estimatedFreightUsd),
          freightCostUsd: new Prisma.Decimal(0), // the real invoice comes on arrival
          departureDate,
          note: input.note || null,
        },
      });
    }

    await assignCars(tx, shipment.id, carIds);
    await tx.car.updateMany({ where: { shipmentId: shipment.id }, data: { status: CarStatus.SHIPPED } });
    const sailed = await tx.shipment.update({
      where: { id: shipment.id },
      data: { status: ShipmentStatus.SHIPPED, departureDate: shipment.departureDate ?? departureDate },
      include: { cars: true, shippingCompany: { select: { id: true, name: true } } },
    });

    await audit(tx, {
      userId: request.user?.id,
      action: input.shipmentId ? 'JOIN_SHIPMENT' : 'SHIP_FROM_CAR',
      entity: 'Shipment',
      entityId: shipment.id,
      after: { carIds, reference: shipment.reference },
      ip: request.ip,
    });
    return sailed;
  }));

  /** Shipments a car can still be added to: sailed, not yet arrived. */
  app.get('/api/shipments/open', async () => {
    const shipments = await prisma.shipment.findMany({
      where: { status: { not: ShipmentStatus.ARRIVED } },
      include: {
        shippingCompany: { select: { id: true, name: true } },
        cars: { select: { id: true, year: true, makeName: true, modelName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return shipments;
  });

  /**
   * Arrival condition, per car. These are the checkboxes that stay disabled
   * until the car has actually arrived — ticking "damaged" on a car still in
   * Texas would put it in a garage queue it cannot be in.
   */
  app.post('/api/cars/:id/arrival-condition', async (request) => atomic(async (tx) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const input = z
      .object({
        damaged: z.boolean(),
        driveAndRun: z.boolean(),
        arrivalNote: z.string().optional().nullable(),
      })
      .parse(request.body);

    const car = await tx.car.findUnique({ where: { id } });
    if (!car) throw notFound('Car not found');
    if (car.status !== CarStatus.ARRIVED)
      throw new AppError('This car has not been marked as arrived yet');

    // Damaged goes to the garage; sound cars go straight to the showroom.
    const nextStatus = input.damaged ? CarStatus.IN_GARAGE : CarStatus.SHOWROOM;
    const updated = await tx.car.update({
      where: { id },
      data: {
        damaged: input.damaged,
        driveAndRun: input.driveAndRun,
        arrivalNote: input.arrivalNote || null,
        status: nextStatus,
        ...(nextStatus === CarStatus.SHOWROOM ? { showroomAt: new Date() } : {}),
      },
    });

    await audit(tx, {
      userId: request.user?.id,
      action: 'ARRIVAL_CONDITION',
      entity: 'Car',
      entityId: id,
      before: car,
      after: updated,
      ip: request.ip,
    });
    return updated;
  }));
}

// ---------------------------------------------------------------------------

/** Shipments are identified by their cars and their shipping company, so this
 *  is only a quiet fallback for the reference column. */
function autoReference(): string {
  const now = new Date();
  return `Shipment ${now.toISOString().slice(0, 10)}`;
}

async function assignCars(tx: Tx, shipmentId: number, carIds: number[]) {
  if (new Set(carIds).size !== carIds.length) throw new AppError('Choose each car only once');
  const shipment = await tx.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
  if (shipment.status === ShipmentStatus.ARRIVED) throw new AppError('This shipment has already arrived');
  const cars = await tx.car.findMany({ where: { id: { in: carIds } } });
  if (cars.length !== carIds.length) throw notFound('One or more cars were not found');
  for (const car of cars) {
    if (!car.active || car.arrivalCostCfa !== null) throw new AppError('An archived or arrived car cannot be shipped');
    if (car.shipmentId && car.shipmentId !== shipmentId)
      throw new AppError(`${carLabel(car)} is already on another shipment`);
    if (car.status !== CarStatus.PURCHASED && car.status !== CarStatus.SHIPPED)
      throw new AppError(`${carLabel(car)} cannot be shipped — it is ${car.status.toLowerCase()}`);
  }
  await tx.car.updateMany({ where: { id: { in: carIds } }, data: {
    shipmentId, status: shipment.status === ShipmentStatus.SHIPPED ? CarStatus.SHIPPED : CarStatus.PURCHASED,
  } });
  await resplitEqually(tx, shipmentId);
}

/** Equal split by default — the editable override is applied afterwards. */
async function resplitEqually(tx: Tx, shipmentId: number) {
  const shipment = await tx.shipment.findUniqueOrThrow({
    where: { id: shipmentId },
    include: { cars: { orderBy: { id: 'asc' } } },
  });
  if (shipment.cars.length === 0) return;

  const shares = splitFreightEqually(shipment.freightCostUsd.toString(), shipment.cars.length);
  for (const [index, car] of shipment.cars.entries()) {
    await tx.car.update({
      where: { id: car.id },
      data: { freightShareUsd: new Prisma.Decimal(shares[index].toString()) },
    });
  }
}
