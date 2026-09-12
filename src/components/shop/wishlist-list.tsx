"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { toggleWishlist } from "@/lib/shop/wishlist";
import type { WishlistEntry } from "@/lib/shop/wishlist";

const money = (cents: number | null) =>
  cents === null
    ? "—"
    : `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

export function WishlistList({ items }: { items: WishlistEntry[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <ul className="mt-6 divide-y divide-line border-y border-line">
      {items.map((item) => (
        <li key={item.productId} className="flex items-start gap-4 py-4">
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              <Link
                href={`/products/${item.slug}` as Route}
                className="underline-offset-4 hover:underline"
              >
                {item.title}
              </Link>
            </p>
            <p className="text-sm text-muted">
              from {money(item.minPriceCents)}
              {item.inStock ? "" : " · out of stock"}
            </p>
          </div>

          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await toggleWishlist(item.productId);
                router.refresh();
              })
            }
            aria-label={`Remove ${item.title} from saved items`}
            className="py-1 text-sm text-warn underline disabled:opacity-50"
          >
            Remove
          </button>
        </li>
      ))}
    </ul>
  );
}
