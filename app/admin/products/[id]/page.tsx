import Link from "next/link";
import { notFound } from "next/navigation";

import { ProductForm } from "@/components/admin/product-form";
import { ProductImages } from "@/components/admin/product-images";
import { comboKey } from "@/lib/admin/variant-combos";
import { loadImages } from "@/lib/admin/image-actions";
import { formOptions, loadProduct } from "@/lib/admin/product-form-actions";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { imagesAreDurable } from "@/lib/storage";

export const metadata = { title: "Edit product · DRPHONE" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("products.edit");
  const { id } = await params;

  // A malformed uuid makes Postgres raise 22P02 rather than return no rows,
  // which would surface as a 500. Soft 404 for the same reason as the
  // attribute editor: this page sits inside the admin's Suspense boundary.
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [loaded, { brandRows, categoryRows, deviceRows }, images] = await Promise.all([
    loadProduct(id),
    formOptions(),
    loadImages(id),
  ]);
  if (!loaded) notFound();

  const { product, axes, variants: rows, categoryIds } = loaded;

  return (
    <>
      <Link href="/admin/products" className="text-sm text-accent underline">
        ← Products
      </Link>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">{product.title}</h1>
        <span className="font-mono text-xs text-muted">/p/{product.slug}</span>
      </div>
      <p className="mt-1 text-sm text-muted">
        Removing an option value keeps its variants on screen until you save, so
        you can see what is about to go.
      </p>

      <ProductForm
        brands={[...brandRows].sort((a, b) => a.name.localeCompare(b.name))}
        categories={[...categoryRows].sort((a, b) => a.position - b.position)}
        devices={[...deviceRows]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(({ id: deviceId, name, family }) => ({ id: deviceId, name, family }))}
        showCost={can(user, "products.view_cost")}
        images={images.map((img, i) => ({
          id: img.id,
          label: img.alt || `Image ${i + 1}`,
        }))}
        initial={{
          id: product.id,
          title: product.title,
          slug: product.slug,
          brandId: product.brandId ?? "",
          categoryIds,
          shortDescription: product.shortDescription ?? "",
          status: product.status,
          axes,
          rows: rows.map((v) => ({
            id: v.id,
            sold: v.sold,
            combo: v.combo,
            // The same key the grid derives, so a reload and a regenerate
            // agree on which row is which.
            key: comboKey(axes, v.combo),
            title: v.title,
            sku: v.sku,
            price: v.price,
            available: v.available,
            imageId: v.imageId,
            fresh: false,
            /*
             * A combination the current axes cannot produce — the index came
             * back -1 because the value it used was deleted. That is a variant
             * kept back from an earlier save because it had been sold. It is
             * shown as a tombstone rather than an editable row: editing it
             * would imply it is still on sale, and it has no colour left to
             * edit.
             */
            leaving: v.combo.some((i) => i < 0),
          })),
        }}
      />

      <ProductImages productId={id} rows={images} durable={imagesAreDurable} />
    </>
  );
}
