"use server";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { orderEvents, orderItems, orders } from "@/db/schema";
import { requirePermission } from "@/lib/auth/guards";
import { createOrder, type CreateOrderRequest } from "@/lib/orders/create";
import { NEXT_STATUS, STATUS_LABELS } from "@/lib/orders/lifecycle";

import { recordAudit } from "./audit";

export type OrderResult =
  | { ok: true; id?: string; orderNumber?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export type OrderListRow = {
  id: string;
  orderNumber: string;
  email: string;
  phone: string;
  status: string;
  paymentStatus: string;
  totalCents: number;
  confirmAttempts: number;
  source: string;
  createdAt: Date;
  lines: number;
};

export async function loadOrders(options?: {
  status?: string;
  query?: string;
}): Promise<OrderListRow[]> {
  await requirePermission("orders.view");

  const filters = [];
  if (options?.status && options.status in NEXT_STATUS) {
    filters.push(eq(orders.status, options.status as "new"));
  }
  if (options?.query) {
    const needle = `%${options.query.trim()}%`;
    filters.push(
      sql`(${orders.orderNumber} ilike ${needle}
        or ${orders.email} ilike ${needle}
        or ${orders.phone} ilike ${needle})`,
    );
  }

  return db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      email: orders.email,
      phone: orders.phone,
      status: orders.status,
      paymentStatus: orders.paymentStatus,
      totalCents: orders.totalCents,
      confirmAttempts: orders.confirmAttempts,
      source: orders.source,
      createdAt: orders.createdAt,
      // The outer table is named literally: interpolating the column object
      // renders a bare "id", which binds to order_items' own id inside the
      // subquery and silently counts nothing.
      lines: sql<number>`(
        select count(*)::int from order_items oi where oi.order_id = orders.id
      )`,
    })
    .from(orders)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(orders.createdAt))
    .limit(200);
}

export async function loadOrder(id: string) {
  await requirePermission("orders.view");

  const [order] = await db.select().from(orders).where(eq(orders.id, id));
  if (!order) return null;

  const [items, events] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, id)),
    db
      .select({
        id: orderEvents.id,
        type: orderEvents.type,
        data: orderEvents.data,
        createdAt: orderEvents.createdAt,
      })
      .from(orderEvents)
      .where(eq(orderEvents.orderId, id))
      .orderBy(desc(orderEvents.createdAt)),
  ]);

  return { order, items, events };
}

/** How many orders sit in each state, for the filter chips. */
export async function orderCounts() {
  await requirePermission("orders.view");
  const rows = await db
    .select({ status: orders.status, n: sql<number>`count(*)::int` })
    .from(orders)
    .groupBy(orders.status);
  const counts: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    counts[row.status] = row.n;
    total += row.n;
  }
  return { counts, total };
}

/**
 * Records a confirmation call.
 *
 * Cash on delivery has no payment step to authorise the order, so this call is
 * what takes its place: nothing is packed until someone has spoken to the
 * customer. A failed attempt is counted rather than discarded, because three
 * unanswered calls is the signal to stop trying.
 */
export async function recordCall(
  id: string,
  outcome: "reached" | "no_answer",
  note?: string,
): Promise<OrderResult> {
  const user = await requirePermission("orders.confirm");

  const [order] = await db.select().from(orders).where(eq(orders.id, id));
  if (!order) return { ok: false, error: "That order no longer exists." };
  if (order.status !== "new") {
    return {
      ok: false,
      error: `This order is already ${STATUS_LABELS[order.status]?.toLowerCase()}.`,
    };
  }

  await db.transaction(async (tx) => {
    if (outcome === "reached") {
      await tx
        .update(orders)
        .set({
          status: "confirmed",
          confirmedAt: new Date(),
          confirmedBy: user.id,
          confirmAttempts: order.confirmAttempts + 1,
        })
        .where(eq(orders.id, id));
    } else {
      // The attempt counts, the status does not move — the order stays in the
      // queue so someone tries again.
      await tx
        .update(orders)
        .set({ confirmAttempts: order.confirmAttempts + 1 })
        .where(eq(orders.id, id));
    }

    await tx.insert(orderEvents).values({
      orderId: id,
      type: outcome === "reached" ? "confirmed" : "call_no_answer",
      actorId: user.id,
      data: { attempt: order.confirmAttempts + 1, note: note ?? null },
    });

    await recordAudit(tx, user.id, {
      entityType: "order",
      entityId: id,
      action: outcome === "reached" ? "confirm" : "update",
      field: outcome === "reached" ? "status" : "confirm_attempts",
      oldValue: outcome === "reached" ? "new" : order.confirmAttempts,
      newValue: outcome === "reached" ? "confirmed" : order.confirmAttempts + 1,
      note: note ?? null,
    });
  });

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${id}`);
  return { ok: true };
}

/**
 * Moves an order one step along, refusing any move the lifecycle disallows.
 *
 * Checked server-side rather than only hiding buttons: a stale page still
 * holds the old buttons, and marking an order delivered when it was cancelled
 * an hour ago would be a silent contradiction in the record.
 */
export async function advanceStatus(
  id: string,
  to: string,
): Promise<OrderResult> {
  const user = await requirePermission("orders.edit");

  const [order] = await db.select().from(orders).where(eq(orders.id, id));
  if (!order) return { ok: false, error: "That order no longer exists." };

  const allowed = NEXT_STATUS[order.status] ?? [];
  if (!allowed.includes(to)) {
    return {
      ok: false,
      error: `An order that is ${STATUS_LABELS[order.status]?.toLowerCase()} cannot become ${STATUS_LABELS[to]?.toLowerCase() ?? to}.`,
    };
  }

  await db.transaction(async (tx) => {
    /*
     * Delivery is also the moment the money arrives.
     *
     * With cash on delivery there is no earlier payment event to record — the
     * driver takes the cash at the door, so `delivered` and `paid` happen
     * together and setting one without the other would leave every delivered
     * order looking unpaid forever.
     */
    const extra =
      to === "delivered"
        ? { paymentStatus: "paid" as const, fulfillmentStatus: "fulfilled" as const }
        : {};

    await tx
      .update(orders)
      .set({ status: to as "confirmed", ...extra })
      .where(eq(orders.id, id));

    await tx.insert(orderEvents).values({
      orderId: id,
      type: `status_${to}`,
      actorId: user.id,
      data: { from: order.status, to },
    });

    await recordAudit(tx, user.id, {
      entityType: "order",
      entityId: id,
      action: "update",
      field: "status",
      oldValue: order.status,
      newValue: to,
    });
  });

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${id}`);
  return { ok: true };
}

