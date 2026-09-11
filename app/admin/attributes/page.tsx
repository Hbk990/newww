import { asc, sql } from "drizzle-orm";
import Link from "next/link";
import type { Route } from "next";

import { db } from "@/db";
import { attributeDefinitions } from "@/db/schema";
import { requirePermission } from "@/lib/auth/guards";

export const metadata = { title: "Attributes · DRPHONE" };

const TYPE_LABEL: Record<string, string> = {
  text: "Text",
  number: "Number",
  boolean: "Yes / no",
  enum: "Choice list",
};

export default async function Page() {
  await requirePermission("products.edit");

  /**
   * Counts come back as correlated subqueries rather than two left joins.
   * Joining options and category assignments in one query multiplies the rows
   * against each other — an attribute with 4 options on 3 categories would
   * report 12 of each.
   */
  const rows = await db
    .select({
      id: attributeDefinitions.id,
      code: attributeDefinitions.code,
      label: attributeDefinitions.label,
      dataType: attributeDefinitions.dataType,
      unit: attributeDefinitions.unit,
      isFilterable: attributeDefinitions.isFilterable,
      position: attributeDefinitions.position,
      /*
       * The outer column is named literally, not interpolated.
       *
       * `${attributeDefinitions.id}` renders as bare "id" with no table
       * qualifier, and inside a subquery that binds to the INNER table's own
       * id when it has one — so this counted options whose id equalled their
       * attribute_id, which is never, and always reported zero. The
       * category_attributes count below looked correct only because that table
       * has no id column for "id" to bind to.
       */
      options: sql<number>`(
        select count(*)::int from attribute_options o
        where o.attribute_id = attribute_definitions.id
      )`,
      categories: sql<number>`(
        select count(*)::int from category_attributes ca
        where ca.attribute_id = attribute_definitions.id
      )`,
    })
    .from(attributeDefinitions)
    .orderBy(asc(attributeDefinitions.position), asc(attributeDefinitions.label));

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Attributes</h1>
          <p className="mt-1 text-sm text-muted">
            Specs that are filterable but are not variant options — wattage,
            capacity, material. Define one here and the product form shows it on
            the categories you attach it to.
          </p>
        </div>
        <Link
          href="/admin/attributes/new"
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-on-accent"
        >
          New attribute
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-line bg-raised px-5 py-8">
          <p className="text-sm font-medium">No attributes yet</p>
          <p className="mt-1.5 text-sm text-muted">
            A good first one: <span className="font-mono">capacity_mah</span> as
            a number in mAh, attached to Power Bank. It turns &ldquo;power banks
            over 10000mAh&rdquo; into a filter instead of a text search.
          </p>
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-lg border border-line bg-raised">
          <table className="w-full min-w-[46rem] text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Label</th>
                <th className="px-4 py-2.5 font-medium">Code</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Options</th>
                <th className="px-4 py-2.5 font-medium">Categories</th>
                <th className="px-4 py-2.5 font-medium">Filter</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/admin/attributes/${row.id}` as Route}
                      className="font-medium text-accent underline"
                    >
                      {row.label}
                    </Link>
                    {row.unit ? (
                      <span className="ml-1.5 text-xs text-muted">
                        ({row.unit})
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted">
                    {row.code}
                  </td>
                  <td className="px-4 py-2.5">
                    {TYPE_LABEL[row.dataType] ?? row.dataType}
                  </td>
                  <td className="px-4 py-2.5">
                    {row.dataType === "enum" ? (
                      // A choice list with no options renders an empty dropdown
                      // on the product form, so it is called out here rather
                      // than discovered there.
                      row.options === 0 ? (
                        <span className="text-warn">None yet</span>
                      ) : (
                        row.options
                      )
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {row.categories === 0 ? (
                      <span className="text-muted">Not attached</span>
                    ) : (
                      row.categories
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {row.isFilterable ? "Yes" : <span className="text-muted">No</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
