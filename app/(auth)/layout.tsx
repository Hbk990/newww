import { Outfit } from "next/font/google";
import Link from "next/link";

import { storefrontSettings } from "@/lib/storefront/settings";

/**
 * The brand font, on the same terms as the storefront: downloaded at build
 * time and served from our own origin, because the CSP allows no external
 * stylesheet host.
 */
const display = Outfit({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

/**
 * Sign in, register, verify, reset.
 *
 * `data-shop` is the point of this file. These pages sat outside the shop's
 * brand scope, so they rendered in the admin's blue-grey with the system font
 * — a different-looking website appearing in the middle of a purchase, at the
 * exact moment a shopper is deciding whether to trust the place. Ordering now
 * requires an account, so every order passes through here.
 *
 * The wordmark links back to the shop. Someone who arrived at a sign-in form
 * and changed their mind should not have to reach for the back button, and a
 * sign-in page with no way out is the shape of a phishing page.
 */
export default async function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const settings = await storefrontSettings();

  return (
    <div
      data-shop
      className={`${display.variable} flex min-h-svh flex-col bg-sunken`}
    >
      <header className="px-6 pt-8">
        <Link
          href="/"
          className="display mx-auto block max-w-sm text-2xl tracking-tight"
        >
          {settings.storeName}
          <span className="text-accent">.</span>
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-10">
        <div className="rounded-2xl border border-line bg-raised p-6 sm:p-7">
          {children}
        </div>

        <p className="mt-6 text-center text-xs text-muted">
          Cash on delivery across Lebanon. We call to confirm every order.
        </p>
      </main>

      <footer className="px-6 pb-8 text-center text-xs text-muted">
        <Link href="/" className="underline underline-offset-4">
          Back to the shop
        </Link>
      </footer>
    </div>
  );
}
