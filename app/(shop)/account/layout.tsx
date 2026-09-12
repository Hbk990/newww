import type { Route } from "next";
import Link from "next/link";

/**
 * The account area's own frame, inside the shop's.
 *
 * These pages used to sit outside the storefront route group entirely, which
 * meant tapping "Account" dropped the customer out of the shop's header,
 * footer, tab bar and palette mid-visit. They are part of the shop, so they
 * live inside it now and share one sub-navigation.
 *
 * A plain row of links rather than a sidebar: there are five, and a sidebar on
 * a phone is a row of links that has been made to look like furniture.
 */
const PAGES = [
  { href: "/account", label: "Overview" },
  { href: "/account/orders", label: "Orders" },
  { href: "/account/addresses", label: "Addresses" },
  { href: "/account/wishlist", label: "Saved items" },
  { href: "/account/devices", label: "Your phones" },
  { href: "/account/password", label: "Password" },
] as const;

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      {/*
        aria-current is set by each page rather than here: a layout does not
        re-render on navigation within itself, so a highlight computed here
        would stick to whichever page was opened first.
      */}
      <nav
        /* Not "Your account": the footer has a navigation column by that
           name, and two landmarks with one name is ambiguous in a screen
           reader's landmark list. */
        aria-label="Account sections"
        className="-mx-4 mb-8 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
      >
        {PAGES.map((page) => (
          <Link
            key={page.href}
            href={page.href as Route}
            className="shrink-0 whitespace-nowrap rounded-md border border-line px-3 py-1.5 text-sm hover:border-accent hover:text-accent"
          >
            {page.label}
          </Link>
        ))}
      </nav>

      {children}
    </main>
  );
}
