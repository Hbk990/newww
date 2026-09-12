import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ReorderButton } from "@/components/shop/reorder-button";
import {
  amountDueCents,
  canStillChange,
  describeOrder,
} from "@/lib/account/order-status";
import { loadMyOrder } from "@/lib/account/orders";
import { currentUser } from "@/lib/auth/session";
import { storefrontSettings } from "@/lib/storefront/settings";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ number: string }>;
}): Promise<Metadata> {
  const { number } = await params;
  return {
    title: `Order ${number} · DRPHONE`,
    robots: { index: false, follow: false },
  };
}

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

const moment = (date: Date) =>
  date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export default async function OrderPage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const { number } = await params;

  const user = await currentUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/account/orders/${number}`)}`);
  }

  const [order, settings] = await Promise.all([
    loadMyOrder(number),
    storefrontSettings(),
  ]);

  /*
   * Someone else's order number reads exactly like one that does not exist.
   * The owner check is in the query, so this 404 covers both — which is the
   * point: a different answer for "exists but not yours" would confirm that
   * the number is real.
   */
  if (!order) notFound();

  const state = describeOrder(order.status, order.paymentStatus);
  const due = amountDueCents(
    order.status,
    order.paymentStatus,
    order.totalCents,
  );
  const address = order.shippingAddress;

  return (
    <>
      <p className="text-sm text-muted">
        <Link href="/account/orders" className="underline underline-offset-4">
          Your orders
        </Link>
      </p>

      <h1 className="display mt-2 text-3xl">Order {order.orderNumber}</h1>
      <p className="mt-1 text-sm text-muted">{moment(order.placedAt)}</p>

      {/* Where it is, in one box, in words a person says out loud. */}
      <div className="mt-6 rounded-xl border border-line bg-raised p-4">
        <p className="font-medium">{state.label}</p>
        <p className="mt-1 text-sm text-muted">{state.detail}</p>

        {due !== null ? (
          <p className="mt-3 border-t border-line pt-3 text-sm">
            <span className="font-medium tabular">{money(due)}</span> to pay the
            driver, in cash.
          </p>
        ) : null}

        {canStillChange(order.status) && settings.phone ? (
          <p className="mt-2 text-sm text-muted">
            Need to change something? Call us on{" "}
            <a
              href={`tel:${settings.phone.replace(/\s/g, "")}`}
              className="text-ink underline underline-offset-4"
            >
              {settings.phone}
            </a>{" "}
            while it is still with us.
          </p>
        ) : null}
      </div>

      {/*
        The lines are the snapshot the order was placed with — titles and
        prices as they were that day, not as they are now. A product renamed or
        repriced since must not change what this says was bought.
      */}
      <h2 className="display mt-10 text-xl">What you ordered</h2>
      <ul
        aria-label="Items in this order"
        className="mt-3 divide-y divide-line border-y border-line"
      >
        {order.lines.map((line, index) => (
          <li
            key={`${line.sku ?? line.productTitle}-${index}`}
            className="flex items-start justify-between gap-4 py-3"
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium">
                {line.productTitle}
              </span>
              <span className="block text-sm text-muted">
                {line.variantTitle}
                {line.sku ? ` · ${line.sku}` : ""}
              </span>
              <span className="block text-sm text-muted tabular">
                {line.quantity} × {money(line.unitPriceCents)}
              </span>
            </span>
            <span className="shrink-0 text-sm tabular">
              {money(line.totalCents)}
            </span>
          </li>
        ))}
      </ul>

      <dl className="mt-4 space-y-1.5 text-sm">
        <Row label="Items" value={money(order.subtotalCents)} />
        {order.discountCents > 0 ? (
          <Row label="Discount" value={`−${money(order.discountCents)}`} />
        ) : null}
        <Row label="Delivery" value={money(order.shippingCents)} />
        {order.codFeeCents > 0 ? (
          <Row label="Collection fee" value={money(order.codFeeCents)} />
        ) : null}
        <div className="flex items-baseline justify-between border-t border-line pt-2 font-medium">
          <dt>Total</dt>
          <dd className="tabular">{money(order.totalCents)}</dd>
        </div>
      </dl>

      <h2 className="display mt-10 text-xl">Where it went</h2>
      <address className="mt-3 text-sm not-italic text-muted">
        {[
          address.line1,
          address.building,
          address.floor ? `floor ${address.floor}` : null,
          address.city,
          address.region,
        ]
          .filter(Boolean)
          .join(", ")}
        <br />
        {order.phone}
        <br />
        {order.email}
      </address>

      {address.directions ? (
        <p className="mt-2 text-sm text-muted">{address.directions}</p>
      ) : null}

      {order.customerNote ? (
        <>
          <h2 className="display mt-10 text-xl">Your note</h2>
          <p className="mt-2 text-sm text-muted">{order.customerNote}</p>
        </>
      ) : null}

      <div className="mt-10 border-t border-line pt-6">
        <ReorderButton orderNumber={order.orderNumber} />
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}
