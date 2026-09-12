import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ListingGrid } from "@/components/shop/listing-grid";
import { isSort, loadCategoryPage, type Sort } from "@/lib/shop/listing";
import { storefrontSettings } from "@/lib/storefront/settings";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** One query parameter, ignoring the repeated form (`?sort=a&sort=b`). */
const one = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const [page, settings] = await Promise.all([
    loadCategoryPage(slug),
    storefrontSettings(),
  ]);
  if (!page) return { title: "Not found · DRPHONE" };

  return {
    title: `${page.name} · ${settings.storeName}`,
    description:
      page.description ??
      `${page.listing.total} ${page.name.toLowerCase()} at ${settings.storeName}, cash on delivery across Lebanon.`,
    robots: settings.isPrivate ? { index: false, follow: false } : undefined,
  };
}

export default async function CategoryPage({ params, searchParams }: Params) {
  const { slug } = await params;
  const query = await searchParams;

  const sortParam = one(query.sort);
  const sort: Sort = isSort(sortParam) ? sortParam : "featured";
  const inStockOnly = one(query.stock) === "in";
  const page = Number(one(query.page) ?? "1");

  const category = await loadCategoryPage(slug, {
    page: Number.isFinite(page) ? page : 1,
    sort,
    inStockOnly,
  });
  if (!category) notFound();

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href="/categories" className="underline underline-offset-4">
          Shop
        </Link>
        {category.groupSlug ? (
          <>
            <span aria-hidden="true"> / </span>
            <Link
              href={`/c/${category.groupSlug}` as Route}
              className="underline underline-offset-4"
            >
              {category.groupName}
            </Link>
          </>
        ) : null}
        <span aria-hidden="true"> / </span>
        <span>{category.name}</span>
      </nav>

      <h1 className="display mt-3 text-3xl sm:text-4xl">{category.name}</h1>
      {category.description ? (
        <p className="mt-2 max-w-2xl text-muted">{category.description}</p>
      ) : null}

      {/*
        Sideways movement, in one scrollable line.
        A shopper in "Charge & Cable" who wanted "Converter" should not have to
        go back up: on a leaf these are its siblings, on a group its children.
        Eleven of them wrapped to five rows on a phone and pushed every product
        below the fold, so the row scrolls instead. The negative margin lets it
        bleed to the screen edge, which is what makes it read as scrollable.
      */}
      {category.siblings.length > 1 ? (
        <ul className="mt-4 -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {category.siblings.map((sibling) => (
            <li key={sibling.slug}>
              <Link
                href={`/c/${sibling.slug}` as Route}
                aria-current={sibling.slug === category.slug ? "page" : undefined}
                className={`inline-block whitespace-nowrap rounded-md border px-3 py-1.5 text-sm ${
                  sibling.slug === category.slug
                    ? "border-accent bg-accent-soft font-medium text-accent"
                    : "border-line"
                }`}
              >
                {sibling.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <ListingGrid
        listing={category.listing}
        basePath={`/c/${category.slug}`}
        sort={sort}
        inStockOnly={inStockOnly}
      />
    </main>
  );
}
