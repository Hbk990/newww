import type { FastifyInstance } from 'fastify';
import { CarStatus, SaleChannel } from '@prisma/client';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import { prisma } from '../lib/db.js';
import { D, profitOf } from '../lib/money.js';
import { cfaCode } from '../lib/settings.js';
import { carLabel, costBreakdown } from '../services/cars.js';
import { dashboard, fxDifferenceForSupplier, monthlyReport } from '../services/reports.js';

export async function reportRoutes(app: FastifyInstance) {
  app.get('/api/reports/dashboard', async () => dashboard());

  app.get('/api/reports/monthly', async (request) => {
    const now = new Date();
    const { year, month } = z
      .object({
        year: z.coerce.number().default(now.getUTCFullYear()),
        month: z.coerce.number().min(1).max(12).default(now.getUTCMonth() + 1),
      })
      .parse(request.query);
    return monthlyReport(year, month);
  });

  /** Everything not yet sold, at what it actually cost to get it here. */
  app.get('/api/reports/inventory', async () => {
    const cars = await prisma.car.findMany({
      where: { active: true, status: { notIn: [CarStatus.SOLD, CarStatus.SOLD_IN_ORIGIN] } },
      include: {
        supplier: { select: { name: true } },
        originExpenses: true,
        repairJobs: true,
        repairParts: true,
      },
      orderBy: [{ status: 'asc' }, { purchaseDate: 'asc' }],
    });

    return cars.map((car) => {
      const costs = costBreakdown(car);
      return {
        id: car.id,
        label: carLabel(car),
        vin: car.vin,
        status: car.status,
        supplier: car.supplier.name,
        purchaseDate: car.purchaseDate,
        costUsd: costs.usd.totalCostUsd,
        landedCostCfa: costs.landedCostCfa,
        askingPriceCfa: car.askingPriceCfa,
        daysHeld: Math.floor((Date.now() - car.purchaseDate.getTime()) / 86400000),
      };
    });
  });

  /** Profit per car, for cars that have actually been sold. */
  app.get('/api/reports/car-profit', async (request) => {
    const { from, to } = z
      .object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() })
      .parse(request.query);

    const sales = await prisma.sale.findMany({
      where: from || to ? { saleDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {},
      include: {
        car: { include: { originExpenses: true, repairJobs: true, repairParts: true, supplier: true } },
        payments: true,
      },
      orderBy: { saleDate: 'desc' },
    });

    return sales.map((sale) => {
      const costs = costBreakdown(sale.car);
      const isOrigin = sale.channel === SaleChannel.ORIGIN;
      const cost = isOrigin ? costs.usd.totalCostUsd : costs.landedCostCfa ?? D(0);
      return {
        saleId: sale.id,
        carId: sale.carId,
        label: carLabel(sale.car),
        supplier: sale.car.supplier.name,
        channel: sale.channel,
        currency: sale.currency,
        saleDate: sale.saleDate,
        buyerName: sale.buyerName,
        repairsCfa: costs.repairsCfa,
        ...profitOf(sale.price.toString(), cost, isOrigin ? 'USD' : 'CFA'),
      };
    });
  });

  /** Refundable Canadian tax that has not come back yet. */
  app.get('/api/reports/tax-refunds', async () => {
    const cars = await prisma.car.findMany({
      where: { taxRefundableUsd: { gt: 0 }, active: true },
      include: { supplier: { select: { id: true, name: true, country: true } } },
      orderBy: { purchaseDate: 'desc' },
    });
    return cars.map((car) => ({
      carId: car.id,
      label: carLabel(car),
      supplier: car.supplier.name,
      taxInvoicedUsd: car.taxUsd,
      capitalizedUsd: car.taxCapitalizedUsd,
      refundableUsd: car.taxRefundableUsd,
      mode: car.taxRefundMode,
      settled: car.taxRefundSettled,
      settledAt: car.taxRefundSettledAt,
    }));
  });

  /** Rule 6: what the rate movement between costing and paying actually cost. */
  app.get('/api/reports/exchange-difference/:supplierId', async (request) => {
    const { supplierId } = z.object({ supplierId: z.coerce.number() }).parse(request.params);
    const result = await fxDifferenceForSupplier(supplierId);
    return {
      ...result,
      explanation:
        'Positive means the rate moved against you between locking a car cost and wiring the money. It is reported here and never added back into a car cost.',
    };
  });

  // -------------------------------------------------------------------------
  // Excel export
  // -------------------------------------------------------------------------

  app.get('/api/reports/export/inventory', async (_request, reply) => {
    const cars = await prisma.car.findMany({
      where: { active: true, status: { notIn: [CarStatus.SOLD, CarStatus.SOLD_IN_ORIGIN] } },
      include: { supplier: true, originExpenses: true, repairJobs: true, repairParts: true },
    });
    const code = await cfaCode();

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Inventory');
    sheet.columns = [
      { header: 'Car', key: 'label', width: 34 },
      { header: 'VIN', key: 'vin', width: 20 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Supplier', key: 'supplier', width: 20 },
      { header: 'Purchase date', key: 'purchaseDate', width: 14 },
      { header: 'Cost USD', key: 'costUsd', width: 14 },
      { header: `Landed cost ${code}`, key: 'landed', width: 18 },
      { header: `Asking price ${code}`, key: 'asking', width: 18 },
    ];
    sheet.getRow(1).font = { bold: true };

    for (const car of cars) {
      const costs = costBreakdown(car);
      sheet.addRow({
        label: carLabel(car),
        vin: car.vin,
        status: car.status,
        supplier: car.supplier.name,
        purchaseDate: car.purchaseDate.toISOString().slice(0, 10),
        costUsd: Number(costs.usd.totalCostUsd),
        landed: costs.landedCostCfa ? Number(costs.landedCostCfa) : '',
        asking: car.askingPriceCfa ? Number(car.askingPriceCfa) : '',
      });
    }

    reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="inventory-${today()}.xlsx"`);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  });

  app.get('/api/reports/export/statement/:partyId', async (request, reply) => {
    const { partyId } = z.object({ partyId: z.coerce.number() }).parse(request.params);
    const party = await prisma.party.findUniqueOrThrow({ where: { id: partyId } });
    const entries = await prisma.ledgerEntry.findMany({
      where: { partyId },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Statement');
    sheet.columns = [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Type', key: 'kind', width: 20 },
      { header: 'Description', key: 'description', width: 52 },
      { header: `Amount (${party.currency})`, key: 'amount', width: 16 },
      { header: 'Balance', key: 'balance', width: 16 },
    ];
    sheet.getRow(1).font = { bold: true };

    let running = D(0);
    for (const entry of entries) {
      running = running.plus(entry.amount.toString());
      sheet.addRow({
        date: entry.date.toISOString().slice(0, 10),
        kind: entry.kind,
        description: entry.description,
        amount: Number(entry.amount),
        balance: Number(running.toString()),
      });
    }

    reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header(
        'Content-Disposition',
        `attachment; filename="statement-${party.name.replace(/\W+/g, '-')}-${today()}.xlsx"`,
      );
    return Buffer.from(await workbook.xlsx.writeBuffer());
  });

  app.get('/api/reports/export/monthly', async (request, reply) => {
    const now = new Date();
    const { year, month } = z
      .object({
        year: z.coerce.number().default(now.getUTCFullYear()),
        month: z.coerce.number().min(1).max(12).default(now.getUTCMonth() + 1),
      })
      .parse(request.query);

    const report = await monthlyReport(year, month);
    const code = await cfaCode();

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(`${year}-${String(month).padStart(2, '0')}`);
    sheet.columns = [
      { header: 'Item', key: 'item', width: 40 },
      { header: code, key: 'amount', width: 18 },
    ];
    sheet.getRow(1).font = { bold: true };

    for (const line of report.lines) {
      sheet.addRow({ item: `Sold: ${line.label}`, amount: Number(line.price) });
      sheet.addRow({ item: `   its landed cost`, amount: -Number(line.cost) });
    }
    sheet.addRow({});
    sheet.addRow({ item: 'Sales', amount: Number(report.salesCfa) });
    sheet.addRow({ item: 'Cost of cars sold', amount: -Number(report.costOfCarsSoldCfa) });
    sheet.addRow({ item: 'GROSS PROFIT', amount: Number(report.grossProfitCfa) }).font = {
      bold: true,
    };
    sheet.addRow({ item: 'Overhead (rent, salaries...)', amount: -Number(report.overheadCfa) });
    sheet.addRow({ item: 'Transfer commissions', amount: -Number(report.feesCfa) });
    sheet.addRow({ item: 'Exchange difference', amount: -Number(report.fxDifferenceCfa) });
    sheet.addRow({ item: 'NET PROFIT', amount: Number(report.netProfitCfa) }).font = { bold: true };

    reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="report-${year}-${month}.xlsx"`);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  });
}

const today = () => new Date().toISOString().slice(0, 10);
