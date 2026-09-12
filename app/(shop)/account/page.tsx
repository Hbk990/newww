import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { currentUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Your account · DRPHONE",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The account hub the header and the tab bar point at.
 *
 * Guests are sent to sign in with `next` set, so they land back here instead of
 * on the home page having forgotten why they were signing in.
 */
export default async function AccountPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=%2Faccount");

  const links = [
    {
      href: "/account/addresses",
      label: "Addresses",
      note: "Where we deliver, filled in for you at checkout",
    },
    { href: "/account/wishlist", label: "Saved items", note: "Things you tapped the heart on" },
    { href: "/account/devices", label: "Your phones", note: "So we can tell you what fits" },
    { href: "/account/password", label: "Password", note: "Change it any time" },
  ] as const;

  return (
    <>
      <h1 className="display text-3xl sm:text-4xl">Your account</h1>
      <p className="mt-2 text-muted">
        {user.name ?? user.username ?? user.email}
      </p>

      <ul className="mt-8 divide-y divide-line border-y border-line">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="flex items-center justify-between gap-4 py-4">
              <span>
                <span className="block font-medium">{link.label}</span>
                <span className="block text-sm text-muted">{link.note}</span>
              </span>
              <span aria-hidden="true" className="text-muted">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {/*
        Orders are not linked yet: a customer-facing order history does not
        exist. Saying so is better than a link that 404s, and it is on the list.
      */}
      <p className="mt-6 text-sm text-muted">
        Order history is not here yet. Call us with your order number and we
        will look it up.
      </p>
    </>
  );
}
