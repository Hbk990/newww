import Link from "next/link";
import { redirect } from "next/navigation";

import { CheckoutForm } from "@/components/checkout-form";
import { currentUser } from "@/lib/auth/session";
import { loadCart } from "@/lib/cart/cart";
import { PROVISIONAL_DELIVERY_FEE_CENTS } from "@/lib/checkout/fees";

export const metadata = { title: "Checkout · DRPHONE" };
export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const cart = await loadCart();

  // An empty basket has nothing to check out. Redirecting rather than showing
  // an empty form avoids someone filling in an address for no order.
  if (!cart || cart.lines.length === 0) redirect("/cart");

  /*
   * A line that cannot be bought sends them back rather than being dropped
   * quietly. Silently removing something they chose, at the moment they are
   * about to commit, is how a shop loses trust.
   */
  if (cart.lines.some((line) => !line.purchasable)) redirect("/cart");

  const user = await currentUser();

  return (
    <main className="mx-auto max-w-lg px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Checkout</h1>
      <p className="mt-2 text-sm text-muted">
        {cart.count} item{cart.count === 1 ? "" : "s"} ·{" "}
        <Link href="/cart" className="underline underline-offset-4">
          edit basket
        </Link>
      </p>

      <CheckoutForm
        subtotalCents={cart.subtotalCents}
        deliveryCents={PROVISIONAL_DELIVERY_FEE_CENTS}
        defaultEmail={user?.email ?? null}
      />
    </main>
  );
}
