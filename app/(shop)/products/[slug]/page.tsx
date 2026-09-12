import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProductDetail } from "@/components/shop/product-detail";
import { ProductGallery } from "@/components/shop/product-gallery";
import { fitsMyDevices } from "@/lib/shop/my-devices";
import { loadShopProduct } from "@/lib/shop/product";
import { recordView } from "@/lib/shop/recently-viewed";
import { isWishlisted } from "@/lib/shop/wishlist";
import { storefrontSettings } from "@/lib/storefront/settings";

/**
 * Never cached.
 *
 * Price, stock and whether this shopper has saved the item all change per
 * request and per visitor, and the wrong answer to any of them is worse than a
 * slower page. Caching comes back with a tag per product once there is a reason
 * to want it.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const [product, settings] = await Promise.all([
    loadShopProduct(slug),
    storefrontSettings(),
  ]);

  if (!product) return { title: "Not found · DRPHONE" };

  return {
    title: `${product.title} · ${settings.storeName}`,
    description:
      product.shortDescription ??
      `${product.title}${product.brandName ? ` by ${product.brandName}` : ""}, available at ${settings.storeName}.`,
    /*
     * `isPrivate` keeps the half-built shop out of search results. A meta tag
     * rather than a header because Next owns the document head here and a
     * per-route header would have to be matched by path in next.config.
     */
    robots: settings.isPrivate ? { index: false, follow: false } : undefined,
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await loadShopProduct(slug);
  if (!product) notFound();

  const [settings, saved, fit] = await Promise.all([
    storefrontSettings(),
    isWishlisted(product.id),
    fitsMyDevices(product.id),
  ]);

  /*
   * The view is recorded but not awaited into the render — `recordView` already
   * swallows its own failures and returns early for guests, so there is nothing
   * to show and nothing to handle. Awaiting it keeps the write inside the
   * request, which is what we want; it just has no bearing on the markup.
   */
  await recordView(product.id);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted">
        <Link href="/" className="underline underline-offset-4">
          Shop
        </Link>
        <span aria-hidden="true"> / </span>
        <span>{product.title}</span>
      </nav>

      <div className="grid gap-8 md:grid-cols-2">
        <ProductGallery images={product.images} title={product.title} />
        <ProductDetail
          product={product}
          saved={saved}
          whatsappNumber={settings.whatsappNumber}
        />
      </div>

      {/*
        "Fits your iPhone 15" is the single most useful line on an accessories
        page, so it sits above the specs rather than at the bottom. `fits: null`
        means we genuinely cannot say — a guest, no saved devices, or a product
        with no fitment recorded — and says nothing at all rather than guessing.
      */}
      {fit.fits !== null ? (
        <p
          className={`mt-8 rounded-md border px-4 py-3 text-sm ${
            fit.fits ? "border-accent bg-accent-soft" : "border-line text-muted"
          }`}
        >
          {fit.fits
            ? `Fits your ${fit.fitting.map((d) => d.label ?? `${d.brand} ${d.model}`).join(", ")}.`
            : "This does not fit any of the devices you have saved."}
        </p>
      ) : null}

      {product.descriptionHtml ? (
        <section className="mt-10">
          <h2 className="display text-xl">Details</h2>
          {/*
            The description is written by staff in the admin, behind
            `products.edit`, so it is trusted input in the same sense a template
            is. It is not customer-supplied. If a rich-text editor ever accepts
            anything wider, this needs sanitising at the point it is saved.
          */}
          <div
            className="mt-3 space-y-3 text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: product.descriptionHtml }}
          />
        </section>
      ) : null}

      {product.specs.length > 0 ? (
        <section className="mt-10">
          <h2 className="display text-xl">Specifications</h2>
          <dl className="mt-3 divide-y divide-line border-y border-line text-sm">
            {product.specs.map((spec) => (
              <div key={spec.label} className="flex gap-4 py-2">
                <dt className="w-40 shrink-0 text-muted">{spec.label}</dt>
                <dd>{spec.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {product.fitment.length > 0 ? (
        <section className="mt-10">
          <h2 className="display text-xl">Fits these phones</h2>
          <ul className="mt-3 flex flex-wrap gap-2 text-sm">
            {product.fitment.map((entry) => (
              <li
                key={`${entry.brand}-${entry.model}`}
                className="rounded-md border border-line px-2.5 py-1"
              >
                {entry.brand} {entry.model}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
