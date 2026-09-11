import { Placeholder } from "@/components/admin/placeholder";
import { requirePermission } from "@/lib/auth/guards";

export const metadata = { title: "Stock adjustment · DRPHONE" };

// The guard runs before anything is returned, so its redirect happens before
// the response starts streaming.
export default async function Page() {
  await requirePermission("inventory.adjust");

  return (
    <Placeholder
      title="Stock adjustment"
      description="Adjusting stock with a reason, written through the ledger so the change is explainable later."
    />
  );
}
