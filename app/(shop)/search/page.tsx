import type { Metadata } from "next";

import { ListingGrid } from "@/components/shop/listing-grid";
import { isSort, loadSearch, type Sort } from "@/lib/shop/listing";

export const dynamic = "force-dynamic";

// Never indexed, whatever the shop's privacy setting: a search results page is
// not a page of the shop, and letting a crawler into one invents a URL per
// query string.
export const metadata: Metadata = {
  title: "Search · DRPHONE",
  robots: { index: false, follow: true },
};

const one = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const term = (one(query.q) ?? "").slice(0, 80);
  const sortParam = one(query.sort);
  const sort: Sort = isSort(sortParam) ? sortParam : "featured";
  const inStockOnly = one(query.stock) === "in";
  const page = Number(one(query.page) ?? "1");

  const listing = await loadSearch(term, {
    page: Number.isFinite(page) ? page : 1,
    sort,
    inStockOnly,
  });

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="display text-3xl sm:text-4xl">Search</h1>

      {/* A form on the page as well as in the header: arriving here from the
          tab bar must not require going back up to the header to type. */}
      <form action="/search" className="mt-4 flex max-w-lg gap-2">
        <label className="sr-only" htmlFor="q">
          Search products
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={term}
          placeholder="Cable, cover, speaker…"
          className="flex-1 rounded-md border border-line bg-raised px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent"
        >
          Search
        </button>
      </form>

      {term === "" ? (
        <p className="mt-6 text-sm text-muted">
          Type a product, a brand, or what you need it for.
        </p>
      ) : (
        <>
          <p className="mt-6 text-sm text-muted">
            {listing.total} result{listing.total === 1 ? "" : "s"} for{" "}
            <span className="font-medium text-ink">{term}</span>
          </p>
          <ListingGrid
            listing={listing}
            basePath="/search"
            sort={sort}
            inStockOnly={inStockOnly}
            extraQuery={{ q: term }}
          />
        </>
      )}
    </main>
  );
}
