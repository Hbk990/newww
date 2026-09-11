import { Placeholder } from "@/components/admin/placeholder";
import { requirePermission } from "@/lib/auth/guards";

export const metadata = { title: "Devices · DRPHONE" };

// The guard runs before anything is returned, so its redirect happens before
// the response starts streaming.
export default async function Page() {
  await requirePermission("products.edit");

  return (
    <Placeholder
      title="Devices"
      description="Device brands, models and saved groups, behind “Shop by device” and every fitment picker."
    />
  );
}
