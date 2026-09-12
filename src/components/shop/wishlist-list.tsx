"use client";

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
            {/*
              Plain text, not a link: /products/[slug] does not exist yet and
              typedRoutes rejects a link to it. `slug` is carried on the entry
              ready for when it does.
            */}
            <p className="font-medium">{item.title}</p>
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
