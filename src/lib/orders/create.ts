import { eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  idempotencyKeys,
  inventory,
  orderEvents,
  orderItems,
  orders,
  products,
  variants,
} from "@/db/schema";

/** A line as the caller asks for it — the price is never taken from the client. */
export type OrderLineRequest = { variantId: string; quantity: number };

export type CreateOrderRequest = {
  email: string;
  phone: string;
  shippingAddress: Record<string, unknown>;
  lines: OrderLineRequest[];
  /** Delivery fee in cents, agreed with the customer. */
  shippingCents: number;
  customerNote?: string | null;
  source: "web" | "whatsapp" | "admin";
  userId?: string | null;
  /** Set for an order taken by staff, so the event names who took it. */
  actorId?: string | null;
};

export type CreateOrderResult =
  | { ok: true; id: string; orderNumber: string; totalCents: number; replayed: boolean }
  | { ok: false; error: string; code: OrderFailure };

export type OrderFailure =
  | "empty"
  | "unavailable"
  | "insufficient_stock"
  | "missing_variant"
  | "in_progress"
  | "key_reused"
  | "invalid";

/**
 * Creates an order, once, in one transaction.
 *
 * One transaction because a half-created order is worse than none: a row with
 * no lines looks like a real order in the list, and stock claimed without an
 * order to account for it is simply lost. Either everything lands or nothing
 * does.
 *
 * Idempotent on `key` because a double-tapped confirm button, a retried fetch
 * and a browser back-then-forward all send the same request twice, and two
 * orders for one basket means two deliveries. The second call returns the
 * first call's answer rather than doing the work again.
 */
