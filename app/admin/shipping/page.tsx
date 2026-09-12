import { ShippingManager } from "@/components/admin/shipping-manager";
import { loadShipping } from "@/lib/admin/shipping-actions";
import { can } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/guards";

export const metadata = { title: "Delivery zones · DRPHONE" };

export default async function ShippingPage() {
  const user = await requirePermission("settings.view");
  const { zones, rates, uncovered } = await loadShipping();

  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Delivery zones</h1>
      <p className="mt-1 max-w-prose text-sm text-muted">
        What delivery costs, by governorate. Checkout quotes from these — a
        governorate no zone covers is an address the shop refuses. Staff taking
        an order by phone type the fee themselves, so these only affect web
        orders.
      </p>

      <ShippingManager
        zones={zones}
        rates={rates}
        uncovered={uncovered}
        canEdit={can(user, "settings.edit")}
      />
    </>
  );
}
