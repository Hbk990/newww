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
 * Sign in, register, verify, forgot, reset.
 *
 * `data-shop` is the point of this file. These pages sat outside the shop's
 * brand scope, so they rendered in the admin's blue-grey with the system font
 * — a different-looking website appearing in the middle of a purchase, at the
 * exact moment a shopper is deciding whether to trust the place. Ordering now
 * requires an account, so every order passes through here.
 *
 * Two columns on a laptop: the case for having an account on the left, the
 * form on the right. On a phone the form comes first and the case follows it,
 * because someone who tapped "Sign in" has already been convinced and should
 * not have to scroll past an advert to reach the field.
 *
 * The wordmark links back to the shop. Someone who arrived at a sign-in form
 * and changed their mind should not have to reach for the back button — and a
 * sign-in page with no way out is the shape of a phishing page.
 */
const REASONS = [
  {
    title: "Cash on delivery",
    body: "No card, ever. You pay the driver at the door.",
  },
  {
    title: "We call to confirm",
    body: "Someone checks the order and the address with you before anything is packed.",
  },
  {
    title: "Your details, kept",
    body: "Your address is filled in next time. Two taps instead of a form.",
  },
  {
    title: "Tell us your phone",
    body: "Save your model and we can say what fits it.",
  },
];

export default async function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const settings = await storefrontSettings();

  return (
    <div
      data-shop
      className={`${display.variable} min-h-svh bg-sunken text-ink`}
    >
      <div className="mx-auto flex min-h-svh max-w-5xl flex-col px-5 py-8 sm:px-8">
        <header>
          <Link href="/" className="display text-2xl tracking-tight">
            {settings.storeName}
            <span className="text-accent">.</span>
          </Link>
        </header>

        <div className="flex flex-1 items-center py-10">
          <div className="grid w-full gap-10 lg:grid-cols-[1fr_26rem] lg:gap-16">
            {/*
              The case for an account. Second in the source order so a phone
              reaches the form first, and pulled back to the left column on a
              laptop with `lg:order-first`.
            */}
            <section className="order-last lg:order-first lg:self-center">
              <h2 className="display text-3xl text-balance sm:text-4xl">
                An account, because
                <br />
                <span className="text-accent">we deliver by hand.</span>
              </h2>

              <dl className="mt-8 grid gap-5 sm:grid-cols-2 lg:max-w-lg">
                {REASONS.map((reason) => (
                  <div key={reason.title}>
                    <dt className="text-sm font-semibold">{reason.title}</dt>
                    <dd className="mt-1 text-sm text-muted">{reason.body}</dd>
                  </div>
                ))}
              </dl>

              {settings.phone ? (
                <p className="mt-8 text-sm text-muted">
                  Stuck? Call us on{" "}
                  <a
                    href={`tel:${settings.phone.replace(/\s/g, "")}`}
                    className="text-ink underline underline-offset-4"
                  >
                    {settings.phone}
                  </a>
                  .
                </p>
              ) : null}
            </section>

            <main className="order-first lg:order-last">
              <div className="rounded-2xl border border-line bg-raised p-6 shadow-sm sm:p-7">
                {children}
              </div>

              <p className="mt-5 text-center text-xs text-muted">
                <Link href="/" className="underline underline-offset-4">
                  Back to the shop
                </Link>
              </p>
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
