import Link from "next/link";
import { notFound } from "next/navigation";

import { OrderDetail } from "@/components/admin/order-detail";
import { loadOrder } from "@/lib/admin/order-actions";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";

export const metadata = { title: "Order · DRPHONE" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("orders.view");
  const { id } = await params;

  // A malformed uuid makes Postgres raise 22P02 rather than return no rows,
  // which would surface as a 500.
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const loaded = await loadOrder(id);
  if (!loaded) notFound();

  return (
    <>
      <Link href="/admin/orders" className="text-sm text-accent underline">
        ← Orders
      </Link>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-mono text-xl font-semibold tracking-tight">
          {loaded.order.orderNumber}
        </h1>
        <span className="text-xs text-muted">
          {loaded.order.source === "web" ? "From the website" : `Taken by hand · ${loaded.order.source}`}
        </span>
      </div>

      <OrderDetail
        order={loaded.order}
        items={loaded.items}
        events={loaded.events}
        canConfirm={can(user, "orders.confirm")}
        canEdit={can(user, "orders.edit")}
      />
    </>
  );
}
