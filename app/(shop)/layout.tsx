import { currentUser } from "@/lib/auth/session";
import { canAny } from "@/lib/auth/permissions";
import { storefrontSettings } from "@/lib/storefront/settings";

/**
 * The storefront, and the gate in front of it.
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
        <main className="mx-auto max-w-lg px-6 py-20 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            {settings.storeName}
          </h1>
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

  return <>{children}</>;
}
