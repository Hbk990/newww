import type { Route } from "next";
import Link from "next/link";

import type { DeliveryZone } from "@/lib/storefront/footer";
import type { NavGroup } from "@/lib/storefront/nav";

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

/**
 * The footer.
 *
 * Dark, to bookend the announcement strip at the top and to draw a line under
 * the shop rather than letting the last section dissolve into white.
 *
 * Built from what is true in the database rather than a hand-kept list: the
 * five groups come from the same loader as the menu, and the delivery prices
 * are the ones checkout will actually charge. A footer is where people look
 * for the boring facts — what it costs to deliver to them, how to reach a
 * person — and those are exactly the facts that rot when they are typed into
 * markup by hand.
 *
 * A server component: nothing here is interactive.
 */
export function SiteFooter({
  storeName,
  phone,
  whatsappNumber,
  freeDeliveryThresholdCents,
  groups,
  zones,
  signedIn,
}: {
  storeName: string;
  phone: string | null;
  whatsappNumber: string | null;
  freeDeliveryThresholdCents: number | null;
  groups: NavGroup[];
  zones: DeliveryZone[];
  signedIn: boolean;
}) {
  const year = new Date().getFullYear();
  const digits = whatsappNumber?.replace(/\D/g, "");

  return (
    <footer className="bg-ink text-surface">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="display text-2xl">
              {storeName}
              <span className="text-on-dark-red">.</span>
            </p>
            <p className="mt-3 max-w-xs text-sm opacity-70">
              Accessories for the phone in your hand. Cash on delivery
              anywhere in Lebanon — we call to confirm every order before it is
              packed.
            </p>

            {/*
              Both reachable ways to get a human, and neither is invented: they
              appear only when someone has put them in the settings.
            */}
            <div className="mt-5 flex flex-col gap-2 text-sm">
              {phone ? (
                <a
                  href={`tel:${phone.replace(/\s/g, "")}`}
                  className="underline-offset-4 hover:underline"
                >
                  {phone}
                </a>
              ) : null}
              {digits ? (
                <a
                  href={`https://wa.me/${digits}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-on-dark-green underline-offset-4 hover:underline"
                >
                  Message us on WhatsApp
                </a>
              ) : null}
            </div>
          </div>

          <nav aria-labelledby="footer-shop">
            <h2
              id="footer-shop"
              className="text-xs uppercase tracking-[0.16em] opacity-60"
            >
              Shop
            </h2>
            <ul className="mt-4 space-y-2 text-sm">
              {groups.map((group) => (
                <li key={group.slug}>
                  <Link
                    href={`/c/${group.slug}` as Route}
                    className="opacity-80 underline-offset-4 hover:underline hover:opacity-100"
                  >
                    {group.name}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/phones"
                  className="opacity-80 underline-offset-4 hover:underline hover:opacity-100"
                >
                  Shop by phone
                </Link>
              </li>
              <li>
                <Link
                  href="/categories"
                  className="opacity-80 underline-offset-4 hover:underline hover:opacity-100"
                >
                  Every category
                </Link>
              </li>
            </ul>
          </nav>

          <div>
            <h2 className="text-xs uppercase tracking-[0.16em] opacity-60">
              Delivery
            </h2>
            {/*
              The real fee per zone, from the same rows checkout charges from.
              Stated here so nobody has to reach the last screen to find out
              what it costs to reach them.
            */}
            {zones.length > 0 ? (
              <dl className="mt-4 space-y-2.5 text-sm">
                {zones.map((zone) => (
                  <div key={zone.name}>
                    <dt className="flex items-baseline justify-between gap-3">
                      <span className="opacity-90">{zone.name}</span>
                      <span className="tabular opacity-70">
                        {money(zone.fromCents)}
                      </span>
                    </dt>
                    {/* The governorates, for a zone whose name does not say.
                        "Rest of Lebanon" is six of them. */}
                    {zone.regions.length > 1 ? (
                      <dd className="mt-0.5 text-xs opacity-50">
                        {zone.regions.join(", ")}
                      </dd>
                    ) : null}
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-4 text-sm opacity-70">
                Call us and we will arrange delivery.
              </p>
            )}

            {freeDeliveryThresholdCents ? (
              <p className="mt-4 text-sm font-medium text-on-dark-red">
                Free over {money(freeDeliveryThresholdCents)}
              </p>
            ) : null}
          </div>

          <nav aria-labelledby="footer-account">
            <h2
              id="footer-account"
              className="text-xs uppercase tracking-[0.16em] opacity-60"
            >
              Your account
            </h2>
            <ul className="mt-4 space-y-2 text-sm">
              {signedIn ? (
                <>
                  <li>
                    <Link
                      href="/account"
                      className="opacity-80 underline-offset-4 hover:underline hover:opacity-100"
                    >
                      Account
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/account/wishlist"
                      className="opacity-80 underline-offset-4 hover:underline hover:opacity-100"
                    >
                      Saved items
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/account/devices"
                      className="opacity-80 underline-offset-4 hover:underline hover:opacity-100"
                    >
                      Your phones
                    </Link>
                  </li>
                </>
              ) : (
                <>
                  <li>
                    <Link
                      href="/login"
                      className="opacity-80 underline-offset-4 hover:underline hover:opacity-100"
                    >
                      Sign in
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/register"
                      className="opacity-80 underline-offset-4 hover:underline hover:opacity-100"
                    >
                      Create an account
                    </Link>
                  </li>
                </>
              )}
              <li>
                <Link
                  href="/cart"
                  className="opacity-80 underline-offset-4 hover:underline hover:opacity-100"
                >
                  Your basket
                </Link>
              </li>
            </ul>

            <p className="mt-5 text-xs opacity-50">
              An account is needed to order, so your delivery details and your
              orders are kept.
            </p>
          </nav>
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs opacity-60">
          <p>
            © {year} {storeName}. Lebanon.
          </p>
          {/* Both facts a shopper needs before they start: what currency the
              prices are in, and that no card is involved. */}
          <p>Prices in US dollars · Cash on delivery only</p>
        </div>
      </div>
    </footer>
  );
}
