import Link from "next/link";
import { notFound } from "next/navigation";

import { StockAdjust } from "@/components/admin/stock-adjust";
import { loadLedger, loadStock } from "@/lib/admin/inventory-actions";
import { requirePermission } from "@/lib/auth/guards";

export const metadata = { title: "Adjust stock · DRPHONE" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ variant?: string }>;
}) {
  await requirePermission("inventory.adjust");
  const { variant: variantId } = await searchParams;

  if (!variantId) {
    return (
      <>
        <Link href="/admin/stock" className="text-sm text-accent underline">
          ← Stock
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">Adjust stock</h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Pick a counted variant from the stock list to record a movement
          against it. Variants that sell on the availability switch have no
          quantity to adjust.
        </p>
      </>
    );
  }

  // A malformed uuid would make Postgres raise 22P02 rather than return no
  // rows, which surfaces as a 500.
  if (!/^[0-9a-f-]{36}$/i.test(variantId)) notFound();

  const rows = await loadStock();
  const variant = rows.find((r) => r.variantId === variantId);
  if (!variant) notFound();

  const ledger = await loadLedger(variantId);

  return (
    <>
      <Link href="/admin/stock" className="text-sm text-accent underline">
        ← Stock
      </Link>
      <h1 className="mt-2 text-xl font-semibold tracking-tight">
        {variant.productTitle}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {variant.variantTitle}
        {variant.sku ? (
          <span className="ml-2 font-mono text-xs">{variant.sku}</span>
        ) : null}
      </p>

      {!variant.track ? (
        <p className="mt-4 rounded-md border border-warn bg-raised px-3 py-2.5 text-sm">
          This variant sells on its availability switch and has no counted
          quantity. Turn counting on from the stock list first — it asks for an
          opening count, because starting at zero would take it off sale
          immediately.
        </p>
      ) : (
        <StockAdjust variant={variant} ledger={ledger} />
      )}
    </>
  );
}
