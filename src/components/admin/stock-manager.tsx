"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Route } from "next";

import { useToast } from "@/components/admin/toast";
import {
  setAvailable,
  setAvailableBulk,
  setLowStockThreshold,
  setTracking,
  type StockRow,
} from "@/lib/admin/inventory-actions";

export function StockManager({ rows }: { rows: StockRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** Which variant is mid-way through switching tracking on. */
  const [opening, setOpening] = useState<{ id: string; value: string } | null>(null);

  /*
   * Availability answers instantly and is put back if the server disagrees.
   *
   * This is the most repeated action on the page — going through a round trip
   * before the switch moves makes flipping twenty variants feel broken.
   */
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const isAvailable = (row: StockRow) => optimistic[row.variantId] ?? row.available;

  function flip(row: StockRow) {
    const next = !isAvailable(row);
    setOptimistic((p) => ({ ...p, [row.variantId]: next }));
    start(async () => {
      const result = await setAvailable(row.variantId, next);
      if (!result.ok) {
        setOptimistic((p) => ({ ...p, [row.variantId]: !next }));
        toast({ text: result.error, tone: "error" });
        return;
      }
      router.refresh();
    });
  }

  function stopTracking(row: StockRow) {
    start(async () => {
      const result = await setTracking(row.variantId, false);
      if (!result.ok) {
        toast({ text: result.error, tone: "error" });
        return;
      }
      toast({ text: `${row.variantTitle} is back on the availability switch.` });
      router.refresh();
    });
  }

  function startTracking() {
    if (!opening) return;
    const target = opening;
    start(async () => {
      const result = await setTracking(target.id, true, target.value);
      if (!result.ok) {
        toast({ text: result.error, tone: "error" });
        return;
      }
      setOpening(null);
      toast({ text: `Counting from ${result.onHand} units.` });
      router.refresh();
    });
  }

  function bulk(available: boolean) {
    const ids = [...selected];
    start(async () => {
      const result = await setAvailableBulk(ids, available);
      if (!result.ok) {
        toast({ text: result.error, tone: "error" });
        return;
      }
      setSelected(new Set());
      setOptimistic({});
      toast({
        text: `${ids.length} variant${ids.length === 1 ? "" : "s"} marked ${
          available ? "available" : "unavailable"
        }.`,
      });
      router.refresh();
    });
  }

  const isLow = (row: StockRow) =>
    row.track &&
    row.lowStockThreshold !== null &&
    row.onHand - row.reserved <= row.lowStockThreshold;

  return (
    <>
      {selected.size > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md bg-accent-soft px-3 py-2 text-sm">
          <span>{selected.size} selected</span>
          <button
            type="button"
            disabled={pending}
            onClick={() => bulk(true)}
            className="text-accent underline"
          >
            Mark available
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => bulk(false)}
            className="text-accent underline"
          >
            Mark unavailable
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto text-xs text-muted underline"
          >
            Clear
          </button>
        </div>
      ) : null}

      <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-raised">
        <table className="w-full min-w-[52rem] text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="w-8 px-3 py-2.5">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={selected.size === rows.length && rows.length > 0}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked ? new Set(rows.map((r) => r.variantId)) : new Set(),
                    )
                  }
                />
              </th>
              <th className="px-3 py-2.5 font-medium">Product</th>
              <th className="px-3 py-2.5 font-medium">SKU</th>
              <th className="px-3 py-2.5 font-medium">How it sells</th>
              <th className="px-3 py-2.5 font-medium">On hand</th>
              <th className="px-3 py-2.5 font-medium">Low at</th>
              <th className="px-3 py-2.5 font-medium">On sale</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.variantId}
                className={`border-b border-line last:border-0 ${
                  selected.has(row.variantId) ? "bg-accent-soft" : ""
                }`}
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label={`Select ${row.productTitle} ${row.variantTitle}`}
                    checked={selected.has(row.variantId)}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(row.variantId);
                      else next.delete(row.variantId);
                      setSelected(next);
                    }}
                  />
                </td>

                <td className="px-3 py-2">
                  <Link
                    href={`/admin/products/${row.productId}` as Route}
                    className="font-medium text-accent underline"
                  >
                    {row.productTitle}
                  </Link>
                  <span className="block text-xs text-muted">
                    {row.variantTitle}
                    {row.brand ? ` · ${row.brand}` : null}
                  </span>
                </td>

                <td className="px-3 py-2 font-mono text-xs text-muted">
                  {row.sku ?? "—"}
                </td>

                <td className="px-3 py-2">
                  {row.track ? (
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded bg-sunken px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                        counted
                      </span>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => stopTracking(row)}
                        className="text-[11px] text-muted underline"
                      >
                        stop counting
                      </button>
                    </span>
                  ) : opening?.id === row.variantId ? (
                    <span className="flex items-center gap-1.5">
                      <input
                        value={opening.value}
                        onChange={(e) => setOpening({ ...opening, value: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") startTracking();
                          if (e.key === "Escape") setOpening(null);
                        }}
                        // The field appears because the user just clicked to open this
                        // editor, so focus is where they are already looking. The rule
                        // guards against stealing focus on page load, a different thing.
                        // eslint-disable-next-line jsx-a11y/no-autofocus
                        autoFocus
                        inputMode="numeric"
                        placeholder="count"
                        aria-label={`Opening count for ${row.variantTitle}`}
                        className="w-20 rounded border border-line bg-surface px-1.5 py-1 text-xs"
                      />
                      <button
                        type="button"
                        disabled={pending}
                        onClick={startTracking}
                        className="text-[11px] text-accent underline"
                      >
                        start
                      </button>
                      <button
                        type="button"
                        onClick={() => setOpening(null)}
                        className="text-[11px] text-muted underline"
                      >
                        cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setOpening({ id: row.variantId, value: "" })}
                      className="text-[11px] text-muted underline"
                    >
                      switch only · start counting
                    </button>
                  )}
                </td>

                <td className="px-3 py-2 tabular">
                  {row.track ? (
                    <span className={isLow(row) ? "font-medium text-warn" : ""}>
                      {row.onHand - row.reserved}
                      {row.reserved > 0 ? (
                        <span className="text-xs text-muted">
                          {" "}
                          ({row.onHand} − {row.reserved} held)
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    // Not "0" — that would read as out of stock. An untracked
                    // variant has no quantity, by design.
                    <span className="text-muted">not counted</span>
                  )}
                </td>

                <td className="px-3 py-2">
                  {row.track ? (
                    <input
                      defaultValue={row.lowStockThreshold?.toString() ?? ""}
                      onBlur={(e) => {
                        const next = e.target.value.trim();
                        if (next === (row.lowStockThreshold?.toString() ?? "")) return;
                        start(async () => {
                          const result = await setLowStockThreshold(row.variantId, next);
                          if (!result.ok) {
                            toast({ text: result.error, tone: "error" });
                            return;
                          }
                          router.refresh();
                        });
                      }}
                      inputMode="numeric"
                      placeholder="—"
                      aria-label={`Low stock level for ${row.variantTitle}`}
                      className="w-16 rounded border border-transparent bg-transparent px-1.5 py-1 text-xs hover:border-line focus:border-accent focus:bg-surface focus:outline-none"
                    />
                  ) : (
                    <span className="text-xs text-muted">—</span>
                  )}
                </td>

                <td className="px-3 py-2">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isAvailable(row)}
                      onChange={() => flip(row)}
                      aria-label={`On sale: ${row.productTitle} ${row.variantTitle}`}
                    />
                    <span className="text-xs text-muted">
                      {isAvailable(row) ? "Yes" : "No"}
                    </span>
                  </label>
                </td>

                <td className="px-3 py-2 text-right">
                  {row.track ? (
                    <Link
                      href={`/admin/stock/adjust?variant=${row.variantId}` as Route}
                      className="text-xs text-accent underline"
                    >
                      Adjust
                    </Link>
                  ) : (
                    <span
                      className="text-xs text-muted"
                      title="Only counted variants have a quantity to adjust"
                    >
                      —
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          Nothing matches. Every variant gets an inventory row when its product
          is saved, so an empty list here means no products yet.
        </p>
      ) : null}

      {rows.length === 300 ? (
        <p className="mt-2 text-xs text-muted">
          Showing the first 300. Narrow the search to see the rest.
        </p>
      ) : null}
    </>
  );
}
