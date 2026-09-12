"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { placeOrder } from "@/lib/checkout/actions";
import { LEBANON_REGIONS, type Region } from "@/lib/shipping/regions";
import type { ShippingQuote } from "@/lib/shipping/quote";

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

export type CheckoutPrefill = {
  email: string;
  name: string;
  phone: string;
  line1: string;
  city: string;
  region: Region | "";
};

export function CheckoutForm({
  subtotalCents,
  quotes,
  prefill,
}: {
  subtotalCents: number;
  /**
   * A delivery quote per region we cover, priced on the server for this exact
   * basket. Regions missing from it are not delivered to.
   *
   * Passed in whole rather than fetched as the shopper picks, so the fee
   * updates the instant the select changes with no round trip — and without the
   * price ever being computed somewhere the shopper could edit it.
   */
  quotes: Record<string, ShippingQuote>;
  /**
   * The details this customer ordered with last time, or empty strings.
   *
   * Prefilled rather than merely remembered: an account exists so that nobody
   * types their address twice, and a form that arrives already filled in is
   * the only version of that promise a customer can see.
   */
  prefill: CheckoutPrefill;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(prefill.name);
  const [email, setEmail] = useState(prefill.email);
  const [phone, setPhone] = useState(prefill.phone);
  const [line1, setLine1] = useState(prefill.line1);
  const [city, setCity] = useState(prefill.city);
  const [region, setRegion] = useState<Region | "">(prefill.region);
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

  const quote = region ? quotes[region] : undefined;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setFailure(null);
    start(async () => {
      const result = await placeOrder(keyRef.current, {
        email,
        name,
        phone,
        line1,
        city,
        // The server re-quotes from this and ignores anything the page shows,
        // so a tampered fee cannot reach the order.
        region: region as Region,
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

      <Field label="Name" hint="Who the driver asks for." error={errors.name}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
        />
      </Field>

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

      <Field
        label="Governorate"
        hint="Sets the delivery fee."
        error={errors.region}
      >
        <select
          value={region}
          onChange={(e) => setRegion(e.target.value as Region | "")}
          className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
        >
          <option value="">Choose…</option>
          {LEBANON_REGIONS.map((name) => {
            // Named apart from the outer `quote`, which is the chosen region's.
            const option = quotes[name];
            return (
              <option key={name} value={name} disabled={!option}>
                {name}
                {option
                  ? ` — ${option.free ? "free delivery" : money(option.priceCents)}`
                  : " — not delivered to yet"}
              </option>
            );
          })}
        </select>
      </Field>

      <Field label="City or town" error={errors.city}>
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
          <span className="text-muted">
            Delivery{quote ? ` to ${quote.zoneName}` : ""}
          </span>
          <span className="tabular">
            {quote ? (quote.free ? "Free" : money(quote.priceCents)) : "—"}
          </span>
        </div>
        <div className="mt-2 flex justify-between border-t border-line pt-2 font-medium">
          <span>To pay on delivery</span>
          {/*
            Dashed until a governorate is chosen rather than showing the items
            total as if it were the total. A figure that then grows at the last
            moment is how a shop gets accused of a hidden charge.
          */}
          <span className="tabular">
            {quote ? money(subtotalCents + quote.priceCents) : "—"}
          </span>
        </div>
      </div>

      <button
        type="submit"
        disabled={pending || !quote}
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
