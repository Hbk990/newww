"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useToast } from "@/components/admin/toast";
import {
  VariantGrid,
  type Axis,
  type DeviceOption,
  type Row,
} from "@/components/admin/variant-grid";
import { createProduct } from "@/lib/admin/product-form-actions";
import { skuFragment, slugify } from "@/lib/slug";

type Brand = { id: string; name: string };
type Category = { id: string; name: string; parentId: string | null; position: number };

export function ProductForm({
  brands,
  categories,
  devices,
  showCost,
}: {
  brands: Brand[];
  categories: Category[];
  devices: DeviceOption[];
  showCost: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [brandId, setBrandId] = useState("");
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [shortDescription, setShortDescription] = useState("");
  const [status, setStatus] = useState("draft");
  const [axes, setAxes] = useState<Axis[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // One default row, so a product sold one way needs no options at all.
  const [rows, setRows] = useState<Row[]>([
    { combo: [], key: "", title: "Default", sku: "", price: "", available: true, fresh: true },
  ]);

  const groups = categories.filter((c) => c.parentId === null);
  const brandName = brands.find((b) => b.id === brandId)?.name ?? "";
  // A prefix from the brand and title gives SKUs that read as a set, and it
  // rebuilds as those fields change until a SKU is typed by hand.
  const skuPrefix = [skuFragment(brandName).slice(0, 3), skuFragment(title).slice(0, 7)]
    .filter(Boolean)
    .join("-");

  function submit(event: React.FormEvent, andAnother: boolean) {
    event.preventDefault();
    start(async () => {
      const result = await createProduct({
        title,
        slug: slug || slugify(title),
        brandId: brandId || null,
        categoryIds,
        shortDescription: shortDescription || null,
        status: status as "draft" | "active" | "discontinued" | "archived",
        options: axes
          // An axis with no values contributes nothing but would multiply the
          // grid by zero, so it is dropped rather than rejected.
          .filter((a) => a.name.trim() && a.values.length > 0)
          .map((a) => ({ name: a.name.trim(), kind: a.kind as never, values: a.values })),
        variants: rows.map((r) => ({
          combo: r.combo,
          title: r.title,
          sku: r.sku.trim() || null,
          price: r.price.trim(),
          costCents: null,
          available: r.available,
        })),
      });

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast({ text: result.error, tone: "error" });
        return;
      }
      setErrors({});
      toast({ text: `${title} saved.` });

      if (andAnother) {
        // Keeps brand, categories and status — the fields that repeat across a
        // batch — and clears what identifies the product.
        setTitle("");
        setSlug("");
        setSlugTouched(false);
        setShortDescription("");
        setAxes([]);
        setRows([
          { combo: [], key: "", title: "Default", sku: "", price: "", available: true, fresh: true },
        ]);
        router.refresh();
        return;
      }
      router.push("/admin/products");
      router.refresh();
    });
  }

  return (
    <form onSubmit={(e) => submit(e, false)} className="mt-5">
      <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
        <div className="min-w-0 space-y-4">
          <Field label="Title" error={errors.title}>
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
              required
              maxLength={200}
              placeholder="Green Lion - Magnetic Cover"
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
            />
          </Field>

          <Field
            label="Web address"
            error={errors.slug}
            hint="What the product's page is called. Derived from the title until you edit it."
          >
            <div className="flex items-center gap-1 text-sm">
              <span className="shrink-0 text-muted">/p/</span>
              <input
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value);
                }}
                maxLength={220}
                spellCheck={false}
                className="w-full rounded-md border border-line bg-surface px-3 py-2 font-mono text-xs"
              />
            </div>
          </Field>

          <Field label="Short description" error={errors.shortDescription}>
            <textarea
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              maxLength={500}
              rows={3}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
            />
          </Field>
        </div>

        <aside className="space-y-4">
          <Field label="Status">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
            >
              <option value="draft">Draft — not on the site</option>
              <option value="active">Active — on sale</option>
              <option value="discontinued">Discontinued</option>
            </select>
          </Field>

          <Field label="Brand">
            <select
              value={brandId}
              onChange={(e) => setBrandId(e.target.value)}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
            >
              <option value="">No brand</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>

          <fieldset>
            <legend className="text-sm font-medium">Categories</legend>
            <p className="mt-0.5 text-xs text-muted">
              The first one ticked is the primary — it decides the breadcrumb.
            </p>
            <div className="mt-2 max-h-64 space-y-2 overflow-auto rounded-md border border-line bg-raised p-2.5">
              {groups.map((group) => (
                <div key={group.id}>
                  <p className="text-xs font-semibold text-muted">{group.name}</p>
                  <div className="mt-1 space-y-0.5 pl-1.5">
                    {categories
                      .filter((c) => c.parentId === group.id)
                      .map((child) => (
                        <label key={child.id} className="flex cursor-pointer items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={categoryIds.includes(child.id)}
                            onChange={(e) =>
                              setCategoryIds((previous) =>
                                e.target.checked
                                  ? [...previous, child.id]
                                  : previous.filter((id) => id !== child.id),
                              )
                            }
                          />
                          {child.name}
                        </label>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </fieldset>
        </aside>
      </div>

      <VariantGrid
        axes={axes}
        setAxes={setAxes}
        rows={rows}
        setRows={setRows}
        devices={devices}
        skuPrefix={skuPrefix}
        showCost={showCost}
        error={errors["variants"] ?? errors["options"] ?? errors.sku}
      />

      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-on-accent disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save product"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={(e) => submit(e, true)}
          className="rounded-md border border-line px-3.5 py-2 text-sm font-medium disabled:opacity-60"
        >
          Save and create another
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/products")}
          className="text-sm text-muted underline"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      {hint ? <span className="mt-0.5 block text-xs text-muted">{hint}</span> : null}
      <span className="mt-1.5 block">{children}</span>
      {error ? <span className="mt-1 block text-xs text-warn">{error}</span> : null}
    </label>
  );
}
