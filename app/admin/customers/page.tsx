import { Placeholder } from "@/components/admin/placeholder";
import { requirePermission } from "@/lib/auth/guards";

export const metadata = { title: "Customers · DRPHONE" };

// The guard runs before anything is returned, so its redirect happens before
// the response starts streaming.
export default async function Page() {
  await requirePermission("customers.view");

  return (
    <Placeholder
      title="Customers"
      description="Customer records, their saved addresses and devices, and their order history."
    />
  );
}
