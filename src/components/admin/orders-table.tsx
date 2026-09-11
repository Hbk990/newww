"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Route } from "next";

import { useToast } from "@/components/admin/toast";
import { confirmMany, type OrderListRow } from "@/lib/admin/order-actions";
import { STATUS_LABELS } from "@/lib/orders/lifecycle";

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

export function OrdersTable({ rows }: { rows: OrderListRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Only orders awaiting a call can be bulk-confirmed; selecting a delivered
  // one and pressing confirm would be a no-op the server rejects.
  const callable = rows.filter((r) => r.status === "new");
  const selectedCallable = [...selected].filter((id) =>
    callable.some((r) => r.id === id),
  );

  function confirmSelected() {
    start(async () => {
      const result = await confirmMany(selectedCallable);
      if (!result.ok) {
        toast({ text: result.error, tone: "error" });
        return;
      }
      toast({
        text: `${selectedCallable.length} order${
          selectedCallable.length === 1 ? "" : "s"
        } confirmed.`,
      });
      setSelected(new Set());
      router.refresh();
    });
  }

  return (
    <>
      {selectedCallable.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md bg-accent-soft px-3 py-2 text-sm">
          <span>{selectedCallable.length} awaiting a call selected</span>
          <button
            type="button"
            disabled={pending}
            onClick={confirmSelected}
            className="text-accent underline"
          >
            Mark as reached and confirmed
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
        <table className="w-full min-w-[48rem] text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="w-8 px-3 py-2.5">
                <input
                  type="checkbox"
                  aria-label="Select all awaiting a call"
                  checked={
                    callable.length > 0 && selectedCallable.length === callable.length
                  }
                  onChange={(e) =>
                    setSelected(
                      e.target.checked ? new Set(callable.map((r) => r.id)) : new Set(),
                    )
                  }
                />
              </th>
              <th className="px-3 py-2.5 font-medium">Order</th>
              <th className="px-3 py-2.5 font-medium">Customer</th>
              <th className="px-3 py-2.5 font-medium">State</th>
              <th className="px-3 py-2.5 font-medium">Items</th>
              <th className="px-3 py-2.5 font-medium">Total</th>
              <th className="px-3 py-2.5 font-medium">Placed</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-0">
                <td className="px-3 py-2">
                  {row.status === "new" ? (
                    <input
                      type="checkbox"
                      aria-label={`Select ${row.orderNumber}`}
                      checked={selected.has(row.id)}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(row.id);
                        else next.delete(row.id);
                        setSelected(next);
                      }}
                    />
                  ) : null}
                </td>

                <td className="px-3 py-2">
                  <Link
                    href={`/admin/orders/${row.id}` as Route}
                    className="font-mono text-xs font-medium text-accent underline"
                  >
                    {row.orderNumber}
                  </Link>
                  {row.source !== "web" ? (
                    <span className="ml-1.5 rounded bg-sunken px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                      {row.source}
                    </span>
                  ) : null}
                </td>

                <td className="px-3 py-2">
                  <span className="block">{row.phone}</span>
                  <span className="block text-xs text-muted">{row.email}</span>
                </td>

                <td className="px-3 py-2">
                  <span
                    className={
                      row.status === "new"
                        ? "font-medium text-warn"
                        : row.status === "cancelled" || row.status === "returned"
                          ? "text-muted"
                          : ""
                    }
                  >
                    {STATUS_LABELS[row.status] ?? row.status}
                  </span>
                  {row.status === "new" && row.confirmAttempts > 0 ? (
                    <span className="block text-xs text-muted">
                      {row.confirmAttempts} call
                      {row.confirmAttempts === 1 ? "" : "s"}, no answer
                    </span>
                  ) : null}
                  {row.paymentStatus === "paid" ? (
                    <span className="block text-xs text-good">cash collected</span>
                  ) : null}
                </td>

                <td className="px-3 py-2 tabular">{row.lines}</td>
                <td className="px-3 py-2 tabular">{money(row.totalCents)}</td>
                <td className="px-3 py-2 text-xs text-muted">
                  {new Date(row.createdAt).toLocaleString("en-GB", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          No orders here yet. Orders arrive from the storefront, or you can take
          one by hand.
        </p>
      ) : null}
    </>
  );
}
