import { and, asc, count, desc, eq, ilike, ne, or, sql } from "drizzle-orm";
import type { Route } from "next";
import Link from "next/link";

import { db } from "@/db";
import { brands, categories, productCategories, products } from "@/db/schema";
import { ProductsTable, type ProductRow } from "@/components/admin/products-table";
import { TableToolbar } from "@/components/admin/table-toolbar";
import { buildTableHref, PAGE_SIZE, parseTableQuery } from "@/lib/admin/table";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";

export const metadata = { title: "Products · DRPHONE" };

const BASE = "/admin/products";
const SORT_KEYS = ["updated", "title", "price"] as const;
const FILTER_KEYS = ["status", "stock"] as const;

export default async function ProductsPage({
  searchParams,
}: {
  // A Promise in this version of Next — it must be awaited before use.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePermission("products.view");
  const query = parseTableQuery(await searchParams, {
    filterKeys: FILTER_KEYS,
    sortKeys: SORT_KEYS,
    defaultSort: "updated",
  });

  /**
   * Archived products are hidden unless asked for; drafts are not, because a
   * draft is work in progress and hiding it is how products get forgotten.
   */
  const conditions = [
    query.filters.status
      ? eq(products.status, query.filters.status as "draft" | "active" | "discontinued" | "archived")
      : ne(products.status, "archived"),
  ];

  if (query.q) {
    /**
     * Word-similarity (`<%`) rather than plain `%`: a long title dilutes a
     * whole-string score, so "chargr" finds nothing. Paired with ILIKE so an
     * exact fragment always matches even when the trigram threshold does not.
     */
    conditions.push(
      or(
        sql`${query.q} <% ${products.title}`,
        ilike(products.title, `%${query.q}%`),
        ilike(brands.name, `%${query.q}%`),
      )!,
    );
  }

  if (query.filters.stock === "in") conditions.push(eq(products.inStock, true));
  if (query.filters.stock === "out") conditions.push(eq(products.inStock, false));

  const where = and(...conditions);

  const order =
    query.sort === "title"
      ? query.dir === "asc"
        ? asc(products.title)
        : desc(products.title)
      : query.sort === "price"
        ? query.dir === "asc"
          ? asc(products.minPriceCents)
          : desc(products.minPriceCents)
        : query.dir === "asc"
          ? asc(products.updatedAt)
          : desc(products.updatedAt);

  const showCost = can(user, "products.view_cost") && query.columns.includes("cost");

  const [rows, [totals]] = await Promise.all([
    db
      .select({
        id: products.id,
        slug: products.slug,
        title: products.title,
        status: products.status,
        // The listing read model: no join to variants or images for any of
        // these, which is the whole reason those columns exist.
        imageUrl: products.primaryImageUrl,
        minPriceCents: products.minPriceCents,
        maxPriceCents: products.maxPriceCents,
        variantCount: products.variantCount,
        inStock: products.inStock,
        updatedAt: products.updatedAt,
        brand: brands.name,
        category: categories.name,
      })
      .from(products)
      .leftJoin(brands, eq(brands.id, products.brandId))
      .leftJoin(
        productCategories,
        and(
          eq(productCategories.productId, products.id),
          eq(productCategories.isPrimary, true),
        ),
      )
      .leftJoin(categories, eq(categories.id, productCategories.categoryId))
      .where(where)
      .orderBy(order)
      .limit(PAGE_SIZE)
      .offset((query.page - 1) * PAGE_SIZE),
    db
      .select({ n: count() })
      .from(products)
      .leftJoin(brands, eq(brands.id, products.brandId))
      .where(where),
  ]);

  const total = totals?.n ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const tableRows: ProductRow[] = rows.map((row) => ({
    ...row,
    // Cost is per variant, so a product-level figure would be a guess. Shown on
    // the product itself; the column is a placeholder until that query exists.
    costCents: null,
  }));

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Products</h1>
        <Link
          href="/admin/products/new"
          className="ml-auto rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-surface"
        >
          New product
        </Link>
      </div>

      <TableToolbar
        base={BASE}
        query={query}
        total={total}
        filters={[
          {
            key: "status",
            label: "Status",
            options: [
              { value: "draft", label: "Draft" },
              { value: "active", label: "Active" },
              { value: "discontinued", label: "Discontinued" },
              { value: "archived", label: "Archived" },
            ],
          },
          {
            key: "stock",
            label: "Stock",
            options: [
              { value: "in", label: "Available" },
              { value: "out", label: "Unavailable" },
            ],
          },
        ]}
        columns={[
          { key: "cost", label: "Cost and margin", optional: true },
        ]}
      />

      {tableRows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line px-5 py-12 text-center">
          <p className="text-sm text-muted">
            {query.q || Object.keys(query.filters).length > 0
              ? "No products match this search."
              : "No products yet."}
          </p>
          {query.q || Object.keys(query.filters).length > 0 ? (
            <Link
              href={BASE as Route}
              className="mt-3 inline-block text-sm underline underline-offset-4"
            >
              Clear filters
            </Link>
          ) : (
            <Link
              href="/admin/products/new"
              className="mt-3 inline-block text-sm underline underline-offset-4"
            >
              Add your first product
            </Link>
          )}
        </div>
      ) : (
        <ProductsTable
          rows={tableRows}
          query={query}
          base={BASE}
          showCost={showCost}
          canEditStock={can(user, "inventory.adjust")}
          canArchive={can(user, "products.archive")}
        />
      )}

      {pages > 1 ? (
        <nav
          aria-label="Pages"
          className="mt-4 flex flex-wrap items-center gap-1.5 text-sm"
        >
          {Array.from({ length: pages }, (_, index) => index + 1)
            // Show the first, last, and a window around the current page.
            .filter(
              (page) =>
                page === 1 ||
                page === pages ||
                Math.abs(page - query.page) <= 2,
            )
            .map((page, index, shown) => (
              <span key={page} className="flex items-center gap-1.5">
                {index > 0 && page - shown[index - 1]! > 1 ? (
                  <span className="px-1 text-muted">…</span>
                ) : null}
                <Link
                  href={buildTableHref(BASE, query, { page }) as Route}
                  aria-current={page === query.page ? "page" : undefined}
                  className={`rounded border px-2.5 py-1 tabular ${
                    page === query.page
                      ? "border-accent bg-accent-soft font-medium"
                      : "border-line text-muted hover:text-ink"
                  }`}
                >
                  {page}
                </Link>
              </span>
            ))}
        </nav>
      ) : null}
    </>
  );
}
