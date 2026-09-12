import Link from "next/link";

import { CartLines } from "@/components/cart-lines";
import { loadCart } from "@/lib/cart/cart";

export const metadata = { title: "Basket · DRPHONE" };

/**
 * Never cached: a basket is per-visitor and changes on every action. Without
 * this the first shopper's cart would be served to the next one.
 */
export const dynamic = "force-dynamic";

export default async function CartPage() {
  const cart = await loadCart();

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Your basket</h1>

      {!cart || cart.lines.length === 0 ? (
        <>
          <p className="mt-3 text-sm text-muted">There is nothing in it yet.</p>
          <p className="mt-6 text-sm">
            <Link href="/" className="underline underline-offset-4">
              Back to the shop
            </Link>
          </p>
        </>
      ) : (
        <CartLines lines={cart.lines} subtotalCents={cart.subtotalCents} />
      )}
    </main>
  );
}
