import { Placeholder } from "@/components/admin/placeholder";
import { requirePermission } from "@/lib/auth/guards";

export const metadata = { title: "Promotions · DRPHONE" };

// The guard runs before anything is returned, so its redirect happens before
// the response starts streaming.
export default async function Page() {
  await requirePermission("promotions.manage");

  return (
    <Placeholder
      title="Promotions"
      description="Discount codes, quantity breaks, Buy X Get Y, bundles and scheduled flash sales."
    />
  );
}
