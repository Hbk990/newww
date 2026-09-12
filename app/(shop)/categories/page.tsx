import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";

import { loadNav } from "@/lib/storefront/nav";
import { storefrontSettings } from "@/lib/storefront/settings";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await storefrontSettings();
  return {
    title: `Shop · ${settings.storeName}`,
    description: "Every category in the shop.",
    robots: settings.isPrivate ? { index: false, follow: false } : undefined,
  };
}

/**
 * Every category, on one page.
 *
 * This is what the Shop tab opens on a phone, and it is deliberately a page
 * rather than a drawer: it can be linked to, it survives a reload, and it is
 * the one page a search engine needs to find every category in the shop.
 */
export default async function CategoriesPage() {
  const groups = await loadNav();

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="display text-3xl sm:text-4xl">Shop</h1>
      <p className="mt-2 text-muted">
        {groups.reduce(
          (n, group) =>
            n + group.categories.reduce((m, c) => m + c.productCount, 0),
          0,
        )}{" "}
        products across{" "}
        {groups.reduce((n, group) => n + group.categories.length, 0)} categories.
      </p>

      <div className="mt-8 grid gap-10 sm:grid-cols-2">
        {groups.map((group) => (
          <section key={group.slug}>
            <h2 className="display text-xl">
              <Link href={`/c/${group.slug}` as Route}>{group.name}</Link>
            </h2>
            <ul className="mt-2 divide-y divide-line border-t border-line">
              {group.categories.map((category) => (
                <li key={category.slug}>
                  <Link
                    href={`/c/${category.slug}` as Route}
                    className="flex items-baseline justify-between gap-3 py-2 text-sm hover:text-accent"
                  >
                    <span>{category.name}</span>
                    <span className="text-xs text-muted tabular">
                      {category.productCount}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
