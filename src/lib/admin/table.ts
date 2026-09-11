/**
 * Table state lives in the URL.
 *
 * That decision has consequences worth naming: a filtered list can be
 * bookmarked and shared, the back button works, and a refresh keeps your view.
 * It is also the substitute for the saved views that were declined — a bookmark
 * *is* a saved view.
 *
 * Filters are deliberately not persisted anywhere else. A remembered filter is
 * how people conclude their records have gone missing.
 */
export type TableQuery = {
  q: string;
  page: number;
  sort: string;
  dir: "asc" | "desc";
  /** Extra single-value filters, e.g. `status=draft`. */
  filters: Record<string, string>;
  /** Optional columns the viewer switched on. */
  columns: string[];
  density: "comfortable" | "compact";
};

export const PAGE_SIZE = 50;

/**
 * `searchParams` is a Promise in this version of Next, so callers await it
 * before handing the plain object here.
 */
export function parseTableQuery(
  params: Record<string, string | string[] | undefined>,
  options: {
    filterKeys: readonly string[];
    sortKeys: readonly string[];
    defaultSort: string;
    defaultDir?: "asc" | "desc";
  },
): TableQuery {
  const one = (key: string): string | undefined => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const page = Number.parseInt(one("page") ?? "1", 10);
  const sort = one("sort");
  const dir = one("dir");

  const filters: Record<string, string> = {};
  for (const key of options.filterKeys) {
    const value = one(key);
    if (value) filters[key] = value;
  }

  return {
    q: (one("q") ?? "").trim(),
    // A hand-edited page number must not produce a negative offset.
    page: Number.isFinite(page) && page > 0 ? page : 1,
    // Only known sort keys, or a crafted URL becomes SQL injection via ORDER BY.
    sort: sort && options.sortKeys.includes(sort) ? sort : options.defaultSort,
    dir: dir === "asc" || dir === "desc" ? dir : (options.defaultDir ?? "desc"),
    filters,
    columns: (one("cols") ?? "").split(",").filter(Boolean),
    density: one("density") === "compact" ? "compact" : "comfortable",
  };
}

/**
 * Rebuilds the query string with some values changed.
 *
 * Changing anything but the page resets to page one — staying on page 7 of a
 * list that now has two pages shows an empty table, which reads as a bug.
 * Empty values are dropped so the URL stays short and shareable.
 */
export function buildTableHref(
  base: string,
  current: TableQuery,
  changes: Partial<Omit<TableQuery, "filters">> & {
    filters?: Record<string, string | null>;
  },
): string {
  const params = new URLSearchParams();

  const q = changes.q ?? current.q;
  if (q) params.set("q", q);

  const sort = changes.sort ?? current.sort;
  const dir = changes.dir ?? current.dir;
  params.set("sort", sort);
  params.set("dir", dir);

  const filters = { ...current.filters };
  for (const [key, value] of Object.entries(changes.filters ?? {})) {
    if (value === null || value === "") delete filters[key];
    else filters[key] = value;
  }
  for (const [key, value] of Object.entries(filters)) params.set(key, value);

  const columns = changes.columns ?? current.columns;
  if (columns.length > 0) params.set("cols", columns.join(","));

  const density = changes.density ?? current.density;
  if (density === "compact") params.set("density", "compact");

  const changingSomethingElse =
    changes.page === undefined &&
    (changes.q !== undefined ||
      changes.sort !== undefined ||
      changes.dir !== undefined ||
      changes.filters !== undefined);

  const page = changingSomethingElse ? 1 : (changes.page ?? current.page);
  if (page > 1) params.set("page", String(page));

  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

export function formatMoney(cents: number | null): string {
  if (cents === null) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}
