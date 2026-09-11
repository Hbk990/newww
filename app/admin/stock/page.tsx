import { Placeholder } from "@/components/admin/placeholder";
import { requirePermission } from "@/lib/auth/guards";

export const metadata = { title: "Stock · DRPHONE" };

// The guard runs before anything is returned, so its redirect happens before
// the response starts streaming.
export default async function Page() {
  await requirePermission("inventory.view");

  return (
    <Placeholder
      title="Stock"
      description="Availability per variant, with quantities for the lines you choose to count, and the movement history behind every change."
    />
  );
}
