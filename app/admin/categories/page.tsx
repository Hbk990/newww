import { Placeholder } from "@/components/admin/placeholder";
import { requirePermission } from "@/lib/auth/guards";

export const metadata = { title: "Categories · DRPHONE" };

// The guard runs before anything is returned, so its redirect happens before
// the response starts streaming.
export default async function Page() {
  await requirePermission("products.edit");

  return (
    <Placeholder
      title="Categories"
      description="The two-level category tree, seeded from your catalog export."
    />
  );
}
