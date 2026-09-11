import Link from "next/link";

import { ManualOrderForm } from "@/components/admin/manual-order-form";
import { sellableVariants } from "@/lib/admin/order-actions";
import { requirePermission } from "@/lib/auth/guards";

export const metadata = { title: "Take an order · DRPHONE" };

export default async function Page() {
  await requirePermission("orders.create");
  const rows = await sellableVariants();

  const variants = [...rows].map((row) => ({
    variantId: row.variant_id,
    label: row.label,
    sku: row.sku,
    priceCents: Number(row.price_cents),
    tracked: row.tracked,
    sellable: row.sellable === null ? null : Number(row.sellable),
  }));

  return (
    <>
      <Link href="/admin/orders" className="text-sm text-accent underline">
        ← Orders
      </Link>
      <h1 className="mt-2 text-xl font-semibold tracking-tight">Take an order</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        For an order that arrives by phone or WhatsApp. It goes through exactly
        the same path as a web order — same stock claim, same prices from the
        database, same confirmation call.
      </p>

      {variants.length === 0 ? (
        <p className="mt-4 rounded-md border border-warn bg-raised px-3 py-2.5 text-sm">
          Nothing is on sale yet. A product needs to be active with an available
          variant before it can be ordered.
        </p>
      ) : (
        <ManualOrderForm variants={variants} />
      )}
    </>
  );
}
