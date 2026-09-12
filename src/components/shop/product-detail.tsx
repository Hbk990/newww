"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { setCartLine } from "@/lib/cart/actions";
import type { ShopProduct, ShopVariant } from "@/lib/shop/product";
import { toggleWishlist } from "@/lib/shop/wishlist";

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

/**
 * Price, choice and the add-to-basket button.
 *
 * The picker has two shapes because the catalog has two shapes. A product with
 * option types gets one control per axis — Device, Size, Colour — and the
 * selection resolves to a variant. A product without them but with several
 * variants gets a plain list of variant titles instead.
 *
 * That second case is not a fallback for tidiness: the imported catalog has 700
 * multi-variant products and no option types at all, so an axis-only picker
 * would leave every variant but the first unbuyable across most of the shop.
 */
export function ProductDetail({
  product,
  saved,
  whatsappNumber,
}: {
  product: ShopProduct;
  saved: boolean;
  whatsappNumber: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(saved);
  const [quantity, setQuantity] = useState(1);

  /*
   * The opener is the first variant that can actually be bought.
   *
   * Landing on a sold-out combination is a bad first impression on a page whose
   * whole job is to sell, and with device axes the first value by position is
   * rarely the one in stock.
   */
  const opener = useMemo(
    () => product.variants.find((v) => v.purchasable) ?? product.variants[0],
    [product.variants],
  );

  const hasAxes = product.axes.length > 0;

  /** One choice per axis. Unused when the product has no axes. */
  const [chosen, setChosen] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const axis of product.axes) {
      const match = axis.values.find((value) =>
        opener?.optionValueIds.includes(value.id),
      );
      if (match) seed[axis.id] = match.id;
    }
    return seed;
  });

  /** The chosen variant when there are no axes to choose along. */
  const [pickedId, setPickedId] = useState<string | undefined>(opener?.id);

  /**
   * The variant the shopper is looking at.
   *
   * The axis branch matches on every current choice. It must not fall back to
   * "the first variant that matches what we have so far": with a half-made
   * selection an every() over no choices is vacuously true, which would quietly
   * price and sell a variant nobody picked.
   */
  const selected: ShopVariant | undefined = useMemo(() => {
    if (!hasAxes) return product.variants.find((v) => v.id === pickedId);

    const wanted = Object.values(chosen);
    if (wanted.length !== product.axes.length) return undefined;
    return product.variants.find((variant) =>
      wanted.every((valueId) => variant.optionValueIds.includes(valueId)),
    );
  }, [chosen, hasAxes, pickedId, product.axes.length, product.variants]);

  /** Whether a value still leads to a real variant, given the other choices. */
  const reachable = (axisId: string, valueId: string): boolean => {
    const others = Object.entries(chosen).filter(([id]) => id !== axisId);
    return product.variants.some(
      (variant) =>
        variant.optionValueIds.includes(valueId) &&
        others.every(([, otherValue]) =>
          variant.optionValueIds.includes(otherValue),
        ),
    );
  };

  // A tracked variant caps the quantity at what is actually there; an untracked
  // one has no count to cap against, so the action's own ceiling applies.
  const max = selected?.sellable ?? 999;

  function add() {
    if (!selected) return;
    setMessage(null);
    setError(null);
    start(async () => {
      const result = await setCartLine(selected.id, Math.min(quantity, max));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage(
        `Added — ${result.count} item${result.count === 1 ? "" : "s"} in your basket.`,
      );
      router.refresh();
    });
  }

  const whatsappHref = whatsappNumber
    ? `https://wa.me/${whatsappNumber.replace(/\D/g, "")}?text=${encodeURIComponent(
        `Hi, I'd like to order: ${product.title}${
          selected && selected.title !== product.title
            ? ` (${selected.title})`
            : ""
        }`,
      )}`
    : null;

  return (
    <div className="space-y-5">
      <div>
        {product.brandName ? (
          <p className="text-sm text-muted">{product.brandName}</p>
        ) : null}
        <h1 className="display mt-1 text-3xl sm:text-4xl">{product.title}</h1>
        {product.shortDescription ? (
          <p className="mt-2 text-muted">{product.shortDescription}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-baseline gap-3">
        {selected ? (
          <>
            <span className="text-2xl font-semibold tabular">
              {money(selected.priceCents)}
            </span>
            {/* Shown only when the sale is genuinely cheaper — see wasCents. */}
            {selected.wasCents !== null ? (
              <>
                <span className="text-muted line-through tabular">
                  {money(selected.wasCents)}
                </span>
                <span className="rounded bg-accent-soft px-1.5 py-0.5 text-xs font-medium text-accent">
                  Save {money(selected.wasCents - selected.priceCents)}
                </span>
              </>
            ) : null}
          </>
        ) : (
          <span className="text-2xl font-semibold tabular">
            {priceRange(product)}
          </span>
        )}
      </div>

      {hasAxes
        ? product.axes.map((axis) => (
            <fieldset key={axis.id}>
              <legend className="text-sm font-medium">{axis.name}</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {axis.values.map((value) => {
                  const active = chosen[axis.id] === value.id;
                  const possible = reachable(axis.id, value.id);
                  return (
                    <button
                      key={value.id}
                      type="button"
                      aria-pressed={active}
                      disabled={!possible}
                      onClick={() =>
                        setChosen((prev) => ({ ...prev, [axis.id]: value.id }))
                      }
                      className={`rounded-md border px-3 py-1.5 text-sm ${
                        active
                          ? "border-accent bg-accent-soft font-medium text-accent"
                          : "border-line"
                      } ${
                        possible
                          ? ""
                          : "cursor-not-allowed text-muted line-through opacity-60"
                      }`}
                    >
                      {value.value}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))
        : product.variants.length > 1 ? (
            <fieldset>
              <legend className="text-sm font-medium">Choose an option</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {product.variants.map((variant) => {
                  const active = variant.id === selected?.id;
                  return (
                    <button
                      key={variant.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setPickedId(variant.id)}
                      className={`rounded-md border px-3 py-1.5 text-left text-sm ${
                        active
                          ? "border-accent bg-accent-soft font-medium text-accent"
                          : "border-line"
                      } ${variant.purchasable ? "" : "text-muted"}`}
                    >
                      {variant.title}
                      {variant.purchasable ? null : (
                        <span className="block text-xs">out of stock</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ) : null}

      {/*
        Stock is stated only when it is a real number and low enough to matter.
        "In stock (400)" is noise; "Only 2 left" is information — and most of
        this catalog is untracked anyway, where `sellable` is null by design.
      */}
      {typeof selected?.sellable === "number" &&
      selected.sellable > 0 &&
      selected.sellable <= 5 ? (
        <p className="text-sm text-warn">Only {selected.sellable} left.</p>
      ) : null}

      {selected && !selected.purchasable ? (
        <p className="text-sm text-warn">
          Out of stock{hasAxes ? " in this combination" : ""} — ask us and we
          will tell you when it is back.
        </p>
      ) : null}

      {!selected && hasAxes ? (
        <p className="text-sm text-muted">
          That combination is not one we carry. Pick another.
        </p>
      ) : null}

      {error ? (
        <p role="status" className="rounded-md border border-warn px-3 py-2 text-sm text-warn">
          {error}
        </p>
      ) : null}

      {message ? (
        <p
          role="status"
          className="rounded-md border border-line bg-accent-soft px-3 py-2 text-sm"
        >
          {message}{" "}
          <Link href="/cart" className="font-medium text-accent underline">
            Go to basket
          </Link>
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm">
          <span className="sr-only">Quantity</span>
          <input
            type="number"
            min={1}
            max={max}
            step={1}
            value={quantity}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isInteger(next) && next >= 1) setQuantity(next);
            }}
            className="w-16 rounded-md border border-line bg-surface px-2 py-2 text-sm"
          />
        </label>

        <button
          type="button"
          disabled={pending || !selected || !selected.purchasable}
          onClick={add}
          className="flex-1 rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-on-accent disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add to basket"}
        </button>

        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const result = await toggleWishlist(product.id);
              if (!result.ok) {
                setError(
                  result.reason === "signed_out"
                    ? "Sign in to save this."
                    : "That item no longer exists.",
                );
                return;
              }
              setError(null);
              setIsSaved(result.saved);
            })
          }
          aria-pressed={isSaved}
          className="rounded-md border border-line px-3 py-2.5 text-sm"
        >
          {isSaved ? "♥ Saved" : "♡ Save"}
        </button>
      </div>

      {/*
        WhatsApp sits beside the basket rather than replacing it. Plenty of
        shoppers here would rather send a message than fill in a form, and
        losing them to a checkout they did not want is worse than a second
        button. `noreferrer` as well as `noopener`: wa.me has no business
        knowing which product page the message came from.
      */}
      {whatsappHref ? (
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-md border border-line px-4 py-2.5 text-center text-sm font-medium"
          style={{ color: "var(--whatsapp)" }}
        >
          Ask about this on WhatsApp
        </a>
      ) : null}

      <p className="text-xs text-muted">
        Cash on delivery. We call to confirm before anything is packed.
      </p>

      {!isSaved ? null : (
        <p className="text-xs text-muted">
          Saved items live in{" "}
          <Link
            href={"/account/wishlist" as Route}
            className="underline underline-offset-4"
          >
            your account
          </Link>
          .
        </p>
      )}
    </div>
  );
}

/**
 * The headline figure before a variant is settled on.
 *
 * `min_price_cents` and `max_price_cents` are maintained on the product by
 * trigger, so this needs no arithmetic over the variants — and it stays right
 * when a variant is added while the page is cached.
 */
function priceRange(product: ShopProduct): string {
  if (product.minPriceCents === null) return "—";
  const max = product.maxPriceCents ?? product.minPriceCents;
  return product.minPriceCents === max
    ? money(product.minPriceCents)
    : `${money(product.minPriceCents)} – ${money(max)}`;
}
