"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useToast } from "@/components/admin/toast";
import { advanceStatus, recordCall } from "@/lib/admin/order-actions";
import { EVENT_LABELS, NEXT_STATUS, STATUS_LABELS } from "@/lib/orders/lifecycle";

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

export type OrderDetailOrder = {
  id: string;
  orderNumber: string;
  email: string;
  phone: string;
  status: string;
  paymentStatus: string;
  subtotalCents: number;
  shippingCents: number;
  discountCents: number;
  totalCents: number;
  shippingAddress: unknown;
  customerNote: string | null;
  source: string;
  confirmAttempts: number;
  createdAt: Date;
};

export type OrderDetailItem = {
  id: string;
  productTitle: string;
  variantTitle: string;
  sku: string | null;
  unitPriceCents: number;
  quantity: number;
  totalCents: number;
};

export type OrderDetailEvent = {
  id: string;
  type: string;
  data: unknown;
  createdAt: Date;
};

export function OrderDetail({
  order,
  items,
  events,
  canConfirm,
  canEdit,
}: {
  order: OrderDetailOrder;
  items: OrderDetailItem[];
  events: OrderDetailEvent[];
  canConfirm: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const next = NEXT_STATUS[order.status] ?? [];
  const address = order.shippingAddress as Record<string, string> | null;

  function call(outcome: "reached" | "no_answer") {
    start(async () => {
      const result = await recordCall(order.id, outcome, note || undefined);
      if (!result.ok) {
        toast({ text: result.error, tone: "error" });
        return;
      }
      setNote("");
      toast({
        text:
          outcome === "reached"
            ? "Confirmed. It can be packed now."
            : "Attempt recorded — it stays in the call queue.",
      });
      router.refresh();
    });
  }

  function move(to: string) {
    start(async () => {
      const result = await advanceStatus(order.id, to);
      if (!result.ok) {
        toast({ text: result.error, tone: "error" });
        setConfirmingCancel(false);
        return;
      }
      setConfirmingCancel(false);
      toast({ text: `Now ${STATUS_LABELS[to]?.toLowerCase() ?? to}.` });
      router.refresh();
    });
  }

  return (
    <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_20rem]">
      <div className="min-w-0 space-y-5">
        {/*
          The call queue is the first thing on an unconfirmed order, because
          with cash on delivery it is the step that replaces payment: nothing
          gets packed until someone has spoken to the customer.
        */}
        {order.status === "new" && canConfirm ? (
          <section className="rounded-lg border border-warn bg-raised p-4">
            <h2 className="text-base font-semibold">Confirm by phone</h2>
            <p className="mt-1 text-sm text-muted">
              Nothing is packed until this call happens.
              {order.confirmAttempts > 0
                ? ` ${order.confirmAttempts} attempt${
                    order.confirmAttempts === 1 ? "" : "s"
                  } so far.`
                : null}
            </p>
            <p className="mt-2 font-mono text-lg">{order.phone}</p>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What was said — optional"
              maxLength={200}
              aria-label="Call note"
              className="mt-3 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => call("reached")}
                className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-on-accent disabled:opacity-50"
              >
                Reached — confirm the order
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => call("no_answer")}
                className="rounded-md border border-line px-3 py-1.5 text-sm disabled:opacity-50"
              >
                No answer
              </button>
            </div>
          </section>
        ) : null}

        <section className="overflow-x-auto rounded-lg border border-line bg-raised">
          <table className="w-full min-w-[30rem] text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2.5 font-medium">Item</th>
                <th className="px-3 py-2.5 font-medium">Each</th>
                <th className="px-3 py-2.5 font-medium">Qty</th>
                <th className="px-3 py-2.5 font-medium">Line</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-line last:border-0">
                  <td className="px-3 py-2">
                    {item.productTitle}
                    <span className="block text-xs text-muted">
                      {item.variantTitle}
                      {item.sku ? ` · ${item.sku}` : null}
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular">{money(item.unitPriceCents)}</td>
                  <td className="px-3 py-2 tabular">{item.quantity}</td>
                  <td className="px-3 py-2 tabular">{money(item.totalCents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-line">
              <tr>
                <td colSpan={3} className="px-3 py-1.5 text-right text-muted">
                  Items
                </td>
                <td className="px-3 py-1.5 tabular">{money(order.subtotalCents)}</td>
              </tr>
              <tr>
                <td colSpan={3} className="px-3 py-1.5 text-right text-muted">
                  Delivery
                </td>
                <td className="px-3 py-1.5 tabular">{money(order.shippingCents)}</td>
              </tr>
              <tr>
                <td colSpan={3} className="px-3 py-2 text-right font-medium">
                  To collect on delivery
                </td>
                <td className="px-3 py-2 font-medium tabular">
                  {money(order.totalCents)}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>

        <section>
          <h2 className="text-base font-semibold">What has happened</h2>
          <ul className="mt-2 space-y-2">
            {events.map((event) => (
              <li key={event.id} className="flex gap-3 text-sm">
                <span className="w-28 shrink-0 text-xs text-muted">
                  {new Date(event.createdAt).toLocaleString("en-GB", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span>
                  {EVENT_LABELS[event.type] ?? event.type}
                  {noteOf(event.data) ? (
                    <span className="block text-xs text-muted">{noteOf(event.data)}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <aside className="space-y-4">
        <div className="rounded-lg border border-line bg-raised p-4">
          <p className="text-xs uppercase tracking-wide text-muted">State</p>
          <p className="mt-1 text-lg font-medium">
            {STATUS_LABELS[order.status] ?? order.status}
          </p>
          <p className="mt-1 text-xs text-muted">
            {order.paymentStatus === "paid"
              ? "Cash collected on delivery."
              : "Cash due on delivery."}
          </p>

          {canEdit && next.length > 0 ? (
            <div className="mt-3 space-y-2">
              {next
                .filter((to) => to !== "cancelled")
                .map((to) => (
                  <button
                    key={to}
                    type="button"
                    disabled={pending}
                    onClick={() => move(to)}
                    className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-on-accent disabled:opacity-50"
                  >
                    {to === "delivered"
                      ? "Delivered — cash collected"
                      : to === "returned"
                        ? "Came back — refused or nobody home"
                        : `Mark ${STATUS_LABELS[to]?.toLowerCase() ?? to}`}
                  </button>
                ))}

              {next.includes("cancelled") ? (
                confirmingCancel ? (
                  <div className="rounded-md border border-warn p-2 text-xs">
                    <p>Cancel this order?</p>
                    <p className="mt-1 text-muted">
                      Any counted stock taken for it goes back on the shelf, and
                      the ledger records why. This cannot be undone — a
                      cancelled order has no way back.
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => move("cancelled")}
                        className="font-medium text-warn underline"
                      >
                        Yes, cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingCancel(false)}
                        className="text-muted underline"
                      >
                        Keep it
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingCancel(true)}
                    className="w-full rounded-md border border-line px-3 py-2 text-sm text-warn"
                  >
                    Cancel order
                  </button>
                )
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="rounded-lg border border-line bg-raised p-4 text-sm">
          <p className="text-xs uppercase tracking-wide text-muted">Deliver to</p>
          <p className="mt-1">{address?.line1 ?? "—"}</p>
          <p>{address?.city ?? ""}</p>
          <p className="mt-2 font-mono text-xs">{order.phone}</p>
          <p className="font-mono text-xs text-muted">{order.email}</p>
          {order.customerNote ? (
            <>
              <p className="mt-3 text-xs uppercase tracking-wide text-muted">Note</p>
              <p className="mt-0.5">{order.customerNote}</p>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

/** Events carry a jsonb blob; only the note is worth showing inline. */
function noteOf(data: unknown): string | null {
  if (data && typeof data === "object" && "note" in data) {
    const note = (data as { note?: unknown }).note;
    if (typeof note === "string" && note.trim()) return note;
  }
  return null;
}
