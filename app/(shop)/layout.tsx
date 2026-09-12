import { Outfit } from "next/font/google";

import { BottomBar } from "@/components/shop/bottom-bar";
import { SiteHeader } from "@/components/shop/site-header";
import { currentUser } from "@/lib/auth/session";
import { canAny } from "@/lib/auth/permissions";
import { basketCount, loadNav } from "@/lib/storefront/nav";
import { storefrontSettings } from "@/lib/storefront/settings";

/**
 * Outfit, the brand font, self-hosted by Next at build time.
 *
 * next/font rather than a stylesheet link: the CSP allows `font-src 'self'` and
 * no external stylesheet host, so a Google Fonts <link> would be blocked
 * outright. This downloads the face during the build and serves it from our own
 * origin, which satisfies both.
 */
const display = Outfit({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

/**
 * The storefront: the gate, the header, the tab bar.
 *
 * A route group rather than a middleware: reading the settings needs the
 * database, and the admin area must stay reachable while maintenance mode is
 * on. Grouping puts the check in one place that covers every shopper-facing
 * page and no admin one — and it changes no URLs, so `/cart` is still `/cart`.
 */
export default async function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await storefrontSettings();

  /*
   * Staff pass straight through.
   *
   * The point of maintenance mode is to work on the shop while shoppers cannot
   * see it, so locking staff out of the storefront would defeat it — they could
   * not check their own work. `orders.view` is the "can see the admin area at
   * all" permission, which is the right bar.
   *
   * /login sits outside this group, so signing in during maintenance still
   * works.
   */
  if (settings.maintenanceMode) {
    const user = await currentUser();
    if (!canAny(user, ["orders.view"])) {
      return (
        <main
          data-shop
          className={`mx-auto max-w-lg px-6 py-20 text-center ${display.variable}`}
        >
          <h1 className="display text-3xl">{settings.storeName}</h1>
          <p className="mt-4 text-sm">
            {settings.maintenanceMessage ??
              "We are back shortly. Thank you for your patience."}
          </p>
          {settings.phone ? (
            <p className="mt-6 text-sm text-muted">
              Call us on <span className="font-mono">{settings.phone}</span>
            </p>
          ) : null}
        </main>
      );
    }
  }

  const [groups, basket, user] = await Promise.all([
    loadNav(),
    basketCount(),
    currentUser(),
  ]);

  /*
   * What the strip above the header says.
   *
   * Both of these are facts about how this shop works rather than marketing,
   * which is why they are worth the nine pixels. The free-delivery line only
   * appears once a threshold is actually set, so the strip never advertises an
   * offer that does not exist.
   */
  const announcements = [
    "Cash on delivery anywhere in Lebanon",
    "We call to confirm every order before it is packed",
  ];
  if (settings.freeDeliveryThresholdCents) {
    announcements.unshift(
      `Free delivery over $${(settings.freeDeliveryThresholdCents / 100).toFixed(0)}`,
    );
  }

  /*
   * data-shop carries the brand palette, and the font variable rides along on
   * the same element so `.display` can pick it up anywhere inside the shop.
   *
   * pb-16 on the main region: the tab bar is fixed over the bottom of the
   * viewport on phones, and without the padding it covers the last line of
   * every page.
   */
  return (
    <div data-shop className={display.variable}>
      <SiteHeader
        groups={groups}
        basketCount={basket}
        signedIn={user !== null}
        storeName={settings.storeName}
        announcements={announcements}
      />
      <div className="pb-16 md:pb-0">{children}</div>
      <BottomBar basketCount={basket} />
    </div>
  );
}
