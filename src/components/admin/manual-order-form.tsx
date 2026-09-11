"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";

import { useToast } from "@/components/admin/toast";
import { createManualOrder } from "@/lib/admin/order-actions";

export type SellableVariant = {
  variantId: string;
  label: string;
  sku: string | null;
  priceCents: number;
  tracked: boolean;
  sellable: number | null;
};

type Line = { variantId: string; quantity: string };

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

export function ManualOrderForm({ variants }: { variants: SellableVariant[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [line1, setLine1] = useState("");
  const [city, setCity] = useState("");
  const [note, setNote] = useState("");
  const [shipping, setShipping] = useState("3.00");
  const [source, setSource] = useState<"whatsapp" | "admin">("whatsapp");
  const [lines, setLines] = useState<Line[]>([{ variantId: "", quantity: "1" }]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  /*
   * The idempotency key is minted once per form, not per submit.
   *
   * That is the whole point: pressing the button twice sends the same key, and
   * the second attempt replays the first order instead of creating a duplicate
   * delivery. A new key is minted only after a successful save, for the next
   * order.
   */
  const keyRef = useRef(crypto.randomUUID());

  const byId = useMemo(
    () => new Map(variants.map((v) => [v.variantId, v])),
    [variants],
  );

  const filled = lines.filter((l) => l.variantId && Number(l.quantity) > 0);
  const subtotal = filled.reduce((sum, line) => {
    const variant = byId.get(line.variantId);
    return sum + (variant ? variant.priceCents * Number(line.quantity) : 0);
  }, 0);
  const shippingCents = /^\d{1,5}(\.\d{1,2})?$/.test(shipping.trim())
    ? Math.round(Number(shipping) * 100)
    : 0;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    start(async () => {
      const result = await createManualOrder(keyRef.current, {
        email,
        phone,
        line1,
        city,
        note: note || null,
        shipping,
        source,
        lines: filled.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
      });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast({ text: result.error, tone: "error" });
        return;
      }
      toast({ text: `${result.orderNumber} created.` });
      // A fresh key, so the next order is a new one rather than a replay.
      keyRef.current = crypto.randomUUID();
      router.push(`/admin/orders/${result.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="mt-5 grid gap-5 lg:grid-cols-[1fr_18rem]">
      <div className="min-w-0 space-y-4">
        <fieldset className="rounded-lg border border-line bg-raised p-4">
          <legend className="px-1 text-sm font-medium">Items</legend>
          <div className="space-y-2">
            {lines.map((line, index) => {
              const variant = byId.get(line.variantId);
              return (
                <div key={index} className="flex flex-wrap items-start gap-2">
                  <select
                    value={line.variantId}
                    onChange={(e) =>
                      setLines(
                        lines.map((l, i) =>
                          i === index ? { ...l, variantId: e.target.value } : l,
                        ),
                      )
                    }
                    aria-label={`Item ${index + 1}`}
                    className="min-w-48 flex-1 rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm"
                  >
                    <option value="">Choose an item</option>
                    {variants.map((v) => (
                      <option key={v.variantId} value={v.variantId}>
                        {v.label}
                        {v.tracked ? ` (${v.sellable} left)` : ""} —{" "}
                        {money(v.priceCents)}
                      </option>
                    ))}
                  </select>

                  <input
                    value={line.quantity}
                    onChange={(e) =>
                      setLines(
                        lines.map((l, i) =>
                          i === index ? { ...l, quantity: e.target.value } : l,
                        ),
                      )
                    }
                    inputMode="numeric"
                    aria-label={`Quantity for item ${index + 1}`}
                    className="w-16 rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm"
                  />

                  <span className="w-20 py-1.5 text-right text-sm tabular">
                    {variant ? money(variant.priceCents * Number(line.quantity || 0)) : "—"}
                  </span>

                  {lines.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => setLines(lines.filter((_, i) => i !== index))}
                      aria-label={`Remove item ${index + 1}`}
                      className="py-1.5 text-xs text-warn underline"
                    >
                      Remove
                    </button>
                  ) : null}

                  {/*
                    A tracked variant asked for beyond what is on the shelf is
                    flagged here, but the server is the authority — the shelf
                    can change between this render and the save.
                  */}
                  {variant?.tracked &&
                  variant.sellable !== null &&
                  Number(line.quantity) > variant.sellable ? (
                    <span className="w-full text-xs text-warn">
                      Only {variant.sellable} left on the shelf.
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setLines([...lines, { variantId: "", quantity: "1" }])}
            className="mt-2 text-sm text-accent underline"
          >
            + Add another item
          </button>
          {errors.lines ? (
            <p className="mt-1 text-xs text-warn">{errors.lines}</p>
          ) : null}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone" error={errors.phone} hint="How the order gets confirmed.">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+961 70 000 000"
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Email" error={errors.email}>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="customer@example.com"
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Street address" error={errors.line1}>
            <input
              value={line1}
              onChange={(e) => setLine1(e.target.value)}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
            />
          </Field>
          <Field label="City" error={errors.city}>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Beirut"
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
            />
          </Field>
        </div>

        <Field label="Note" error={errors.note}>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder="Ring the bell twice"
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
          />
        </Field>
      </div>

      <aside className="space-y-4">
        <Field label="How it came in">
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as "whatsapp" | "admin")}
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
          >
            <option value="whatsapp">WhatsApp</option>
            <option value="admin">Phone or in person</option>
          </select>
        </Field>

        <Field label="Delivery fee" error={errors.shipping}>
          <div className="flex items-center gap-1">
            <span className="text-sm text-muted">$</span>
            <input
              value={shipping}
              onChange={(e) => setShipping(e.target.value)}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 font-mono text-sm"
            />
          </div>
        </Field>

        <div className="rounded-lg border border-line bg-raised p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Items</span>
            <span className="tabular">{money(subtotal)}</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-muted">Delivery</span>
            <span className="tabular">{money(shippingCents)}</span>
          </div>
          <div className="mt-2 flex justify-between border-t border-line pt-2 font-medium">
            <span>To collect</span>
            <span className="tabular">{money(subtotal + shippingCents)}</span>
          </div>
        </div>

        <button
          type="submit"
          disabled={pending || filled.length === 0}
          className="w-full rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-on-accent disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create order"}
        </button>
        <p className="text-xs text-muted">
          It lands awaiting a confirmation call, the same as a web order.
        </p>
      </aside>
    </form>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      {hint ? <span className="mt-0.5 block text-xs text-muted">{hint}</span> : null}
      <span className="mt-1.5 block">{children}</span>
      {error ? <span className="mt-1 block text-xs text-warn">{error}</span> : null}
    </label>
  );
}
