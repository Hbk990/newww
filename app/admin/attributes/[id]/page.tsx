import { asc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AttributeCategories, type CategoryNode } from "@/components/admin/attribute-categories";
import { AttributeDelete } from "@/components/admin/attribute-delete";
import { AttributeForm } from "@/components/admin/attribute-form";
import { AttributeOptions } from "@/components/admin/attribute-options";
import { db } from "@/db";
import { attributeDefinitions, attributeOptions, categories, categoryAttributes } from "@/db/schema";
import { updateAttribute } from "@/lib/admin/attribute-actions";
import { requirePermission } from "@/lib/auth/guards";

export const metadata = { title: "Attribute · DRPHONE" };

export default async function Page({
  params,
}: {
  // A Promise in this version — awaited before use.
  params: Promise<{ id: string }>;
}) {
  await requirePermission("products.edit");
  const { id } = await params;

  /**
   * An id from the URL is untrusted: a malformed uuid makes Postgres raise
   * 22P02 rather than return no rows, which would surface as a 500.
   *
   * Note the response is a soft 404 — the not-found UI renders, but the status
   * is 200. `app/admin/loading.tsx` puts this page inside a Suspense boundary,
   * so the shell has already streamed by the time `notFound()` throws and the
   * status can no longer change. Returning a real 404 would mean checking in
   * `proxy` before the response starts. Not worth it here: every admin route
   * is behind auth, so an unauthenticated request gets a 307 to /login and no
   * crawler ever sees this page.
   */
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [attribute] = await db
    .select()
    .from(attributeDefinitions)
    .where(eq(attributeDefinitions.id, id));
  if (!attribute) notFound();

  const [options, tree] = await Promise.all([
    db
      .select({
        id: attributeOptions.id,
        value: attributeOptions.value,
        colorHex: attributeOptions.colorHex,
        position: attributeOptions.position,
      })
      .from(attributeOptions)
      .where(eq(attributeOptions.attributeId, id))
      .orderBy(asc(attributeOptions.position)),
    categoryTree(id),
  ]);

  return (
    <>
      <Link href="/admin/attributes" className="text-sm text-accent underline">
        ← Attributes
      </Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {attribute.label}
          </h1>
          <p className="mt-1 font-mono text-xs text-muted">{attribute.code}</p>
        </div>
        <AttributeDelete id={id} label={attribute.label} />
      </div>

      <AttributeForm
        initial={{
          code: attribute.code,
          label: attribute.label,
          dataType: attribute.dataType,
          unit: attribute.unit,
          isFilterable: attribute.isFilterable,
          isComparable: attribute.isComparable,
          position: attribute.position,
        }}
        submit={updateAttribute.bind(null, id)}
        submitLabel="Save changes"
        autoCode={false}
      />

      {/* Options only mean anything for a choice list. */}
      {attribute.dataType === "enum" ? (
        <AttributeOptions attributeId={id} rows={options} />
      ) : null}

      <AttributeCategories attributeId={id} tree={tree} />
    </>
  );
}

/**
 * The category tree with this attribute's assignments resolved onto it.
 *
 * `attributes_for_category()` answers per category, and calling it 60 times
 * would be 60 round trips. Instead it runs as a lateral join across every
 * category in one query, so the whole tree — direct assignments and inherited
 * ones, with the ancestor that supplied each — comes back at once.
 */
async function categoryTree(attributeId: string): Promise<CategoryNode[]> {
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      parentId: categories.parentId,
      position: categories.position,
      attached: sql<boolean>`${categoryAttributes.categoryId} is not null`,
      isRequired: sql<boolean>`coalesce(${categoryAttributes.isRequired}, false)`,
      inheritedFrom: sql<string | null>`resolved.source_name`,
    })
    .from(categories)
    .leftJoin(
      categoryAttributes,
      sql`${categoryAttributes.categoryId} = ${categories.id}
          and ${categoryAttributes.attributeId} = ${attributeId}`,
    )
    .leftJoin(
      sql`lateral (
        select source.name as source_name
        from attributes_for_category(${categories.id}) a
        join categories source on source.id = a.assigned_category_id
        where a.attribute_id = ${attributeId} and a.inherited
      ) resolved`,
      sql`true`,
    )
    .orderBy(asc(categories.position), asc(categories.name));

  const groups = rows.filter((r) => r.parentId === null);
  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    attached: group.attached,
    isRequired: group.isRequired,
    inheritedFrom: group.inheritedFrom,
    children: rows
      .filter((r) => r.parentId === group.id)
      .map((child) => ({
        id: child.id,
        name: child.name,
        attached: child.attached,
        isRequired: child.isRequired,
        inheritedFrom: child.inheritedFrom,
        children: [],
      })),
  }));
}
