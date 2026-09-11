import Link from "next/link";
import type { Route } from "next";

import { OrdersTable } from "@/components/admin/orders-table";
import { loadOrders, orderCounts } from "@/lib/admin/order-actions";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { STATUS_LABELS, STATUS_ORDER } from "@/lib/orders/lifecycle";

export const metadata = { title: "Orders · DRPHONE" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const user = await requirePermission("orders.view");
  const params = await searchParams;
  const status = STATUS_ORDER.includes(params.status as "new")
    ? params.status
    : undefined;

  const [rows, { counts, total }] = await Promise.all([
    loadOrders({ status, query: params.q }),
    orderCounts(),
  ]);

  const href = (next?: string) => {
    const query = new URLSearchParams();
    if (params.q) query.set("q", params.q);
    if (next) query.set("status", next);
    const s = query.toString();
    return (s ? `/admin/orders?${s}` : "/admin/orders") as Route;
  };

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Orders</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Cash on delivery has no payment step, so a confirmation call takes
            its place. Nothing gets packed until someone has spoken to the
            customer.
          </p>
        </div>
        {can(user, "orders.create") ? (
          <Link
            href="/admin/orders/new"
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-on-accent"
          >
            Take an order
          </Link>
        ) : null}
      </div>

      {(counts.new ?? 0) > 0 ? (
        <Link
          href={href("new")}
          className="mt-4 block rounded-lg border border-warn bg-raised px-4 py-3"
        >
          <span className="font-medium">
            {counts.new} order{counts.new === 1 ? "" : "s"} waiting for a call
          </span>
          <span className="block text-sm text-muted">
            These are not being packed yet.
          </span>
        </Link>
      ) : null}

      <form className="mt-4 flex flex-wrap items-center gap-2">
        <input
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Order number, phone or email"
          aria-label="Search orders"
          className="w-full max-w-xs rounded-md border border-line bg-surface px-3 py-2 text-sm"
        />
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <button type="submit" className="rounded-md border border-line px-3 py-1.5 text-sm">
          Search
        </button>
        {params.q ? (
          <Link href={href(status)} className="text-xs text-muted underline">
            Clear
          </Link>
        ) : null}
      </form>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Link
          href={href()}
          className={`rounded-full border px-2.5 py-1 text-xs ${
            !status ? "border-accent bg-accent-soft" : "border-line text-muted"
          }`}
        >
          All <span className="tabular">{total}</span>
        </Link>
        {STATUS_ORDER.filter((key) => (counts[key] ?? 0) > 0).map((key) => (
          <Link
            key={key}
            href={href(key)}
            className={`rounded-full border px-2.5 py-1 text-xs ${
              status === key ? "border-accent bg-accent-soft" : "border-line text-muted"
            }`}
          >
            {STATUS_LABELS[key]} <span className="tabular">{counts[key]}</span>
          </Link>
        ))}
      </div>

      <OrdersTable rows={rows} />
    </>
  );
}
