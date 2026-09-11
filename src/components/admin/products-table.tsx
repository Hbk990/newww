"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { buildTableHref, formatMoney, type TableQuery } from "@/lib/admin/table";
import {
  archiveProducts,
  restoreProducts,
  setProductAvailability,
} from "@/lib/admin/product-actions";

export type ProductRow = {
  id: string;
  slug: string;
  title: string;
  status: string;
  imageUrl: string | null;
  brand: string | null;
  category: string | null;
  minPriceCents: number | null;
  maxPriceCents: number | null;
  costCents: number | null;
  variantCount: number;
  inStock: boolean;
  updatedAt: Date;
};

const SORTS: { key: string; label: string }[] = [
  { key: "updated", label: "Updated" },
  { key: "title", label: "Name" },
  { key: "price", label: "Price" },
];

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "active"
      ? "text-good"
      : status === "draft"
        ? "text-warn"
        : "text-muted";
  return (
    <span className={`text-xs font-medium capitalize ${tone}`}>{status}</span>
  );
}

export function ProductsTable({
  rows,
  query,
  base,
  showCost,
  canEditStock,
  canArchive,
}: {
  rows: ProductRow[];
  query: TableQuery;
  base: string;
  showCost: boolean;
  canEditStock: boolean;
  canArchive: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<{
    text: string;
    undo?: () => Promise<void>;
  } | null>(null);

  /**
   * Optimistic availability, keyed by product.
   *
   * The switch has to answer instantly — it is the action repeated most in this
   * admin — but the server is the truth. A failure puts the row back and says
   * so rather than leaving the screen disagreeing with the database.
   */
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const isAvailable = (row: ProductRow) => optimistic[row.id] ?? row.inStock;

  const pad = query.density === "compact" ? "py-1.5" : "py-2.5";
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function toggleAll() {
    setSelected(allOnPage ? new Set() : new Set(rows.map((r) => r.id)));
  }

  function toggleOne(id: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function flipAvailability(row: ProductRow) {
    const next = !isAvailable(row);
    setOptimistic((p) => ({ ...p, [row.id]: next }));
    start(async () => {
      try {
        await setProductAvailability(row.id, next);
      } catch {
        setOptimistic((p) => ({ ...p, [row.id]: !next }));
        setToast({ text: `Couldn't update ${row.title}. Nothing was changed.` });
      }
    });
  }

  function archiveSelected() {
    const ids = [...selected];
    // Typing to confirm is reserved for bulk actions over ten rows and anything
    // permanent — friction where it is earned, and nowhere else.
    if (ids.length > 10) {
      const typed = window.prompt(
        `Archive ${ids.length} products? Type ARCHIVE to confirm.`,
      );
      if (typed !== "ARCHIVE") return;
    } else if (!window.confirm(`Archive ${ids.length} products?`)) {
      return;
    }
    start(async () => {
      const n = await archiveProducts(ids);
      setSelected(new Set());
      setToast({
        text: `${n} ${n === 1 ? "product" : "products"} archived.`,
        undo: async () => {
          await restoreProducts(ids);
          setToast({ text: "Restored." });
        },
      });
    });
  }

  const sortHref = (key: string) =>
    buildTableHref(base, query, {
      sort: key,
      dir: query.sort === key && query.dir === "desc" ? "asc" : "desc",
    }) as Route;

  return (
    <>
      {selected.size > 0 ? (
        <div className="mb-2 flex flex-wrap items-center gap-3 rounded-md border border-accent bg-accent-soft px-3 py-2 text-sm">
          <span>
            {selected.size} selected on this page
            {/* Extending to every match is one click away, but never the
                default: selecting hundreds of invisible rows is easy to regret. */}
          </span>
          {canArchive ? (
            <button
              type="button"
              onClick={archiveSelected}
              disabled={pending}
              className="rounded border border-line bg-raised px-2.5 py-1 font-medium disabled:opacity-60"
            >
              Archive
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-muted underline"
          >
            Clear
          </button>
        </div>
      ) : null}

      {/*
        The container scrolls, not the page.

        `overflow-x-auto` alone makes this div a scroll container in BOTH axes
        per spec, so a `sticky top-14` header inside it offsets 56px down from
        the container — landing on top of the first rows and swallowing their
        clicks, rather than clearing the top bar as intended. Giving the
        container a bounded height makes it a real scroller, so `top-0` sticks
        the header where it belongs and the sticky first column works too.
      */}
      <div className="max-h-[calc(100svh-15rem)] overflow-auto rounded-lg border border-line">
        <table className="w-full min-w-[44rem] border-collapse text-sm">
          <thead className="sticky top-0 z-20 bg-sunken text-left">
            <tr className="border-b border-line">
              <th scope="col" className="sticky left-0 z-30 bg-sunken px-3 py-2">
                <input
                  type="checkbox"
                  checked={allOnPage}
                  onChange={toggleAll}
                  aria-label="Select all on this page"
                />
              </th>
              <th scope="col" className="sticky left-10 z-30 bg-sunken px-2 py-2 font-medium">
                <Link href={sortHref("title")} className="hover:underline">
                  Product {query.sort === "title" ? (query.dir === "asc" ? "↑" : "↓") : ""}
                </Link>
              </th>
              <th scope="col" className="px-3 py-2 font-medium">Category</th>
              <th scope="col" className="px-3 py-2 font-medium">
                <Link href={sortHref("price")} className="hover:underline">
                  Price {query.sort === "price" ? (query.dir === "asc" ? "↑" : "↓") : ""}
                </Link>
              </th>
              {showCost ? (
                <>
                  <th scope="col" className="px-3 py-2 font-medium">Cost</th>
                  <th scope="col" className="px-3 py-2 font-medium">Margin</th>
                </>
              ) : null}
              <th scope="col" className="px-3 py-2 font-medium">Variants</th>
              <th scope="col" className="px-3 py-2 font-medium">Available</th>
              <th scope="col" className="px-3 py-2 font-medium">
                <Link href={sortHref("updated")} className="hover:underline">
                  Updated {query.sort === "updated" ? (query.dir === "asc" ? "↑" : "↓") : ""}
                </Link>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const available = isAvailable(row);
              const margin =
                row.minPriceCents !== null && row.costCents
                  ? Math.round(
                      ((row.minPriceCents - row.costCents) / row.minPriceCents) * 100,
                    )
                  : null;
              return (
                <tr
                  key={row.id}
                  className="border-b border-line last:border-0 hover:bg-sunken/60"
                >
                  <td className={`sticky left-0 z-10 bg-raised px-3 ${pad}`}>
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggleOne(row.id)}
                      aria-label={`Select ${row.title}`}
                    />
                  </td>
                  <td className={`sticky left-10 z-10 bg-raised px-2 ${pad}`}>
                    <div className="flex items-center gap-2.5">
                      {row.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={row.imageUrl}
                          alt=""
                          width={32}
                          height={32}
                          className="size-8 shrink-0 rounded border border-line object-cover"
                        />
                      ) : (
                        <span className="grid size-8 shrink-0 place-items-center rounded border border-dashed border-line text-[10px] text-muted">
                          —
                        </span>
                      )}
                      <span className="min-w-0">
                        <Link
                          href={`/admin/products/${row.id}` as Route}
                          className="block truncate font-medium hover:underline"
                        >
                          {row.title}
                        </Link>
                        <span className="flex items-center gap-1.5 text-xs text-muted">
                          <StatusPill status={row.status} />
                          {row.brand ? <>· {row.brand}</> : null}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td className={`px-3 text-muted ${pad}`}>{row.category ?? "—"}</td>
                  <td className={`px-3 tabular ${pad}`}>
                    {row.minPriceCents !== null &&
                    row.maxPriceCents !== null &&
                    row.minPriceCents !== row.maxPriceCents
                      ? `${formatMoney(row.minPriceCents)}–${formatMoney(row.maxPriceCents)}`
                      : formatMoney(row.minPriceCents)}
                  </td>
                  {showCost ? (
                    <>
                      <td className={`px-3 tabular text-muted ${pad}`}>
                        {formatMoney(row.costCents)}
                      </td>
                      <td className={`px-3 tabular ${pad} ${margin !== null && margin < 15 ? "text-warn" : ""}`}>
                        {margin === null ? "—" : `${margin}%`}
                      </td>
                    </>
                  ) : null}
                  <td className={`px-3 tabular text-muted ${pad}`}>{row.variantCount}</td>
                  <td className={`px-3 ${pad}`}>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={available}
                      aria-label={`${available ? "Available" : "Unavailable"}: ${row.title}`}
                      disabled={!canEditStock}
                      onClick={() => flipAvailability(row)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full border transition-colors disabled:opacity-50 ${
                        available
                          ? "border-good bg-good"
                          : "border-line bg-sunken"
                      }`}
                    >
                      <span
                        className={`absolute size-3.5 rounded-full bg-surface transition-all ${
                          available ? "left-[1.1rem]" : "left-0.5"
                        }`}
                      />
                    </button>
                  </td>
                  <td className={`px-3 text-xs text-muted tabular ${pad}`}>
                    {row.updatedAt.toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                    })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Sort menu for phones, where the table header scrolls out of reach. */}
      <div className="mt-2 flex gap-1.5 md:hidden">
        {SORTS.map((sort) => (
          <Link
            key={sort.key}
            href={sortHref(sort.key)}
            className={`rounded-full border px-2.5 py-1 text-xs ${
              query.sort === sort.key
                ? "border-accent bg-accent-soft"
                : "border-line text-muted"
            }`}
          >
            {sort.label}
          </Link>
        ))}
      </div>

      {toast ? (
        <div
          role="status"
          className="fixed bottom-24 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-md border border-line bg-raised px-4 py-2.5 text-sm shadow-lg md:bottom-6"
        >
          <span>{toast.text}</span>
          {toast.undo ? (
            <button
              type="button"
              onClick={() => {
                const undo = toast.undo;
                setToast(null);
                start(async () => {
                  await undo?.();
                  router.refresh();
                });
              }}
              className="font-medium text-accent underline"
            >
              Undo
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss"
            className="text-muted"
          >
            ×
          </button>
        </div>
      ) : null}
    </>
  );
}
