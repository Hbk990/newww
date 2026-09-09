/**
 * Every business needs somewhere for a customer's cash to land, so a fresh
 * installation gets one. Without it the first sale would be refused with
 * "there is nowhere to put the money".
 *
 * Safe to run repeatedly: it creates nothing that already exists.
 */
import { PartyType } from '@prisma/client';
import { prisma } from '../src/lib/db.js';
import { cfaCode, getSetting, setSetting } from '../src/lib/settings.js';

const configured = await getSetting('defaultCashAccountId');
if (configured) {
  const existing = await prisma.party.findUnique({ where: { id: Number(configured) } });
  if (existing) {
    console.log(`Sale money already goes to "${existing.name}".`);
    await prisma.$disconnect();
    process.exit(0);
  }
}

const currency = await cfaCode();
const cashBox =
  (await prisma.party.findFirst({
    where: { type: PartyType.TRANSFER_COMPANY, name: { contains: 'cash' } },
  })) ??
  (await prisma.party.create({
    data: {
      type: PartyType.TRANSFER_COMPANY,
      name: 'Cash box',
      currency,
      note: 'Money you are holding yourself. Sale payments land here.',
    },
  }));

await setSetting('defaultCashAccountId', String(cashBox.id));
console.log(`Sale money will go to "${cashBox.name}". Change it in Settings if you prefer.`);
await prisma.$disconnect();
