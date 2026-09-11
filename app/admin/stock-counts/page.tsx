import { Placeholder } from "@/components/admin/placeholder";
import { requirePermission } from "@/lib/auth/guards";

export const metadata = { title: "Stock counts · DRPHONE" };

// The guard runs before anything is returned, so its redirect happens before
// the response starts streaming.
export default async function Page() {
  await requirePermission("inventory.count");

  return (
    <Placeholder
      title="Stock counts"
      description="Physical counting sessions: what was expected, what was found, and the ledger entries that reconcile the two."
    />
  );
}