export async function createOrder(
  key: string,
  request: CreateOrderRequest,
): Promise<CreateOrderResult> {
  if (request.lines.length === 0) {
    return { ok: false, error: "An order needs at least one line.", code: "empty" };
  }
  if (request.lines.some((l) => !Number.isInteger(l.quantity) || l.quantity < 1)) {
    return { ok: false, error: "Every line needs a whole quantity of 1 or more.", code: "invalid" };
  }
  if (!Number.isInteger(request.shippingCents) || request.shippingCents < 0) {
    return { ok: false, error: "The delivery fee must be a whole number of cents.", code: "invalid" };
  }

  /*
   * The hash covers what the order *is*, not how it was phrased.
   *
   * Lines are sorted so the same basket in a different order is the same
   * request — otherwise a client that shuffles its cart would defeat the
   * check and create a second order.
   */
  const requestHash = hashRequest(request);

  const claimed = await claimKey(key, requestHash, request.userId ?? null);
  if (claimed.kind === "replayed") {
    return { ...claimed.response, replayed: true };
  }
  if (claimed.kind === "conflict") {
    return { ok: false, error: claimed.error, code: claimed.code };
  }

  try {
    const result = await db.transaction(async (tx) => {
      /*
       * Prices come from the database, never from the request.
       *
       * A client that can name its own price can buy a power bank for a cent.
       * The variant id is the only thing taken on trust, and even that is
       * checked for existence below.
       */
      const variantIds = [...new Set(request.lines.map((l) => l.variantId))];
      const priced = await tx
        .select({
          id: variants.id,
          title: variants.title,
          sku: variants.sku,
          priceCents: variants.priceCents,
          salePriceCents: variants.salePriceCents,
          saleStartsAt: variants.saleStartsAt,
          saleEndsAt: variants.saleEndsAt,
          productId: products.id,
          productTitle: products.title,
          productStatus: products.status,
          available: inventory.available,
          track: inventory.track,
        })
        .from(variants)
        .innerJoin(products, eq(products.id, variants.productId))
        .leftJoin(inventory, eq(inventory.variantId, variants.id))
        .where(inArray(variants.id, variantIds));

      const byId = new Map(priced.map((row) => [row.id, row]));
      const missing = variantIds.filter((id) => !byId.has(id));
      if (missing.length > 0) {
        throw new OrderError("missing_variant", "One of those items no longer exists.");
      }

      /*
       * No inventory row at all is a setup fault, not an out-of-stock.
       *
       * Reporting it as "no longer exists" sends someone looking for a deleted
       * product when the real problem is a variant that was never given an
       * inventory row. The product form always creates one, so this only
       * happens to data made outside it.
       */
      const unsellable = priced.filter((row) => row.available === null);
      if (unsellable.length > 0) {
        throw new OrderError(
          "missing_variant",
          `Not set up for sale yet: ${unsellable
            .map((r) => `${r.productTitle} ${r.title}`)
            .join(", ")}.`,
        );
      }

      const notForSale = priced.filter(
        (row) => row.productStatus !== "active" || !row.available,
      );
      if (notForSale.length > 0) {
        throw new OrderError(
          "unavailable",
          `Not available right now: ${notForSale
            .map((r) => `${r.productTitle} ${r.title}`)
            .join(", ")}.`,
        );
      }

      const now = new Date();
      let subtotal = 0;
      const lines = request.lines.map((line) => {
        const row = byId.get(line.variantId);
        if (!row) throw new OrderError("missing_variant", "One of those items no longer exists.");
        const unit = effectivePrice(row, now);
        const total = unit * line.quantity;
        subtotal += total;
        return {
          variantId: row.id,
          productId: row.productId,
          // Snapshotted, so the order still reads correctly after the product
          // is renamed, repriced or deleted.
          productTitle: row.productTitle,
          variantTitle: row.title,
          sku: row.sku,
          unitPriceCents: unit,
          quantity: line.quantity,
          totalCents: total,
        };
      });

      // Tax is zero and price-inclusive, as decided — the figure on the shelf
      // is the figure the customer pays.
      const totalCents = subtotal + request.shippingCents;

      const [numberRow] = await tx.execute<{ next_order_number: string }>(
        sql`select next_order_number()`,
      );
      const orderNumber = numberRow?.next_order_number;
      if (!orderNumber) throw new Error("next_order_number returned nothing");

      const [order] = await tx
        .insert(orders)
        .values({
          orderNumber,
          userId: request.userId ?? null,
          email: request.email,
          phone: request.phone,
          shippingAddress: request.shippingAddress,
          subtotalCents: subtotal,
          shippingCents: request.shippingCents,
          taxCents: 0,
          discountCents: 0,
          totalCents,
          customerNote: request.customerNote ?? null,
          source: request.source,
          placedAt: now,
        })
        .returning({ id: orders.id, orderNumber: orders.orderNumber });
      if (!order) throw new Error("order insert returned no row");

      await tx.insert(orderItems).values(
        lines.map((line) => ({ orderId: order.id, ...line })),
      );

      /*
       * Stock is claimed after the lines exist, so the ledger entry has an
       * order to point at. claim_stock does nothing for an untracked variant
       * beyond checking it is available — which is the common case here, since
       * counting is opt-in.
       */
      for (const line of lines) {
        await tx.execute(
          sql`select claim_stock(${line.variantId}, ${line.quantity}, ${order.id})`,
        );
      }

      await tx.insert(orderEvents).values({
        orderId: order.id,
        type: "placed",
        actorId: request.actorId ?? null,
        data: {
          source: request.source,
          lines: lines.length,
          totalCents,
        },
      });

      return { id: order.id, orderNumber: order.orderNumber, totalCents };
    });

    await completeKey(key, { ok: true, ...result });
    return { ok: true, ...result, replayed: false };
  } catch (error) {
    /*
     * The key is released on failure, not left behind.
     *
     * Leaving it as in_progress would mean a customer whose first attempt hit
     * an out-of-stock line could never retry with the same key — the retry
     * would be told an order is already being created, forever.
     */
    await releaseKey(key);

    if (error instanceof OrderError) {
      return { ok: false, error: error.message, code: error.code };
    }
    const raised = raisedStockMessage(error);
    if (raised) return { ok: false, error: raised.error, code: raised.code };
    throw error;
  }
}

/**
 * A sale price counts only inside its window.
 *
 * The window is always complete when a sale price is set — the
 * `variants_sale_window_complete` check makes the price and both dates all
 * null or all present — so there is no "sale with no end date" to handle. The
 * null guards below are for the no-sale case only.
 */
