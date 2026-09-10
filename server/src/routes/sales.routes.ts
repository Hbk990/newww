import { atomic } from '../lib/atomic.js';
import type { FastifyInstance } from 'fastify';
import { CarStatus, LedgerKind, PartyType, SaleChannel } from '@prisma/client';
import { z } from 'zod';
import { prisma, Prisma } from '../lib/db.js';
import { audit } from '../lib/audit.js';
import { AppError, notFound } from '../lib/errors.js';
import { cfaCode } from '../lib/settings.js';
import { D, profitOf, roundCfa, roundUsd, sum } from '../lib/money.js';
import { post, type PostableEntry } from '../services/ledger.js';
import { carLabel, costBreakdown, getCarWithCosts } from '../services/cars.js';
import { ReservationStatus } from '@prisma/client';
import { postSaleReceipt, resolveReceiptAccount } from '../services/receipts.js';

const money = z.coerce.number().positive('The amount must be more than zero');

export async function saleRoutes(app: FastifyInstance) {
  /** Everything ready to sell, with what it actually cost to get it there. */
  app.get('/api/showroom', async (request) => {
    const { search } = z.object({ search: z.string().optional() }).parse(request.query);
    const cars = await prisma.car.findMany({
      where: {
        status: CarStatus.SHOWROOM,
        active: true,
        ...(search
          ? {
              OR: [
                { vin: { contains: search } },
                { makeName: { contains: search } },
                { modelName: { contains: search } },
                { color: { contains: search } },
                { supplier: { name: { contains: search } } },
              ],
            }
          : {}),
      },
      include: {
        supplier: { select: { id: true, name: true } },
        originExpenses: true,
        repairJobs: true,
        repairParts: true, costAdjustments: true,
        photos: { orderBy: { id: 'asc' }, take: 1 },
        reservations: { where: { status: 'ACTIVE' } },
      },
      orderBy: { showroomAt: 'asc' },
    });

    return cars.map((car) => {
      const costs = costBreakdown(car);
      const asking = car.askingPriceCfa;
      return {
        ...car,
        label: carLabel(car),
        costs,
        daysInStock: car.showroomAt
          ? Math.floor((Date.now() - car.showroomAt.getTime()) / 86400000)
          : null,
        potentialProfitCfa:
          asking && costs.landedCostCfa ? roundCfa(D(asking.toString()).minus(costs.landedCostCfa)) : null,
        photo: car.photos[0] ?? null,
        reservation: car.reservations[0] ?? null,
      };
    });
  });

  /** One sale, with everything a printed receipt needs on it. */
  app.get('/api/sales/:id', async (request) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const sale = await prisma.sale.findUnique({
      where: { id },
      include: {
        payments: { orderBy: { date: 'asc' } },
        customer: { select: { id: true, name: true, mobile: true } },
        car: {
          include: {
            supplier: { select: { id: true, name: true } },
            originExpenses: true,
            repairJobs: true,
            repairParts: true,
            costAdjustments: true,
          },
        },
      },
    });
    if (!sale) throw notFound('Sale not found');

    const costs = costBreakdown(sale.car);
    const paid =
      sale.channel === SaleChannel.ORIGIN
        ? roundUsd(sale.price.toString())
        : roundCfa(sum(sale.payments.map((p) => p.amount.toString())));
    return {
      ...sale,
      label: carLabel(sale.car),
      costs,
      paid,
      remaining: D(sale.price.toString()).minus(paid),
      settled: sale.channel === SaleChannel.ORIGIN || D(sale.price.toString()).minus(paid).lte(0),
    };
  });

  app.get('/api/sales', async (request) => {
    const { from, to } = z
      .object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() })
      .parse(request.query);

    const sales = await prisma.sale.findMany({
      where:
        from || to
          ? { saleDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
          : {},
      include: {
        payments: { orderBy: { date: 'asc' } },
        customer: { select: { id: true, name: true } },
        car: { include: { originExpenses: true, repairJobs: true, repairParts: true, costAdjustments: true } },
      },
      orderBy: { saleDate: 'desc' },
    });

    return sales.map((sale) => {
      const costs = costBreakdown(sale.car);
      // Origin proceeds are already settled in the supplier ledger, not collected again.
      const paid = sale.channel === SaleChannel.ORIGIN
        ? roundUsd(sale.price.toString())
        : roundCfa(sum(sale.payments.map((p) => p.amount.toString())));
      const cost =
        sale.channel === SaleChannel.ORIGIN ? costs.usd.totalCostUsd : costs.landedCostCfa ?? D(0);
      return {
        ...sale,
        label: carLabel(sale.car),
        costs,
        paid,
        remaining: D(sale.price.toString()).minus(paid),
        // Which of the two lists this sale belongs on. A sale moves from
        // "still owing" to "paid in full" by itself the moment the last franc
        // arrives — there is nothing to tick.
        settled:
          sale.channel === SaleChannel.ORIGIN ||
          D(sale.price.toString()).minus(paid).lte(0),
        profit: profitOf(
          sale.price.toString(),
          cost,
          sale.channel === SaleChannel.ORIGIN ? 'USD' : 'CFA',
        ),
      };
    });
  });

  /**
   * Selling a car.
   *
   * LOCAL  — from the showroom, in CFA. Profit = price - landed cost.
   * ORIGIN — sold in the USA/Canada and never shipped. The proceeds go straight
   *          into the supplier's USD account: they cancel part of what I owe
   *          him, and if they exceed it, the balance flips and he owes me.
   */
  app.post('/api/cars/:id/sell', async (request) => atomic(async (tx) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const input = z
      .object({
        channel: z.nativeEnum(SaleChannel).default(SaleChannel.LOCAL),
        price: money,
        saleDate: z.coerce.date(),
        buyerName: z.string().min(1, 'Who bought it?'),
        buyerMobile: z.string().optional().nullable(),
        customerId: z.coerce.number().optional().nullable(),
        note: z.string().optional().nullable(),
        /** Optional first payment taken at the same time. */
        initialPayment: z.coerce.number().nonnegative().optional(),
        paymentMethod: z.string().optional().nullable(),
        /** Which of my accounts the money went into. Defaults to the cash box. */
        destinationAccountId: z.coerce.number().optional().nullable(),
      })
      .parse(request.body);

    const roundedPrice = input.channel === SaleChannel.ORIGIN ? roundUsd(input.price) : roundCfa(input.price);
    if (!roundedPrice.eq(input.price)) throw new AppError(input.channel === SaleChannel.ORIGIN
      ? 'USD prices can have at most two decimal places' : 'Enter the price in whole CFA francs');
    if (D(input.initialPayment ?? 0).gt(input.price))
      throw new AppError('The initial payment cannot exceed the sale price');
    if (input.channel === SaleChannel.ORIGIN && (input.initialPayment ?? 0) > 0)
      throw new AppError('Sales abroad settle in the supplier account. Do not enter a separate customer payment.');
    if (input.initialPayment !== undefined && !roundCfa(input.initialPayment).eq(input.initialPayment))
      throw new AppError('Enter payments in whole CFA francs');

    const car = await getCarWithCosts(id, tx);
    const existingSale = await tx.sale.findUnique({ where: { carId: id } });
    if (existingSale) throw new AppError('This car has already been sold');

    if (input.channel === SaleChannel.LOCAL) {
      if (car.status !== CarStatus.SHOWROOM)
        throw new AppError(
          'Only a car in the showroom can be sold locally. Finish its repairs, or mark its arrival condition first.',
        );
    } else if (car.status !== CarStatus.PURCHASED) {
      throw new AppError(
        'A car sold in the origin country must still be there — it cannot already be shipped or arrived.',
      );
    } else if (car.shipmentId) {
      // Leaving it on the shipment would keep it in the freight split for cars
      // that really are travelling.
      throw new AppError(
        'This car is already loaded onto a shipment. Take it off that shipment first.',
      );
    }

    const reservation =
      input.channel === SaleChannel.LOCAL
        ? await tx.reservation.findFirst({ where: { carId: id, status: ReservationStatus.ACTIVE } })
        : null;
    if (reservation) {
      const held = reservation.customerName.trim().toLowerCase();
      if (input.buyerName.trim().toLowerCase() !== held)
        throw new AppError(
          `${reservation.customerName} is holding this car with a deposit of ${reservation.depositCfa}. Sell it to him, or cancel that reservation first.`,
        );
      if (new Prisma.Decimal(input.price).lt(reservation.depositCfa))
        throw new AppError(
          `The price is less than the ${reservation.depositCfa} deposit already taken. Check the price.`,
        );
    }

    if (input.customerId) {
      const customer = await tx.party.findUnique({ where: { id: input.customerId } });
      if (!customer || customer.type !== PartyType.CUSTOMER) throw notFound('Customer not found');
      if (input.channel === SaleChannel.ORIGIN)
        throw new AppError('A sale in the origin country settles in the supplier account, not a customer account');
    }

    const currency = input.channel === SaleChannel.ORIGIN ? 'USD' : await cfaCode();

    const sale = await (async () => {
      const created = await tx.sale.create({
        data: {
          carId: id,
          channel: input.channel,
          currency,
          price: new Prisma.Decimal(input.price),
          saleDate: input.saleDate,
          buyerName: input.buyerName.trim(),
          buyerMobile: input.buyerMobile || null,
          customerId: input.customerId ?? null,
          note: input.note || null,
          ...(input.initialPayment && input.initialPayment > 0
            ? {
                payments: {
                  create: {
                    amount: new Prisma.Decimal(input.initialPayment),
                    date: input.saleDate,
                    method: input.paymentMethod || null,
                  },
                },
              }
            : {}),
        },
        include: { payments: true },
      });

      await tx.car.update({
        where: { id },
        data: {
          status:
            input.channel === SaleChannel.ORIGIN ? CarStatus.SOLD_IN_ORIGIN : CarStatus.SOLD,
        },
      });

      if (input.channel === SaleChannel.ORIGIN) {
        // Negative: the proceeds reduce what I owe this supplier.
        await post(
          tx,
          [
            {
              partyId: car.supplierId,
              date: input.saleDate,
              kind: LedgerKind.ORIGIN_SALE_PROCEEDS,
              amount: new Prisma.Decimal(input.price).negated(),
              description: `Sold in origin country to ${input.buyerName.trim()} — ${carLabel(car)}`,
              carId: id,
              saleId: created.id,
            },
          ],
          request.user?.id,
        );
      } else if (input.customerId) {
        // A customer who pays over time gets a running account of his own.
        const entries: PostableEntry[] = [
          {
            partyId: input.customerId,
            date: input.saleDate,
            kind: LedgerKind.SALE_CHARGE,
            amount: new Prisma.Decimal(input.price),
            description: `Car sold — ${carLabel(car)}`,
            carId: id,
            saleId: created.id,
          },
        ];
        if (input.initialPayment && input.initialPayment > 0) {
          entries.push({
            partyId: input.customerId,
            date: input.saleDate,
            kind: LedgerKind.SALE_PAYMENT,
            amount: new Prisma.Decimal(input.initialPayment).negated(),
            description: `Payment received${input.paymentMethod ? ` (${input.paymentMethod})` : ''}`,
            carId: id,
            saleId: created.id,
          });
        }
        await post(tx, entries, request.user?.id);
      }

      // A deposit already taken is money on this sale. It is recorded as a
      // payment pointing at the ledger line it created when it was handed over,
      // so it counts towards the price without the cash being counted twice.
      if (reservation) {
        await tx.salePayment.create({
          data: {
            saleId: created.id,
            amount: reservation.depositCfa,
            date: reservation.date,
            method: 'deposit',
            note: `Deposit taken on ${reservation.date.toISOString().slice(0, 10)}`,
            destinationAccountId: reservation.destinationAccountId,
            ledgerEntryId: reservation.ledgerEntryId,
          },
        });
        await tx.reservation.update({
          where: { id: reservation.id },
          data: { status: ReservationStatus.CONVERTED, closedAt: input.saleDate },
        });
        if (input.customerId) {
          await post(
            tx,
            [
              {
                partyId: input.customerId,
                date: reservation.date,
                kind: LedgerKind.SALE_PAYMENT,
                amount: reservation.depositCfa.negated(),
                description: `Deposit already taken — ${carLabel(car)}`,
                carId: id,
                saleId: created.id,
              },
            ],
            request.user?.id,
          );
        }
      }

      // The money is in your hands the moment the car leaves, so it is credited
      // to an account here. Do NOT also record it on the Deposit screen.
      if (input.channel === SaleChannel.LOCAL && input.initialPayment && input.initialPayment > 0) {
        const accountId = await resolveReceiptAccount(tx, input.destinationAccountId);
        if (accountId === null)
          throw new AppError(
            'There is nowhere to put the money. Add a transfer-company account called "Cash box" under Accounts, then choose it in Settings.',
          );
        await postSaleReceipt(tx, {
          saleId: created.id,
          carId: id,
          paymentId: created.payments[0].id,
          accountId,
          amountCfa: input.initialPayment,
          date: input.saleDate,
          description: `Car sold to ${input.buyerName.trim()} — ${carLabel(car)}`,
          userId: request.user?.id,
        });
      }

      return created;
    })();

    await audit(tx, {
      userId: request.user?.id,
      action: 'SELL',
      entity: 'Sale',
      entityId: sale.id,
      after: sale,
      ip: request.ip,
    });

    const costs = costBreakdown(car);
    const cost =
      input.channel === SaleChannel.ORIGIN ? costs.usd.totalCostUsd : costs.landedCostCfa ?? D(0);
    return {
      sale,
      profit: profitOf(input.price, cost, input.channel === SaleChannel.ORIGIN ? 'USD' : 'CFA'),
    };
  }));

  /** A later instalment. */
  app.post('/api/sales/:id/payments', async (request) => atomic(async (tx) => {
    const { id } = z.object({ id: z.coerce.number() }).parse(request.params);
    const input = z
      .object({
        amount: money,
        date: z.coerce.date(),
        method: z.string().optional().nullable(),
        note: z.string().optional().nullable(),
        /** Which of my accounts the money went into. Defaults to the cash box. */
        destinationAccountId: z.coerce.number().optional().nullable(),
      })
      .parse(request.body);

    const sale = await tx.sale.findUnique({ where: { id }, include: { payments: true, car: true } });
    if (!sale) throw notFound('Sale not found');
    if (sale.channel === SaleChannel.ORIGIN)
      throw new AppError('This sale is already settled in the supplier account; no customer payment is due.');
    if (!roundCfa(input.amount).eq(input.amount)) throw new AppError('Enter payments in whole CFA francs');

    const alreadyPaid = sum(sale.payments.map((p) => p.amount.toString()));
    const remaining = D(sale.price.toString()).minus(alreadyPaid);
    if (D(input.amount).gt(remaining))
      throw new AppError(
        `That is more than the ${remaining.toString()} ${sale.currency} still outstanding on this sale.`,
      );

    const payment = await (async () => {
      const created = await tx.salePayment.create({
        data: {
          saleId: id,
          amount: new Prisma.Decimal(input.amount),
          date: input.date,
          method: input.method || null,
          note: input.note || null,
        },
      });
      if (sale.customerId) {
        await post(
          tx,
          [
            {
              partyId: sale.customerId,
              date: input.date,
              kind: LedgerKind.SALE_PAYMENT,
              amount: new Prisma.Decimal(input.amount).negated(),
              description: `Payment received${input.method ? ` (${input.method})` : ''} — ${carLabel(sale.car)}`,
              carId: sale.carId,
              saleId: id,
            },
          ],
          request.user?.id,
        );
      }

      // Same rule as the sale itself: the money lands in an account now, so it
      // is never entered again as a deposit.
      const accountId = await resolveReceiptAccount(tx, input.destinationAccountId);
      if (accountId === null)
        throw new AppError(
          'There is nowhere to put the money. Add a transfer-company account called "Cash box" under Accounts, then choose it in Settings.',
        );
      await postSaleReceipt(tx, {
        saleId: id,
        carId: sale.carId,
        paymentId: created.id,
        accountId,
        amountCfa: input.amount,
        date: input.date,
        description: `Payment from ${sale.buyerName}${input.method ? ` (${input.method})` : ''} — ${carLabel(sale.car)}`,
        userId: request.user?.id,
      });

      return created;
    })();

    await audit(tx, {
      userId: request.user?.id,
      action: 'SALE_PAYMENT',
      entity: 'SalePayment',
      entityId: payment.id,
      after: payment,
      ip: request.ip,
    });

    const paid = roundCfa(sum([...sale.payments.map((p) => p.amount.toString()), input.amount]));
    return { payment, paid, remaining: D(sale.price.toString()).minus(paid) };
  }));
}
