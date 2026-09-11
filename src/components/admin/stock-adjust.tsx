"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useToast } from "@/components/admin/toast";
import { adjustStock, type StockRow } from "@/lib/admin/inventory-actions";
import { ADJUST_REASONS, REASON_LABELS } from "@/lib/admin/inventory-reasons";

export type LedgerRow = {
  id: string;
  delta: number;
  reason: string;
  note: string | null;
  referenceId: string | null;
  createdAt: Date;
};

export function StockAdjust({
  variant,
  ledger,
}: {
  variant: StockRow;
  ledger: LedgerRow[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"change" | "set">("change");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState<string>("received");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const sellable = variant.onHand - variant.reserved;
  const parsed = Number(amount);
  const valid = amount.trim() !== "" && Number.isInteger(parsed);

  // What the shelf will read afterwards, so the consequence is visible before
  // the button is pressed rather than reported after it.
  const projected = !valid
    ? null
    : mode === "set"
      ? parsed
      : variant.onHand + parsed;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    start(async () => {
      const result = await adjustStock({
        variantId: variant.variantId,
        mode,
        amount,
        reason,
        note,
      });
      if (!result.ok) {
        setError(result.error);
        toast({ text: result.error, tone: "error" });
        return;
      }
      setAmount("");
      setNote("");
      toast({ text: `Recorded. ${result.onHand} on hand.` });
      router.refresh();
    });
  }

  return (
    <>
      <div className="mt-4 grid gap-5 lg:grid-cols-[22rem_1fr]">
        <form onSubmit={submit} className="space-y-4">
          <div className="rounded-lg border border-line bg-raised p-4">
            <p className="text-xs uppercase tracking-wide text-muted">On hand now</p>
            <p className="mt-1 font-mono text-2xl tabular">
              {sellable}
              {variant.reserved > 0 ? (
                <span className="ml-2 text-xs text-muted">
                  {variant.onHand} counted, {variant.reserved} held for checkouts
                </span>
              ) : null}
            </p>
          </div>

          <fieldset>
            <legend className="text-sm font-medium">What happened</legend>
            <div className="mt-2 flex gap-2">
              {(
                [
                  { key: "change", label: "Add or remove" },
                  { key: "set", label: "Count says" },
                ] as const
              ).map((option) => (
                <label
                  key={option.key}
                  className={`flex-1 cursor-pointer rounded-md border px-3 py-2 text-center text-sm ${
                    mode === option.key ? "border-accent bg-accent-soft" : "border-line"
                  }`}
                >
                  <input
                    type="radio"
                    name="mode"
                    value={option.key}
                    checked={mode === option.key}
                    onChange={() => {
                      setMode(option.key);
                      setAmount("");
                    }}
                    className="sr-only"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block">
            <span className="text-sm font-medium">
              {mode === "set" ? "Counted on the shelf" : "Change by"}
            </span>
            <span className="mt-0.5 block text-xs text-muted">
              {mode === "set"
                ? "The number actually there. The difference is recorded for you."
                : "Negative to remove — −2 for two damaged."}
            </span>
            <input
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setError(null);
              }}
              inputMode={mode === "set" ? "numeric" : "text"}
              placeholder={mode === "set" ? "7" : "−2"}
              autoFocus
              className="mt-1.5 w-full rounded-md border border-line bg-surface px-3 py-2 font-mono text-sm"
            />
          </label>

          {projected !== null ? (
            <p
              className={`text-xs ${projected < 0 ? "text-warn" : "text-muted"}`}
            >
              {projected < 0
                ? `That would leave ${projected} — stock cannot go below zero.`
                : `Leaves ${projected} on hand.`}
            </p>
          ) : null}

          <label className="block">
            <span className="text-sm font-medium">Reason</span>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
            >
              {ADJUST_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium">Note</span>
            <span className="mt-0.5 block text-xs text-muted">
              Optional, but the ledger is the only record of why.
            </span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              placeholder="Box damaged in transit"
              className="mt-1.5 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
            />
          </label>

          {error ? <p className="text-sm text-warn">{error}</p> : null}

          <button
            type="submit"
            disabled={pending || !valid || (projected ?? 0) < 0}
            className="w-full rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-on-accent disabled:opacity-50"
          >
            {pending ? "Recording…" : "Record movement"}
          </button>
        </form>

        <div>
          <h2 className="text-base font-semibold">History</h2>
          <p className="mt-1 text-sm text-muted">
            Append-only — the database refuses to change or delete these rows, so
            the quantity above is always the sum of what is below.
          </p>

          {ledger.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No movements recorded yet.</p>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-raised">
              <table className="w-full min-w-[28rem] text-sm">
                <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">When</th>
                    <th className="px-3 py-2.5 font-medium">Change</th>
                    <th className="px-3 py-2.5 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((entry) => (
                    <tr key={entry.id} className="border-b border-line last:border-0">
                      <td className="px-3 py-2 text-xs text-muted">
                        {new Date(entry.createdAt).toLocaleString("en-GB", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-3 py-2 font-mono tabular">
                        <span className={entry.delta < 0 ? "text-warn" : "text-good"}>
                          {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {REASON_LABELS[entry.reason] ?? entry.reason}
                        {entry.note ? (
                          <span className="block text-xs text-muted">{entry.note}</span>
                        ) : null}
                        {entry.referenceId ? (
                          <span className="block text-xs text-muted">
                            against an order
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
