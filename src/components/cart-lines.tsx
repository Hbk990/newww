"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { clearCart, setCartLine } from "@/lib/cart/actions";
import type { CartLine } from "@/lib/cart/cart";

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

export function CartLines({
  lines,
  subtotalCents,
}: {
  lines: CartLine[];
  subtotalCents: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function change(variantId: string, quantity: number) {
    start(async () => {
      const result = await setCartLine(variantId, quantity);
      setError(result.ok ? null : result.error);
      router.refresh();
    });
  }

  const blocked = lines.some((line) => !line.purchasable);

  return (
    <>
      {error ? (
        <p className="mt-4 rounded-md border border-warn px-3 py-2 text-sm text-warn">
          {error}
        </p>
      ) : null}

      <ul className="mt-6 divide-y divide-line border-y border-line">
        {lines.map((line) => (
          <li key={line.variantId} className="flex flex-wrap gap-4 py-4">
            <div className="min-w-48 flex-1">
              {/*
                Plain text, not a link: there is no /products/[slug] route yet
                and `typedRoutes` rejects a link to one. It becomes a link when
                the storefront product page exists — productSlug is already
                carried on the line for that.
              */}
              <p className="font-medium">{line.productTitle}</p>
              <p className="text-sm text-muted">
                {line.variantTitle}
                {line.sku ? ` · ${line.sku}` : null}
              </p>

              {!line.purchasable ? (
                <p className="mt-1 text-sm text-warn">
                  No longer available — remove it to continue.
                </p>
              ) : null}

              {/*
                A price change is stated rather than silently applied. The
                figure charged is always today's; saying so is the difference
                between a shop and a bait-and-switch.
              */}
              {line.purchasable && line.priceChanged ? (
                <p className="mt-1 text-sm text-warn">
                  Price changed from {money(line.addedPriceCents)} since you
                  added this.
                </p>
              ) : null}

              {line.sellable !== null && line.quantity > line.sellable ? (
                <p className="mt-1 text-sm text-warn">
                  Only {line.sellable} left.
                </p>
              ) : null}
            </div>

            <div className="flex items-start gap-3">
              <label className="text-sm">
                <span className="sr-only">
                  Quantity for {line.productTitle} {line.variantTitle}
                </span>
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={line.quantity}
                  disabled={pending}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    if (Number.isInteger(next) && next >= 1) {
                      change(line.variantId, next);
                    }
                  }}
                  className="w-16 rounded-md border border-line bg-surface px-2 py-1.5 text-sm"
                />
              </label>

              <span className="w-20 py-1.5 text-right text-sm tabular">
                {money(line.lineTotalCents)}
              </span>

              <button
                type="button"
                disabled={pending}
                onClick={() => change(line.variantId, 0)}
                className="py-1.5 text-sm text-warn underline disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await clearCart();
              router.refresh();
            })
          }
          className="text-sm text-muted underline"
        >
          Empty basket
        </button>

        <div className="text-right">
          <p className="text-sm text-muted">
            Items <span className="tabular">{money(subtotalCents)}</span>
          </p>
          <p className="mt-1 text-xs text-muted">
            Delivery is added at checkout.
          </p>
          {blocked ? (
            <p className="mt-2 text-sm text-warn">
              Remove the unavailable items to continue.
            </p>
          ) : (
            <Link
              href="/checkout"
              className="mt-3 inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent"
            >
              Checkout
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
