import { Placeholder } from "@/components/admin/placeholder";
import { requirePermission } from "@/lib/auth/guards";

export const metadata = { title: "Orders · DRPHONE" };

// The guard runs before anything is returned, so its redirect happens before
// the response starts streaming.
export default async function Page() {
  await requirePermission("orders.view");

  return (
    <Placeholder
      title="Orders"
      description="The order list, the confirmation-call queue, and the screens for dispatching and recording Cash on Delivery payments."
    />
  );
}