const manualOrder = z.object({
  email: z.email("A valid email is needed."),
  /** Lebanese mobiles are +961 followed by 7 or 8 digits; kept loose for landlines. */
  phone: z
    .string()
    .trim()
    .min(7, "A phone number is needed — this is how the order gets confirmed.")
    .max(30),
  line1: z.string().trim().min(3, "Street address is needed."),
  city: z.string().trim().min(2, "City is needed."),
  note: z.string().trim().max(500).nullable(),
  shipping: z
    .string()
    .trim()
    .regex(/^\d{1,5}(\.\d{1,2})?$/, "Use a delivery fee like 3.00.")
    .transform((v) => Math.round(Number(v) * 100)),
  source: z.enum(["whatsapp", "admin"]),
  lines: z
    .array(
      z.object({
        variantId: z.uuid(),
        quantity: z.coerce.number().int().min(1, "At least one."),
      }),
    )
    .min(1, "Add at least one item."),
});

export type ManualOrderInput = z.input<typeof manualOrder>;

/**
 * Takes an order on someone's behalf — a phone or WhatsApp order.
 *
 * The same `createOrder` the storefront will use, so stock claiming,
 * price lookup and idempotency behave identically however the order arrives.
 * The key is generated here rather than accepted from the client: a staff
 * member submitting twice is the same accident as a customer doing it.
 */
export async function createManualOrder(
  idempotencyKey: string,
  raw: ManualOrderInput,
): Promise<OrderResult> {
  const user = await requirePermission("orders.create");

  const parsed = manualOrder.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the highlighted fields.",
      fieldErrors,
    };
  }
  const input = parsed.data;

  const request: CreateOrderRequest = {
    email: input.email,
    phone: input.phone,
    shippingAddress: { line1: input.line1, city: input.city, country: "LB" },
    lines: input.lines,
    shippingCents: input.shipping,
    customerNote: input.note,
    source: input.source,
    actorId: user.id,
  };

  const result = await createOrder(idempotencyKey, request);
  if (!result.ok) return { ok: false, error: result.error };

  await recordAudit(db, user.id, {
    entityType: "order",
    entityId: result.id,
    action: "create",
    note: `taken by hand (${input.source})`,
    newValue: { orderNumber: result.orderNumber, totalCents: result.totalCents },
  });

  revalidatePath("/admin/orders");
  return { ok: true, id: result.id, orderNumber: result.orderNumber };
}

/** Variants a staff member can put on a manual order. */
export async function sellableVariants() {
  await requirePermission("orders.create");
  return db.execute<{
    variant_id: string;
    label: string;
    sku: string | null;
    price_cents: number;
    tracked: boolean;
    sellable: number | null;
  }>(sql`
    select v.id as variant_id,
           p.title || ' — ' || v.title as label,
           v.sku,
           coalesce(
             case when v.sale_price_cents is not null
                   and v.sale_starts_at <= now() and now() <= v.sale_ends_at
                  then v.sale_price_cents end,
             v.price_cents
           ) as price_cents,
           i.track as tracked,
           case when i.track then i.on_hand - i.reserved end as sellable
    from variants v
    join products p on p.id = v.product_id
    join inventory i on i.variant_id = v.id
    where p.status = 'active' and i.available
    order by p.title, v.position
    limit 500
  `);
}

/** Bulk-confirms several orders that were reached on one round of calls. */
export async function confirmMany(ids: string[]): Promise<OrderResult> {
  const user = await requirePermission("orders.confirm");
  if (ids.length === 0) return { ok: true };

  const rows = await db
    .select({ id: orders.id, attempts: orders.confirmAttempts })
    .from(orders)
    .where(and(inArray(orders.id, ids), eq(orders.status, "new")));
  if (rows.length === 0) {
    return { ok: false, error: "None of those are still awaiting a call." };
  }

  await db.transaction(async (tx) => {
    for (const row of rows) {
      await tx
        .update(orders)
        .set({
          status: "confirmed",
          confirmedAt: new Date(),
          confirmedBy: user.id,
          confirmAttempts: row.attempts + 1,
        })
        .where(eq(orders.id, row.id));
      await tx.insert(orderEvents).values({
        orderId: row.id,
        type: "confirmed",
        actorId: user.id,
        data: { attempt: row.attempts + 1, bulk: true },
      });
    }
    await recordAudit(tx, user.id, {
      entityType: "order",
      action: "confirm",
      field: "status",
      newValue: "confirmed",
      note: `${rows.length} orders confirmed together`,
    });
  });

  revalidatePath("/admin/orders");
  return { ok: true };
}
