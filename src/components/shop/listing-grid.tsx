import type { Route } from "next";
import Link from "next/link";

import { ProductCard } from "@/components/shop/product-card";
import type { Listing, Sort } from "@/lib/shop/listing";

/**
 * The grid, the sort control and the pager.
 *
 * Sort and paging are links carrying query parameters rather than a client
 * component holding state: the result is a real URL a customer can share or
 * come back to, it survives a reload, and the page needs no JavaScript to
 * work.
 */
const SORT_LABELS: Record<Sort, string> = {
  featured: "Most popular",
  cheapest: "Price: low to high",
  dearest: "Price: high to low",
  newest: "Newest",
};

export function ListingGrid({
  listing,
  basePath,
  sort,
  inStockOnly,
  extraQuery = {},
}: {
  listing: Listing;
  basePath: string;
  sort: Sort;
  inStockOnly: boolean;
  extraQuery?: Record<string, string>;
}) {
  /**
   * A link to this same listing with some of its state changed.
   *
   * Seeded from what is in force now, not just the page's base query. Building
   * these from the base alone is a bug I shipped and the tests caught: sorting
   * by price and then tapping "In stock only" threw the sort away, because each
   * control only knew about its own parameter.
   *
   * A parameter set to undefined is dropped, which is how a control turns
   * itself off — and how the default sort stays out of the URL instead of
   * spelling out `?sort=featured` on every link.
   */
  const href = (params: Record<string, string | undefined>) => {
    const query = new URLSearchParams(extraQuery);
    if (sort !== "featured") query.set("sort", sort);
    if (inStockOnly) query.set("stock", "in");
    if (listing.page > 1) query.set("page", String(listing.page));

    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === "") query.delete(key);
      else query.set(key, value);
    }
    const text = query.toString();
    return `${basePath}${text ? `?${text}` : ""}` as Route;
  };

  if (listing.total === 0) {
    return (
      <p className="mt-8 text-sm text-muted">
        Nothing here yet.{" "}
        <Link href="/categories" className="text-accent underline">
          Browse everything
        </Link>
        .
      </p>
    );
  }

  return (
    <>
      {/*
        One line that scrolls sideways on a phone rather than wrapping onto
        three. Wrapping pushed the first row of products below the fold, which
        is the one thing a listing page must not do.
      */}
      <div className="mt-4 flex items-center justify-between gap-3 overflow-x-auto border-y border-line py-2.5">
        <p className="shrink-0 text-sm text-muted tabular">
          {listing.total} product{listing.total === 1 ? "" : "s"}
        </p>
        <div className="flex shrink-0 items-center gap-3">
          <Link
            href={href({ stock: inStockOnly ? undefined : "in", page: undefined })}
            aria-pressed={inStockOnly}
            className={`shrink-0 whitespace-nowrap rounded-md border px-2.5 py-1 text-xs ${
              inStockOnly
                ? "border-accent bg-accent-soft text-accent"
                : "border-line text-muted"
            }`}
          >
            In stock only
          </Link>
          {/* A row of links, not a <select>: four options, and a select on a
              phone opens a native wheel for something that is one tap. */}
          <ul className="flex gap-1.5">
            {(Object.keys(SORT_LABELS) as Sort[]).map((key) => (
              <li key={key}>
                <Link
                  href={href({ sort: key === "featured" ? undefined : key, page: undefined })}
                  aria-current={sort === key ? "true" : undefined}
                  className={`block whitespace-nowrap rounded-md px-2 py-1 text-xs ${
                    sort === key ? "bg-accent-soft font-medium text-accent" : "text-muted"
                  }`}
                >
                  {SORT_LABELS[key]}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <ul className="mt-5 grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4">
        {listing.cards.map((card) => (
          <li key={card.slug}>
            <ProductCard card={card} />
          </li>
        ))}
      </ul>

      {listing.pageCount > 1 ? (
        <nav
          aria-label="Pages"
          className="mt-10 flex items-center justify-between gap-4 border-t border-line pt-4 text-sm"
        >
          {listing.page > 1 ? (
            <Link
              href={href({ page: String(listing.page - 1) })}
              className="text-accent underline underline-offset-4"
            >
              ← Previous
            </Link>
          ) : (
            <span className="text-muted">← Previous</span>
          )}
          <span className="text-muted tabular">
            Page {listing.page} of {listing.pageCount}
          </span>
          {listing.page < listing.pageCount ? (
            <Link
              href={href({ page: String(listing.page + 1) })}
              className="text-accent underline underline-offset-4"
            >
              Next →
            </Link>
          ) : (
            <span className="text-muted">Next →</span>
          )}
        </nav>
      ) : null}
    </>
  );
}
