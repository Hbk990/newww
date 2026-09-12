"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { placeOrder } from "@/lib/checkout/actions";

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

export function CheckoutForm({
  subtotalCents,
  deliveryCents,
  defaultEmail,
}: {
  subtotalCents: number;
  deliveryCents: number;
  defaultEmail: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [phone, setPhone] = useState("");
  const [line1, setLine1] = useState("");
  const [city, setCity] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);

  /*
   * One key per visit to this page, minted on mount and not per submit.
   *
   * That is the whole point of it: a double-tapped button, a retried request or
   * a back-then-forward all send the same key, and createOrder replays the
   * first order rather than creating a second. Two orders for one basket means
   * two deliveries and two collections of cash at the door.
   */
  const keyRef = useRef(crypto.randomUUID());

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setFailure(null);
    start(async () => {
      const result = await placeOrder(keyRef.current, {
        email,
        phone,
        line1,
        city,
        note: note || null,
      });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setFailure(result.error);
        return;
      }
      router.push(`/checkout/thanks?order=${encodeURIComponent(result.orderNumber)}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-5">
      {failure ? (
        <p className="rounded-md border border-warn px-3 py-2 text-sm text-warn">
          {failure}
        </p>
      ) : null}

      <Field
        label="Phone"
        hint="We call to confirm every order before it is packed."
        error={errors.phone}
      >
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+961 70 000 000"
          autoComplete="tel"
          className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
        />
      </Field>

      <Field label="Email" error={errors.email}>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          autoComplete="email"
          className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
        />
      </Field>

      <Field label="Street address" error={errors.line1}>
        <input
          value={line1}
          onChange={(e) => setLine1(e.target.value)}
          autoComplete="address-line1"
          className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
        />
      </Field>

      <Field label="City" error={errors.city}>
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="Beirut"
          autoComplete="address-level2"
          className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
        />
      </Field>

      <Field label="Anything we should know?" error={errors.note}>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder="Ring the bell twice"
          className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
        />
      </Field>

      <div className="rounded-lg border border-line bg-raised p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-muted">Items</span>
          <span className="tabular">{money(subtotalCents)}</span>
        </div>
        <div className="mt-1 flex justify-between">
          <span className="text-muted">Delivery</span>
          <span className="tabular">{money(deliveryCents)}</span>
        </div>
        <div className="mt-2 flex justify-between border-t border-line pt-2 font-medium">
          <span>To pay on delivery</span>
          <span className="tabular">{money(subtotalCents + deliveryCents)}</span>
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-on-accent disabled:opacity-50"
      >
        {pending ? "Placing your order…" : "Place order"}
      </button>

      <p className="text-xs text-muted">
        Cash on delivery. Nothing is charged now, and nothing is packed until we
        have spoken to you.
      </p>
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
