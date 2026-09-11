import Link from "next/link";

import { ProductForm } from "@/components/admin/product-form";
import { formOptions } from "@/lib/admin/product-form-actions";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";

export const metadata = { title: "New product · DRPHONE" };

export default async function Page() {
  const user = await requirePermission("products.create");
  const { brandRows, categoryRows, deviceRows } = await formOptions();

  return (
    <>
      <Link href="/admin/products" className="text-sm text-accent underline">
        ← Products
      </Link>
      <h1 className="mt-2 text-xl font-semibold tracking-tight">New product</h1>
      <p className="mt-1 text-sm text-muted">
        Images and device fitment come after saving. A product with no options
        is saved as a single variant.
      </p>

      <ProductForm
        brands={[...brandRows].sort((a, b) => a.name.localeCompare(b.name))}
        categories={[...categoryRows].sort((a, b) => a.position - b.position)}
        devices={[...deviceRows]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(({ id, name, family }) => ({ id, name, family }))}
        // Cost is hidden outright rather than rendered and blanked: a column
        // that exists in the markup is a column someone can read.
        showCost={can(user, "products.view_cost")}
      />
    </>
  );
}
