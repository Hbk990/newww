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
import { carLabel } from '../services/cars.js';

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
          include: { supplier: { select: { id: true, name: true } }, originExpenses: true },
          orderBy: { id: 'asc' },
        },
        ledger: true,
      },
    });
    if (!shipment) throw notFound('Shipment not found');
    return shipment;
  });

  app.post('/api/shipments', async (request) => {
    const input = z
      .object({
        reference: z.string().min(1, 'Give the container or booking a reference'),
        shippingCompanyId: z.coerce.number(),
        freightCostUsd: money,
        departureDate: z.coerce.date().optional().nullable(),
        note: z.string().optional().nullable(),
        carIds: z.array(z.coerce.number()).optional().default([]),
      })
      .parse(request.body);

    const company = await prisma.party.findUnique({ where: { id: input.shippingCompanyId } });
    if (!company || company.type !== PartyType.SHIPPING_COMPANY)
      throw notFound('Shipping company not found');

    const shipment = await prisma.$transaction(async (tx) => {
      const created = await tx.shipment.create({
        data: {
          reference: input.reference.trim(),
          shippingCompanyId: input.shippingCompanyId,
          freightCostUsd: new Prisma.Decimal(input.freightCostUsd),
          departureDate: input.departureDate ?? null,
          note: input.note || null,
        },
      });
      if (input.carIds.length > 0) await assignCars(tx, created.id, input.carIds);
      return created;
    });

    await audit(prisma, {
      userId: request.user?.id,
      action: 'CREATE',
      entity: 'Shipment',
      entityId: shipment.id,
      after: shipment,
      ip: request.ip,
    });
    return shipment;
  });

  app.patch('/api/shipments/:id', async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const before = await prisma.shipment.findUnique({ where: { id } });
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

    const shipment = await prisma.$transaction(async (tx) => {
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
    });

    await audit(prisma, {
      userId: request.user?.id,
      action: 'UPDATE',
      entity: 'Shipment',
      entityId: id,
      before,
      after: shipment,
      ip: request.ip,
    });
    return shipment;
  });

  /** Add cars. Freight is re-split equally each time the load changes. */
  app.post('/api/shipments/:id/cars', async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const { carIds } = z.object({ carIds: z.array(z.coerce.number()).min(1) }).parse(request.body);

    const shipment = await prisma.shipment.findUnique({ where: { id } });
    if (!shipment) throw notFound('Shipment not found');
    if (shipment.status === ShipmentStatus.ARRIVED)
      throw new AppError('This shipment has already arrived');

    await prisma.$transaction((tx) => assignCars(tx, id, carIds));
    await audit(prisma, {
      userId: request.user?.id,
      action: 'ASSIGN_CARS',
      entity: 'Shipment',
      entityId: id,
      after: { carIds },
      ip: request.ip,
    });
    return prisma.shipment.findUnique({ where: { id }, include: { cars: true } });
  });

  app.delete('/api/shipments/:id/cars/:carId', async (request) => {
    const { id, carId } = z
      .object({ id: z.coerce.number(), carId: z.coerce.number() })
      .parse(request.params);

    const shipment = await prisma.shipment.findUnique({ where: { id } });
    if (!shipment) throw notFound('Shipment not found');
    if (shipment.status === ShipmentStatus.ARRIVED)
      throw new AppError('This shipment has already arrived');

    await prisma.$transaction(async (tx) => {
      await tx.car.update({
        where: { id: carId },
        data: { shipmentId: null, freightShareUsd: null, status: CarStatus.PURCHASED },
      });
      await resplitEqually(tx, id);
    });
    return prisma.shipment.findUnique({ where: { id }, include: { cars: true } });
  });

  /**
   * Manual freight shares — for the container where one big SUV really did take
   * more space. The shares must still add up to the freight invoice exactly,
   * or a few dollars would quietly vanish from the cars' costs.
   */
  app.post('/api/shipments/:id/shares', async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const { shares } = z
      .object({ shares: z.array(z.object({ carId: z.coerce.number(), amountUsd: money })).min(1) })
      .parse(request.body);

    const shipment = await prisma.shipment.findUnique({ where: { id }, include: { cars: true } });
    if (!shipment) throw notFound('Shipment not found');
    if (shipment.status === ShipmentStatus.ARRIVED)
      throw new AppError('This shipment has arrived and its costs are locked');

    const check = checkFreightShares(
      shares.map((s) => s.amountUsd),
      shipment.freightCostUsd.toString(),
    );
    if (!check.ok)
      throw new AppError(
        `The shares add up to $${check.totalOfShares} but the freight is $${shipment.freightCostUsd}. That is $${check.difference.abs()} ${check.difference.gt(0) ? 'too much' : 'missing'}.`,
      );

    await prisma.$transaction(async (tx) => {
      for (const share of shares) {
        await tx.car.update({
          where: { id: share.carId },
          data: { freightShareUsd: new Prisma.Decimal(share.amountUsd) },
        });
      }
    });
    return prisma.shipment.findUnique({ where: { id }, include: { cars: true } });
  });

  /** The shipment sails. */
  app.post('/api/shipments/:id/ship', async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const { departureDate } = z
      .object({ departureDate: z.coerce.date().optional() })
      .parse(request.body ?? {});

    const shipment = await prisma.shipment.findUnique({ where: { id }, include: { cars: true } });
    if (!shipment) throw notFound('Shipment not found');
    if (shipment.status !== ShipmentStatus.DRAFT)
      throw new AppError('This shipment has already sailed');
    if (shipment.cars.length === 0) throw new AppError('Add at least one car before shipping');

    const updated = await prisma.$transaction(async (tx) => {
      await tx.car.updateMany({ where: { shipmentId: id }, data: { status: CarStatus.SHIPPED } });
      return tx.shipment.update({
        where: { id },
        data: { status: ShipmentStatus.SHIPPED, departureDate: departureDate ?? new Date() },
      });
    });

    await audit(prisma, {
      userId: request.user?.id,
      action: 'SHIP',
      entity: 'Shipment',
      entityId: id,
      after: updated,
      ip: request.ip,
    });
    return updated;
  });

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
  app.post('/api/shipments/:id/arrive', async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const input = z
      .object({
        cfaRate: z.coerce.number().positive('Enter the CFA rate used for this shipment'),
        arrivalDate: z.coerce.date().optional(),
      })
      .parse(request.body);

    const shipment = await prisma.shipment.findUnique({
      where: { id },
      include: { cars: { include: { originExpenses: true } } },
    });
    if (!shipment) throw notFound('Shipment not found');
    if (shipment.status === ShipmentStatus.ARRIVED)
      throw new AppError('This shipment has already been marked as arrived');
    if (shipment.cars.length === 0) throw new AppError('This shipment has no cars');

    // Every car must carry a share, and the shares must equal the invoice.
    const missingShare = shipment.cars.some((c) => c.freightShareUsd === null);
    const shares = missingShare
      ? splitFreightEqually(shipment.freightCostUsd.toString(), shipment.cars.length)
      : shipment.cars.map((c) => c.freightShareUsd!);
    const check = checkFreightShares(
      shares.map((s) => s.toString()),
      shipment.freightCostUsd.toString(),
    );
    if (!check.ok)
      throw new AppError(
        `The freight shares add up to $${check.totalOfShares} but the invoice is $${shipment.freightCostUsd}. Fix the shares before marking this arrived.`,
      );

    const arrivalDate = input.arrivalDate ?? new Date();

    const result = await prisma.$transaction(async (tx) => {
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
            amount: shipment.freightCostUsd,
            description: `Freight — shipment ${shipment.reference} (${shipment.cars.length} car${shipment.cars.length > 1 ? 's' : ''})`,
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
          cfaRate: new Prisma.Decimal(input.cfaRate),
        },
        include: { cars: true },
      });
    });

    await audit(prisma, {
      userId: request.user?.id,
      action: 'ARRIVE',
      entity: 'Shipment',
      entityId: id,
      after: { cfaRate: input.cfaRate, arrivalDate, cars: result.cars.map((c) => c.id) },
      ip: request.ip,
    });
    return result;
  });

  /**
   * Arrival condition, per car. These are the checkboxes that stay disabled
   * until the car has actually arrived — ticking "damaged" on a car still in
   * Texas would put it in a garage queue it cannot be in.
   */
  app.post('/api/cars/:id/arrival-condition', async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const input = z
      .object({
        damaged: z.boolean(),
        driveAndRun: z.boolean(),
        arrivalNote: z.string().optional().nullable(),
      })
      .parse(request.body);

    const car = await prisma.car.findUnique({ where: { id } });
    if (!car) throw notFound('Car not found');
    if (car.status !== CarStatus.ARRIVED)
      throw new AppError('This car has not been marked as arrived yet');

    // Damaged goes to the garage; sound cars go straight to the showroom.
    const nextStatus = input.damaged ? CarStatus.IN_GARAGE : CarStatus.SHOWROOM;
    const updated = await prisma.car.update({
      where: { id },
      data: {
        damaged: input.damaged,
        driveAndRun: input.driveAndRun,
        arrivalNote: input.arrivalNote || null,
        status: nextStatus,
        ...(nextStatus === CarStatus.SHOWROOM ? { showroomAt: new Date() } : {}),
      },
    });

    await audit(prisma, {
      userId: request.user?.id,
      action: 'ARRIVAL_CONDITION',
      entity: 'Car',
      entityId: id,
      before: car,
      after: updated,
      ip: request.ip,
    });
    return updated;
  });
}

// ---------------------------------------------------------------------------

async function assignCars(tx: Tx, shipmentId: number, carIds: number[]) {
  const cars = await tx.car.findMany({ where: { id: { in: carIds } } });
  for (const car of cars) {
    if (car.shipmentId && car.shipmentId !== shipmentId)
      throw new AppError(`${carLabel(car)} is already on another shipment`);
    if (car.status !== CarStatus.PURCHASED && car.status !== CarStatus.SHIPPED)
      throw new AppError(`${carLabel(car)} cannot be shipped — it is ${car.status.toLowerCase()}`);
  }
  await tx.car.updateMany({ where: { id: { in: carIds } }, data: { shipmentId } });
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
