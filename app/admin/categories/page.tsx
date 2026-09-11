import { CategoriesManager } from "@/components/admin/categories-manager";
import { loadCategories } from "@/lib/admin/taxonomy-actions";
import { requirePermission } from "@/lib/auth/guards";

export const metadata = { title: "Categories · DRPHONE" };

export default async function Page() {
  await requirePermission("products.edit");
  const rows = await loadCategories();

  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Categories</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Two levels: a group holds categories. Attributes attached to a group
        cover everything inside it, so most fields only need setting once.
      </p>
      <CategoriesManager rows={rows} />
    </>
  );
}
