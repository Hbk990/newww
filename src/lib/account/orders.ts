import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { orderItems, orders } from "@/db/schema";
import { currentUser } from "@/lib/auth/session";

import type { OrderStatus, PaymentStatus } from "./order-status";

export type MyOrderLine = {
  productTitle: string;
  variantTitle: string;
  sku: string | null;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
};

export type MyOrderRow = {
  id: string;
  orderNumber: string;
  placedAt: Date;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  totalCents: number;
  itemCount: number;
  /** The first line's title, for a one-glance summary of what it was. */
  leadTitle: string | null;
};

/**
 * The shape the checkout wrote into `orders.shipping_address`.
 *
 * Read back defensively rather than cast: it is a jsonb column, the admin's
 * manual order form writes it too, and an order from a year ago may predate a
 * field. Anything missing renders as absent instead of "undefined".
 */
export type OrderAddress = {
  line1?: string;
  line2?: string;
  building?: string;
  floor?: string;
  city?: string;
  region?: string;
  country?: string;
  directions?: string;
};

export type MyOrder = MyOrderRow & {
  email: string;
  phone: string;
  subtotalCents: number;
  shippingCents: number;
  discountCents: number;
  codFeeCents: number;
  customerNote: string | null;
  shippingAddress: OrderAddress;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
  lines: MyOrderLine[];
};

/**
 * This customer's orders, newest first.
 *
 * `placedAt` falls back to `createdAt`: the column is set when an order is
 * placed through the storefront, and an order a staff member typed in may only
 * have the row's creation time. A list of orders with no dates on some of them
 * would look broken.
 *
 * Guests do not appear here at all, which is now unreachable through the
 * storefront — ordering requires an account — but remains true of orders a
 * staff member took over the phone for someone who has none.
 */
export async function loadMyOrders(limit = 50): Promise<MyOrderRow[]> {
  const user = await currentUser();
  if (!user) return [];

  const rows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      /*
       * The two columns, coalesced in TypeScript rather than SQL.
       *
       * `sql<Date>` is only a type assertion: it tells the compiler what to
       * expect and does nothing at runtime, so a raw expression comes back as
       * the driver sees fit — a string, here, which reached
       * `toLocaleDateString` and took the page down with it. Selecting the
       * mapped columns instead gets real Date objects from Drizzle's own
       * timestamp mapping, and the fallback is a `??` that cannot lie.
       */
      placedAt: orders.placedAt,
      createdAt: orders.createdAt,
      status: orders.status,
      paymentStatus: orders.paymentStatus,
      totalCents: orders.totalCents,
      /*
       * Two correlated subqueries, with the outer column named in plain SQL.
       *
       * `${orders.id}` cannot be used here. Inside a template in the select
       * list, Drizzle renders a column UNQUALIFIED — `"id"` — which is correct
       * at the top level and wrong inside a subquery over another table:
       * `where oi.order_id = "id"` resolves "id" to `order_items.id` and
       * compares an order id against an item id. It matches nothing, raises no
       * error, and every order reads as empty. It shipped that way for an hour
       * and the item counts were all zero.
       *
       * Writing `orders.id` as text keeps the correlation explicit. Safe
       * because the outer query selects from `orders` without an alias.
       *
       * Units, not lines: three of one cable is three items to a shopper.
       */
      itemCount: sql<number>`(
        select coalesce(sum(oi.quantity), 0)::int
        from order_items oi where oi.order_id = orders.id
      )`,
      leadTitle: sql<string | null>`(
        select oi.product_title from order_items oi
        where oi.order_id = orders.id
        order by oi.total_cents desc limit 1
      )`,
    })
    .from(orders)
    .where(eq(orders.userId, user.id))
    // Ordered in SQL, where the coalesce belongs: it decides which rows come
    // back, and doing it in TypeScript would mean sorting a page of the wrong
    // rows.
    .orderBy(desc(sql`coalesce(${orders.placedAt}, ${orders.createdAt})`))
    .limit(limit);

  return rows.map(({ createdAt, placedAt, ...rest }) => ({
    ...rest,
    placedAt: placedAt ?? createdAt,
  }));
}

/**
 * One order of this customer's, by its number.
 *
 * Addressed by order number rather than id because that is what the customer
 * has: it is on the thank-you page and it is what they read out on the phone.
 *
 * Numbers are sequential and therefore guessable, so the owner check is in the
 * where clause — the number identifies the order, it does not authorise access
 * to it. A number belonging to someone else reads exactly like one that does
 * not exist.
 */
export async function loadMyOrder(
  orderNumber: string,
): Promise<MyOrder | null> {
  const user = await currentUser();
  if (!user) return null;

  const [order] = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      // Real Date objects, for the reason above.
      placedAt: orders.placedAt,
      createdAt: orders.createdAt,
      status: orders.status,
      paymentStatus: orders.paymentStatus,
      totalCents: orders.totalCents,
      subtotalCents: orders.subtotalCents,
      shippingCents: orders.shippingCents,
      discountCents: orders.discountCents,
      codFeeCents: orders.codFeeCents,
      email: orders.email,
      phone: orders.phone,
      customerNote: orders.customerNote,
      shippingAddress: orders.shippingAddress,
      confirmedAt: orders.confirmedAt,
      cancelledAt: orders.cancelledAt,
    })
    .from(orders)
    .where(
      and(eq(orders.orderNumber, orderNumber), eq(orders.userId, user.id)),
    );

  if (!order) return null;

  const lines = await db
    .select({
      productTitle: orderItems.productTitle,
      variantTitle: orderItems.variantTitle,
      sku: orderItems.sku,
      quantity: orderItems.quantity,
      unitPriceCents: orderItems.unitPriceCents,
      totalCents: orderItems.totalCents,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id))
    .orderBy(desc(orderItems.totalCents));

  const address = (order.shippingAddress ?? {}) as OrderAddress;

  const { createdAt, placedAt, ...rest } = order;

  return {
    ...rest,
    placedAt: placedAt ?? createdAt,
    shippingAddress: address,
    itemCount: lines.reduce((n, line) => n + line.quantity, 0),
    leadTitle: lines[0]?.productTitle ?? null,
    lines,
  };
}
