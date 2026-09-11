import Link from "next/link";
import type { Route } from "next";

import { StockManager } from "@/components/admin/stock-manager";
import { loadStock, stockCounts } from "@/lib/admin/inventory-actions";
import { requirePermission } from "@/lib/auth/guards";

export const metadata = { title: "Stock · DRPHONE" };

const FILTERS = [
  { key: "", label: "All" },
  { key: "low", label: "Running low" },
  { key: "unavailable", label: "Off sale" },
  { key: "tracked", label: "Counted" },
  { key: "untracked", label: "Switch only" },
] as const;

type Only = "tracked" | "untracked" | "low" | "unavailable";

export default async function Page({
  searchParams,
}: {
  // A Promise in this version — awaited before use.
  searchParams: Promise<{ q?: string; only?: string }>;
}) {
  await requirePermission("inventory.view");
  const params = await searchParams;
  const only = FILTERS.some((f) => f.key === params.only && f.key !== "")
    ? (params.only as Only)
    : undefined;

  const [rows, counts] = await Promise.all([
    loadStock({ query: params.q, only }),
    stockCounts(),
  ]);

  const href = (key: string) => {
    const next = new URLSearchParams();
    if (params.q) next.set("q", params.q);
    if (key) next.set("only", key);
    const query = next.toString();
    return (query ? `/admin/stock?${query}` : "/admin/stock") as Route;
  };

  const countFor = (key: string) =>
    key === "" ? counts.total : counts[key as keyof typeof counts];

  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Stock</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Most variants sell on a switch, which is the default — you are a
        wholesaler and not everything on the shelf is for retail. Turn counting
        on for the few where the number matters.
      </p>

      {/* A GET form, so a filtered view is a URL someone can bookmark or share. */}
      <form className="mt-4 flex flex-wrap items-center gap-2">
        <input
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Search product, variant or SKU"
          aria-label="Search stock"
          className="w-full max-w-xs rounded-md border border-line bg-surface px-3 py-2 text-sm"
        />
        {only ? <input type="hidden" name="only" value={only} /> : null}
        <button
          type="submit"
          className="rounded-md border border-line px-3 py-1.5 text-sm"
        >
          Search
        </button>
        {params.q ? (
          <Link href={href(only ?? "")} className="text-xs text-muted underline">
            Clear
          </Link>
        ) : null}
      </form>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {FILTERS.map((filter) => {
          const active = (only ?? "") === filter.key;
          return (
            <Link
              key={filter.key}
              href={href(filter.key)}
              className={`rounded-full border px-2.5 py-1 text-xs ${
                active ? "border-accent bg-accent-soft" : "border-line text-muted"
              }`}
            >
              {filter.label}
              <span className="ml-1 tabular">{countFor(filter.key)}</span>
            </Link>
          );
        })}
      </div>

      <StockManager rows={rows} />
    </>
  );
}