function effectivePrice(
  row: {
    priceCents: number;
    salePriceCents: number | null;
    saleStartsAt: Date | null;
    saleEndsAt: Date | null;
  },
  now: Date,
): number {
  if (row.salePriceCents === null || !row.saleStartsAt || !row.saleEndsAt) {
    return row.priceCents;
  }
  const live = row.saleStartsAt <= now && now <= row.saleEndsAt;
  return live ? row.salePriceCents : row.priceCents;
}

class OrderError extends Error {
  constructor(
    readonly code: OrderFailure,
    message: string,
  ) {
    super(message);
  }
}

type KeyOutcome =
  | { kind: "fresh" }
  | { kind: "replayed"; response: { ok: true; id: string; orderNumber: string; totalCents: number } }
  | { kind: "conflict"; error: string; code: OrderFailure };

/**
 * Takes the idempotency key, or reports what the previous holder did with it.
 *
 * The insert is the lock: `key` is the primary key, so two simultaneous
 * requests cannot both take it and exactly one proceeds. The loser reads the
 * existing row and either replays its answer or is told to wait.
 */
async function claimKey(
  key: string,
  requestHash: string,
  userId: string | null,
): Promise<KeyOutcome> {
  const inserted = await db
    .insert(idempotencyKeys)
    .values({ key, scope: "order.create", userId, requestHash, status: "in_progress" })
    .onConflictDoNothing()
    .returning({ key: idempotencyKeys.key });
  if (inserted.length > 0) return { kind: "fresh" };

  const [existing] = await db
    .select()
    .from(idempotencyKeys)
    .where(eq(idempotencyKeys.key, key));
  if (!existing) return { kind: "fresh" };

  if (existing.requestHash !== requestHash) {
    return {
      kind: "conflict",
      code: "key_reused",
      error: "That request id was already used for a different order.",
    };
  }
  if (existing.status === "completed" && existing.response) {
    return {
      kind: "replayed",
      response: existing.response as {
        ok: true;
        id: string;
        orderNumber: string;
        totalCents: number;
      },
    };
  }
  return {
    kind: "conflict",
    code: "in_progress",
    error: "That order is already being created. Give it a moment.",
  };
}

async function completeKey(key: string, response: unknown): Promise<void> {
  await db
    .update(idempotencyKeys)
    .set({ status: "completed", response, completedAt: new Date() })
    .where(eq(idempotencyKeys.key, key));
}

async function releaseKey(key: string): Promise<void> {
  await db.delete(idempotencyKeys).where(eq(idempotencyKeys.key, key));
}

/**
 * Turns claim_stock's raised errors into something a customer can read.
 *
 * It raises check_violation for both "unavailable" and "insufficient stock",
 * so the two are told apart by the message text rather than the code.
 */
function raisedStockMessage(
  error: unknown,
): { error: string; code: OrderFailure } | null {
  for (let current = error, depth = 0; current && depth < 6; depth += 1) {
    if (typeof current === "object" && "code" in current) {
      const e = current as { code?: string; message?: string };
      const message = e.message ?? "";
      if (e.code === "23514" && /insufficient stock/.test(message)) {
        return {
          code: "insufficient_stock",
          error: "There isn't enough stock left for one of those items.",
        };
      }
      if (e.code === "23514" && /marked unavailable/.test(message)) {
        return { code: "unavailable", error: "One of those items has just gone off sale." };
      }
      if (e.code === "23503" && /no inventory row/.test(message)) {
        return { code: "missing_variant", error: "One of those items is not set up for sale." };
      }
    }
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

/**
 * A stable fingerprint of the order being asked for.
 *
 * Not a cryptographic hash — it only has to differ when the request differs,
 * so that reusing a key for a different basket is caught.
 */
function hashRequest(request: CreateOrderRequest): string {
  const lines = [...request.lines]
    .map((l) => `${l.variantId}:${l.quantity}`)
    .sort()
    .join("|");
  return [
    request.email.trim().toLowerCase(),
    request.phone.replace(/\s+/g, ""),
    request.shippingCents,
    lines,
  ].join("::");
}
