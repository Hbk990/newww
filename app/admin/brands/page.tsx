import { Placeholder } from "@/components/admin/placeholder";
import { requirePermission } from "@/lib/auth/guards";

export const metadata = { title: "Brands · DRPHONE" };

// The guard runs before anything is returned, so its redirect happens before
// the response starts streaming.
export default async function Page() {
  await requirePermission("products.edit");

  return (
    <Placeholder
      title="Brands"
      description="The 226 brands from your catalog, each with its own storefront page."
    />
  );
}
