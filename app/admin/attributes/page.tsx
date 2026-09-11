import { Placeholder } from "@/components/admin/placeholder";
import { requirePermission } from "@/lib/auth/guards";

export const metadata = { title: "Attributes · DRPHONE" };

// The guard runs before anything is returned, so its redirect happens before
// the response starts streaming.
export default async function Page() {
  await requirePermission("products.edit");

  return (
    <Placeholder
      title="Attributes"
      description="The attribute builder: define a field and its options once, and the product form builds itself from them."
    />
  );
}
