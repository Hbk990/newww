"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { buildTableHref, type TableQuery } from "@/lib/admin/table";

export type FilterOption = { value: string; label: string };
export type FilterSpec = {
  key: string;
  label: string;
  options: FilterOption[];
};
export type ColumnSpec = { key: string; label: string; optional?: boolean };

/**
 * Search, filters, density and column choice — everything that changes the
 * URL rather than the data.
 *
 * The server renders the rows; this only navigates. That keeps the table a
 * server-rendered list with no client-side data fetching, and means the browser
 * back button moves through views as you would expect.
 */
export function TableToolbar({
  base,
  query,
  filters,
  columns,
  total,
}: {
  base: string;
  query: TableQuery;
  filters: FilterSpec[];
  columns: ColumnSpec[];
  total: number;
}) {
  const router = useRouter();
  const [text, setText] = useState(query.q);
  const [showColumns, setShowColumns] = useState(false);
  const first = useRef(true);

  /**
   * Search runs as you type, after a pause.
   *
   * 250ms is long enough that a normal typing rhythm produces one query rather
   * than one per keystroke. The guard on the first run stops the effect
   * navigating on mount and wiping a filter the URL already carried.
   */
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (text === query.q) return;
    const timer = setTimeout(() => {
      router.push(buildTableHref(base, query, { q: text }) as Route);
    }, 250);
    return () => clearTimeout(timer);
  }, [text, query, base, router]);

  const go = (href: string) => router.push(href as Route);

  const activeFilters = Object.entries(query.filters);
  const optional = columns.filter((c) => c.optional);

  return (
    <div className="mb-3 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Search by name, SKU or brand"
          aria-label="Search this list"
          className="min-w-0 flex-1 rounded-md border border-line bg-raised px-3 py-1.5 text-sm md:max-w-xs"
        />

        {filters.map((filter) => (
          <select
            key={filter.key}
            aria-label={filter.label}
            value={query.filters[filter.key] ?? ""}
            onChange={(event) =>
              go(
                buildTableHref(base, query, {
                  filters: { [filter.key]: event.target.value || null },
                }),
              )
            }
            className="rounded-md border border-line bg-raised px-2 py-1.5 text-sm"
          >
            <option value="">{filter.label}: any</option>
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ))}

        <div className="ml-auto flex items-center gap-1">
          <span className="mr-1 text-sm text-muted tabular">
            {total.toLocaleString()} {total === 1 ? "product" : "products"}
          </span>

          {optional.length > 0 ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowColumns((v) => !v)}
                aria-expanded={showColumns}
                className="rounded-md border border-line bg-raised px-2.5 py-1.5 text-sm text-muted hover:text-ink"
              >
                Columns
              </button>
              {showColumns ? (
                <div className="absolute right-0 z-20 mt-1 w-48 rounded-md border border-line bg-raised py-1 shadow-lg">
                  {optional.map((column) => {
                    const on = query.columns.includes(column.key);
                    return (
                      <button
                        key={column.key}
                        type="button"
                        onClick={() =>
                          go(
                            buildTableHref(base, query, {
                              columns: on
                                ? query.columns.filter((c) => c !== column.key)
                                : [...query.columns, column.key],
                            }),
                          )
                        }
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-sunken"
                      >
                        <input type="checkbox" checked={on} readOnly tabIndex={-1} />
                        {column.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() =>
              go(
                buildTableHref(base, query, {
                  density:
                    query.density === "compact" ? "comfortable" : "compact",
                }),
              )
            }
            title={
              query.density === "compact"
                ? "Switch to comfortable rows"
                : "Switch to compact rows"
            }
            className="rounded-md border border-line bg-raised px-2.5 py-1.5 text-sm text-muted hover:text-ink"
          >
            {query.density === "compact" ? "Compact" : "Comfortable"}
          </button>
        </div>
      </div>

      {/* Active filters as chips, so what is filtered is always visible rather
          than hidden inside a control you have to go and look at. */}
      {activeFilters.length > 0 || query.q ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {query.q ? (
            <button
              type="button"
              onClick={() => {
                setText("");
                go(buildTableHref(base, query, { q: "" }));
              }}
              className="flex items-center gap-1 rounded-full border border-line bg-accent-soft px-2.5 py-1 text-xs"
            >
              &ldquo;{query.q}&rdquo; <span aria-hidden>×</span>
            </button>
          ) : null}
          {activeFilters.map(([key, value]) => {
            const spec = filters.find((f) => f.key === key);
            const label =
              spec?.options.find((o) => o.value === value)?.label ?? value;
            return (
              <button
                key={key}
                type="button"
                onClick={() =>
                  go(buildTableHref(base, query, { filters: { [key]: null } }))
                }
                className="flex items-center gap-1 rounded-full border border-line bg-accent-soft px-2.5 py-1 text-xs"
              >
                {spec?.label ?? key}: {label} <span aria-hidden>×</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              setText("");
              go(base);
            }}
            className="px-1.5 text-xs text-muted underline hover:text-ink"
          >
            Clear all
          </button>
        </div>
      ) : null}
    </div>
  );
}
