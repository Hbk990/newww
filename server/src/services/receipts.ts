import { LedgerKind, PartyType, TransactionType } from '@prisma/client';
import { Prisma, type Tx } from '../lib/db.js';
import { AppError, notFound } from '../lib/errors.js';
import { getSetting } from '../lib/settings.js';

/**
 * WHERE A CUSTOMER'S MONEY GOES.
 *
 * A car is sold and the cash goes into the cash box the same moment. Recording
 * the payment therefore credits an account of yours directly — normally the
 * cash box — instead of leaving you to remember a separate deposit afterwards.
 *
 * The important consequence: money from a car sale must NEVER also be entered
 * on the Deposit screen. It is already in. Entering it twice would show cash
 * you do not have.
 *
 * Moving it onwards to a transfer company is a TRANSFER between two of your own
 * accounts, not a new deposit — see the transfer endpoint. That keeps the total
 * you hold correct no matter how many times the money moves.
 */

/** The account a receipt lands in by default: the configured cash box. */
export async function defaultCashAccountId(tx: Tx): Promise<number | null> {
  const configured = await getSetting('defaultCashAccountId');
  if (configured) {
    const party = await tx.party.findUnique({ where: { id: Number(configured) } });
    if (party && party.type === PartyType.TRANSFER_COMPANY && party.active) return party.id;
  }
  // Not configured yet: fall back to an account that is obviously the cash box,
  // so a new installation works before anyone visits Settings.
  const cashBox = await tx.party.findFirst({
    where: { type: PartyType.TRANSFER_COMPANY, active: true, name: { contains: 'cash' } },
    orderBy: { id: 'asc' },
  });
  return cashBox?.id ?? null;
}

export async function resolveReceiptAccount(
  tx: Tx,
  requested: number | null | undefined,
): Promise<number | null> {
  if (requested === null || requested === undefined) return defaultCashAccountId(tx);

  const party = await tx.party.findUnique({ where: { id: requested } });
  if (!party) throw notFound('That account was not found');
  if (party.type !== PartyType.TRANSFER_COMPANY)
    throw new AppError(
      'Money received can only go into a cash box or a transfer company account.',
    );
  if (!party.active) throw new AppError(`${party.name} has been archived.`);
  return party.id;
}

export interface ReceiptInput {
  saleId: number;
  carId: number;
  paymentId: number;
  accountId: number;
  amountCfa: Prisma.Decimal | string | number;
  date: Date;
  description: string;
  userId?: number | null;
}

/**
 * Credits the receiving account and links the ledger line to the payment, so a
 * payment and the money it brought in can never drift apart.
 */
export async function postSaleReceipt(tx: Tx, input: ReceiptInput) {
  const amount = new Prisma.Decimal(input.amountCfa as never);

  const transaction = await tx.transaction.create({
    data: {
      type: TransactionType.SALE_RECEIPT,
      date: input.date,
      transferCompanyId: input.accountId,
      amountCfa: amount,
      note: input.description,
      createdBy: input.userId ?? null,
    },
  });

  const entry = await tx.ledgerEntry.create({
    data: {
      partyId: input.accountId,
      date: input.date,
      kind: LedgerKind.SALE_RECEIPT,
      amount, // positive: this account is now holding more of my money
      description: input.description,
      carId: input.carId,
      saleId: input.saleId,
      transactionId: transaction.id,
      createdBy: input.userId ?? null,
    },
  });

  await tx.salePayment.update({
    where: { id: input.paymentId },
    data: { destinationAccountId: input.accountId, ledgerEntryId: entry.id },
  });

  return { transaction, entry };
}
