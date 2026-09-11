import { BrandsManager } from "@/components/admin/brands-manager";
import { loadBrands } from "@/lib/admin/taxonomy-actions";
import { requirePermission } from "@/lib/auth/guards";

export const metadata = { title: "Brands · DRPHONE" };

export default async function Page() {
  await requirePermission("products.edit");
  const rows = await loadBrands();

  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Brands</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Who makes the product. Featured brands are the ones a storefront
        homepage can single out.
      </p>
      <BrandsManager rows={rows} />
    </>
  );
}
