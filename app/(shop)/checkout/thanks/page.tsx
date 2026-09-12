import type { Route } from "next";
import Link from "next/link";

export const metadata = { title: "Order placed · DRPHONE" };

/**
 * The order number arrives in the query string, not from a fresh lookup.
 *
 * Deliberate: this page must render for a guest who has no session and no way
 * to be authorised against the order. It shows nothing that is not already
 * known to whoever just placed it, so a guessed number reveals nothing —
 * there is no address, no total and no contact detail here.
 */
export default async function ThanksPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order } = await searchParams;

  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <h1 className="display text-3xl">Thank you — your order is in</h1>

      {order ? (
        <p className="mt-3 text-sm">
          Your order number is <span className="font-mono font-medium">{order}</span>.
          Keep it to hand if you call us.
        </p>
      ) : null}

      <p className="mt-4 text-sm text-muted">
        We will call you to confirm before anything is packed. Payment is cash
        when it arrives.
      </p>

      {/*
        The order is now somewhere to go rather than a number to write down.
        Still built from the query string: the link is only useful to whoever
        owns the order, and the page behind it checks that for itself.
      */}
      <p className="mt-8 flex flex-wrap gap-4 text-sm">
        {order ? (
          <Link
            href={`/account/orders/${order}` as Route}
            className="font-medium text-accent underline underline-offset-4"
          >
            Follow this order
          </Link>
        ) : null}
        <Link href="/" className="underline underline-offset-4">
          Back to the shop
        </Link>
      </p>
    </main>
  );
}
