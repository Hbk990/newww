import Link from "next/link";
import { redirect } from "next/navigation";

import { CheckoutForm } from "@/components/checkout-form";
import { currentUser } from "@/lib/auth/session";
import { loadCart } from "@/lib/cart/cart";
import { savedAddress } from "@/lib/checkout/address";
import { quotesByRegion } from "@/lib/shipping/quote";

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

  /*
   * An order needs an account.
   *
   * The basket does not — a shopper browses, adds things and only meets this
   * at the point of ordering, which is where the requirement actually pays
   * for itself: the delivery details and the order history get somewhere to
   * live, and the next order is two taps instead of a form.
   *
   * `next` brings them straight back here, and `adoptGuestCart` moves the
   * basket they built as a guest onto their account when they sign in, so the
   * detour costs them nothing they had already chosen.
   *
   * The action enforces this too. A page guard alone would leave the door open
   * to anything that posts to the action directly.
   */
  const user = await currentUser();
  if (!user) redirect("/login?next=%2Fcheckout");

  const [quotes, saved] = await Promise.all([
    // Priced for this basket, so a free-delivery threshold is reflected in the
    // figure beside each governorate rather than appearing only after
    // submitting.
    quotesByRegion(cart.subtotalCents),
    savedAddress(user.id),
  ]);

  return (
    <main className="mx-auto max-w-lg px-6 py-12">
      <h1 className="display text-3xl">Checkout</h1>
      <p className="mt-2 text-sm text-muted">
        {cart.count} item{cart.count === 1 ? "" : "s"} ·{" "}
        <Link href="/cart" className="underline underline-offset-4">
          edit basket
        </Link>
      </p>

      {saved ? (
        <p className="mt-4 rounded-md border border-line bg-accent-soft px-3 py-2 text-sm">
          Filled in from your last order. Change anything that has moved.
        </p>
      ) : null}

      <CheckoutForm
        subtotalCents={cart.subtotalCents}
        quotes={quotes}
        prefill={{
          email: user.email,
          name: saved?.name ?? user.name ?? user.username ?? "",
          phone: saved?.phone ?? "",
          line1: saved?.line1 ?? "",
          city: saved?.city ?? "",
          region: saved?.region ?? "",
        }}
      />
    </main>
  );
}
