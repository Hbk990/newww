import type { FastifyInstance } from 'fastify';
import { CarStatus, LedgerKind, PartyType, ServiceType, WorkerRole } from '@prisma/client';
import { z } from 'zod';
import { prisma, Prisma } from '../lib/db.js';
import { audit } from '../lib/audit.js';
import { AppError, notFound } from '../lib/errors.js';
import { post, reverseEntry } from '../services/ledger.js';
import { carLabel, costBreakdown, getCarWithCosts } from '../services/cars.js';

const money = z.coerce.number().positive('The amount must be more than zero');

export const SERVICE_LABELS: Record<ServiceType, string> = {
  BLACKSMITH: 'Blacksmith (body work)',
  PAINTER: 'Painter',
  MECHANIC: 'Mechanic',
};

/**
 * The garage. A car needs any combination of the three services — or just one,
 * or none. Labour is charged to the worker's own CFA account and parts to the
 * parts supplier's, so at the end of the month you can see exactly what each
 * of them is owed without going through the cars one by one.
 */
export async function garageRoutes(app: FastifyInstance) {
  app.get('/api/garage', async () => {
    const cars = await prisma.car.findMany({
      where: { status: CarStatus.IN_GARAGE, active: true },
      include: {
        supplier: { select: { id: true, name: true } },
        originExpenses: true,
        repairJobs: { include: { worker: { select: { id: true, name: true } } } },
        repairParts: { include: { partsSupplier: { select: { id: true, name: true } } } },
      },
      orderBy: { arrivedAt: 'asc' },
    });

    return cars.map((car) => ({
      ...car,
      label: carLabel(car),
      costs: costBreakdown(car),
      servicesDone: car.repairJobs.map((j) => j.serviceType),
      daysInGarage: car.arrivedAt
        ? Math.floor((Date.now() - car.arrivedAt.getTime()) / 86400000)
        : null,
    }));
  });

  /** Labour: one service, one worker, one price. */
  app.post('/api/cars/:id/repairs/jobs', async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const input = z
      .object({
        serviceType: z.nativeEnum(ServiceType),
        workerId: z.coerce.number(),
        labourCostCfa: money,
        description: z.string().optional().nullable(),
        date: z.coerce.date().optional(),
      })
      .parse(request.body);

    const car = await prisma.car.findUnique({ where: { id } });
    if (!car) throw notFound('Car not found');
    if (car.status !== CarStatus.IN_GARAGE)
      throw new AppError('This car is not in the garage. Mark it as damaged on arrival first.');

    const worker = await prisma.party.findUnique({ where: { id: input.workerId } });
    if (!worker || worker.type !== PartyType.WORKER) throw notFound('Worker not found');
    if (worker.workerRole !== WorkerRole.GARAGE)
      throw new AppError('That person is a showroom worker, not a garage worker');

    const date = input.date ?? new Date();
    const job = await prisma.$transaction(async (tx) => {
      const created = await tx.repairJob.create({
        data: {
          carId: id,
          serviceType: input.serviceType,
          workerId: input.workerId,
          labourCostCfa: new Prisma.Decimal(input.labourCostCfa),
          description: input.description || null,
          date,
        },
      });
      // The worker is owed this immediately; paying him is a separate step.
      await post(
        tx,
        [
          {
            partyId: input.workerId,
            date,
            kind: LedgerKind.LABOUR_CHARGE,
            amount: created.labourCostCfa,
            description: `${SERVICE_LABELS[input.serviceType]} — ${carLabel(car)}${
              input.description ? ` — ${input.description}` : ''
            }`,
            carId: id,
          },
        ],
        request.user?.id,
      );
      return created;
    });

    await audit(prisma, {
      userId: request.user?.id,
      action: 'CREATE',
      entity: 'RepairJob',
      entityId: job.id,
      after: job,
      ip: request.ip,
    });
    return job;
  });

  /** Parts, bought on account from a parts supplier and paid later. */
  app.post('/api/cars/:id/repairs/parts', async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const input = z
      .object({
        description: z.string().min(1, 'Write which part was needed'),
        costCfa: money,
        partsSupplierId: z.coerce.number(),
        date: z.coerce.date().optional(),
      })
      .parse(request.body);

    const car = await prisma.car.findUnique({ where: { id } });
    if (!car) throw notFound('Car not found');
    if (car.status !== CarStatus.IN_GARAGE)
      throw new AppError('This car is not in the garage');

    const supplier = await prisma.party.findUnique({ where: { id: input.partsSupplierId } });
    if (!supplier || supplier.type !== PartyType.PARTS_SUPPLIER)
      throw notFound('Parts supplier not found');

    const date = input.date ?? new Date();
    const part = await prisma.$transaction(async (tx) => {
      const created = await tx.repairPart.create({
        data: {
          carId: id,
          description: input.description.trim(),
          costCfa: new Prisma.Decimal(input.costCfa),
          partsSupplierId: input.partsSupplierId,
          date,
        },
      });
      await post(
        tx,
        [
          {
            partyId: input.partsSupplierId,
            date,
            kind: LedgerKind.PARTS_CHARGE,
            amount: created.costCfa,
            description: `${input.description.trim()} — ${carLabel(car)}`,
            carId: id,
          },
        ],
        request.user?.id,
      );
      return created;
    });

    await audit(prisma, {
      userId: request.user?.id,
      action: 'CREATE',
      entity: 'RepairPart',
      entityId: part.id,
      after: part,
      ip: request.ip,
    });
    return part;
  });

  /** Removing a repair line also reverses what it charged to the account. */
  app.delete('/api/repairs/jobs/:jobId', async (request) => {
    const { jobId } = z.object({ jobId: z.coerce.number() }).parse(request.params);
    const job = await prisma.repairJob.findUnique({ where: { id: jobId } });
    if (!job) throw notFound('Repair job not found');

    const entry = await prisma.ledgerEntry.findFirst({
      where: { carId: job.carId, partyId: job.workerId, kind: LedgerKind.LABOUR_CHARGE, amount: job.labourCostCfa },
      orderBy: { id: 'desc' },
    });
    if (entry) await reverseEntry(entry.id, 'Repair line removed', request.user?.id);
    await prisma.repairJob.delete({ where: { id: jobId } });

    await audit(prisma, {
      userId: request.user?.id,
      action: 'DELETE',
      entity: 'RepairJob',
      entityId: jobId,
      before: job,
      ip: request.ip,
    });
    return { ok: true };
  });

  app.delete('/api/repairs/parts/:partId', async (request) => {
    const { partId } = z.object({ partId: z.coerce.number() }).parse(request.params);
    const part = await prisma.repairPart.findUnique({ where: { id: partId } });
    if (!part) throw notFound('Part not found');

    const entry = await prisma.ledgerEntry.findFirst({
      where: { carId: part.carId, partyId: part.partsSupplierId, kind: LedgerKind.PARTS_CHARGE, amount: part.costCfa },
      orderBy: { id: 'desc' },
    });
    if (entry) await reverseEntry(entry.id, 'Part line removed', request.user?.id);
    await prisma.repairPart.delete({ where: { id: partId } });

    await audit(prisma, {
      userId: request.user?.id,
      action: 'DELETE',
      entity: 'RepairPart',
      entityId: partId,
      before: part,
      ip: request.ip,
    });
    return { ok: true };
  });

  /** Repairs finished — the car moves to the showroom carrying its repair cost. */
  app.post('/api/cars/:id/repairs/finish', async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const { askingPriceCfa } = z
      .object({ askingPriceCfa: z.coerce.number().positive().optional() })
      .parse(request.body ?? {});

    const car = await getCarWithCosts(id);
    if (car.status !== CarStatus.IN_GARAGE) throw new AppError('This car is not in the garage');

    const updated = await prisma.car.update({
      where: { id },
      data: {
        status: CarStatus.SHOWROOM,
        showroomAt: new Date(),
        ...(askingPriceCfa ? { askingPriceCfa: new Prisma.Decimal(askingPriceCfa) } : {}),
      },
    });

    await audit(prisma, {
      userId: request.user?.id,
      action: 'REPAIR_FINISHED',
      entity: 'Car',
      entityId: id,
      after: updated,
      ip: request.ip,
    });

    const costs = costBreakdown(await getCarWithCosts(id));
    return { car: updated, costs };
  });
}
