import { Placeholder } from "@/components/admin/placeholder";
import { requirePermission } from "@/lib/auth/guards";

export const metadata = { title: "New product · DRPHONE" };

// The guard runs before anything is returned, so its redirect happens before
// the response starts streaming.
export default async function Page() {
  await requirePermission("products.create");

  return (
    <Placeholder
      title="New product"
      description="The product form: basic fields, category-driven attributes, the variant grid with bulk generation, images and device fitment."
    />
  );
}
