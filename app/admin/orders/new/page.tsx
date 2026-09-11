import { Placeholder } from "@/components/admin/placeholder";
import { requirePermission } from "@/lib/auth/guards";

export const metadata = { title: "New order · DRPHONE" };

// The guard runs before anything is returned, so its redirect happens before
// the response starts streaming.
export default async function Page() {
  await requirePermission("orders.create");

  return (
    <Placeholder
      title="New order"
      description="Creating an order by hand, for a customer who phoned or messaged on WhatsApp."
    />
  );
}
