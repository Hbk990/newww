import Link from "next/link";

import { WishlistList } from "@/components/shop/wishlist-list";
import { requireVerified } from "@/lib/auth/guards";
import { loadWishlist } from "@/lib/shop/wishlist";

export const metadata = { title: "Saved items · DRPHONE" };
export const dynamic = "force-dynamic";

export default async function WishlistPage() {
  // requireVerified, not requirePermission: this is a customer's own page.
  await requireVerified();
  const items = await loadWishlist();

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Saved items</h1>

      {items.length === 0 ? (
        <>
          <p className="mt-3 text-sm text-muted">
            Nothing saved yet. Tap the heart on anything you want to come back
            to.
          </p>
          <p className="mt-6 text-sm">
            <Link href="/" className="underline underline-offset-4">
              Back to the shop
            </Link>
          </p>
        </>
      ) : (
        <WishlistList items={items} />
      )}
    </main>
  );
}
