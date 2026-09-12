import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { loadMyOrders } from "@/lib/account/orders";
import { describeOrder, amountDueCents } from "@/lib/account/order-status";
import { currentUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Your orders · DRPHONE",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

const day = (date: Date) =>
  date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/** Badge colours by what the state means, not by which state it is. */
const TONE = {
  waiting: "border-warn text-warn",
  moving: "border-accent bg-accent-soft text-accent",
  done: "border-line text-muted",
  stopped: "border-line text-muted line-through",
} as const;

export default async function OrdersPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=%2Faccount%2Forders");

  const orders = await loadMyOrders();

  return (
    <>
      <h1 className="display text-3xl">Your orders</h1>
      <p className="mt-2 max-w-prose text-muted">
        Everything you have ordered from us, newest first. Cash is paid to the
        driver, so nothing here has been charged to a card.
      </p>

      {orders.length === 0 ? (
        <p className="mt-8 text-muted">
          Nothing yet.{" "}
          <Link href="/categories" className="text-accent underline">
            Have a look around
          </Link>
          .
        </p>
      ) : (
        <ul
          aria-label="Your orders"
          className="mt-8 divide-y divide-line border-y border-line"
        >
          {orders.map((order) => {
            const state = describeOrder(order.status, order.paymentStatus);
            const due = amountDueCents(
              order.status,
              order.paymentStatus,
              order.totalCents,
            );

            return (
              <li key={order.id}>
                <Link
                  href={`/account/orders/${order.orderNumber}` as Route}
                  /* A grid, not flex-wrap: wrapping put the total on its own
                     line under the date, where a right-aligned figure reads as
                     a stray indent. Two columns keep it beside the number at
                     every width. */
                  className="grid grid-cols-[1fr_auto] items-start gap-x-4 gap-y-1 py-4 hover:text-accent"
                >
                  <span className="min-w-0">
                    <span className="block font-medium">
                      {order.orderNumber}
                      <span
                        className={`ml-2 rounded border px-1.5 py-0.5 text-xs font-normal ${TONE[state.tone]}`}
                      >
                        {state.label}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-sm text-muted">
                      {day(order.placedAt)} · {order.itemCount} item
                      {order.itemCount === 1 ? "" : "s"}
                      {order.leadTitle ? ` · ${order.leadTitle}` : ""}
                    </span>
                  </span>

                  <span className="shrink-0 text-right">
                    <span className="block tabular">
                      {money(order.totalCents)}
                    </span>
                    {/* The line that matters on a cash-on-delivery order. */}
                    {due !== null ? (
                      <span className="block text-xs text-muted">
                        to pay at the door
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
