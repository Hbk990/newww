import type { Route } from "next";
import Link from "next/link";

import { Photo } from "@/components/shop/photo";
import type { ListingCard } from "@/lib/shop/listing";

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

/**
 * One product in a list: square photo, name, price.
 *
 * Two per row on a phone, by the grid that holds it — accessories sell on how
 * they look, and a 170px photo is enough to tell a braided cable from a rubber
 * one.
 *
 * `line-clamp-2` on the title: these names run to "Cover - Transperent
 * Android", and a card that grows to fit the longest name in the row leaves
 * the rest of the grid ragged.
 */
export function ProductCard({ card }: { card: ListingCard }) {
  const price =
    card.minPriceCents === null
      ? null
      : card.maxPriceCents && card.maxPriceCents !== card.minPriceCents
        ? `${money(card.minPriceCents)} – ${money(card.maxPriceCents)}`
        : money(card.minPriceCents);

  return (
    <Link href={`/products/${card.slug}` as Route} className="group block">
      <div className="overflow-hidden rounded-lg border border-line bg-sunken">
        <Photo
          url={card.imageUrl}
          alt=""
          className="aspect-square w-full object-contain transition-transform duration-500 ease-out group-hover:scale-[1.03]"
        />
      </div>
      <div className="mt-2">
        {card.brandName ? (
          <p className="truncate text-xs text-muted">{card.brandName}</p>
        ) : null}
        <p className="line-clamp-2 text-sm font-medium">{card.title}</p>
        <p className="mt-0.5 text-sm tabular">
          {price ?? "—"}
          {card.inStock ? null : (
            <span className="ml-2 text-xs text-muted">out of stock</span>
          )}
        </p>
      </div>
    </Link>
  );
}
