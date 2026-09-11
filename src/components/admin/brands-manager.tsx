"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useToast } from "@/components/admin/toast";
import {
  deleteBrand,
  saveBrand,
  type BrandInput,
} from "@/lib/admin/taxonomy-actions";
import { slugify } from "@/lib/slug";

export type BrandRow = {
  id: string;
  name: string;
  slug: string;
  isFeatured: boolean;
  position: number;
  products: number;
};

const BLANK: BrandInput = {
  name: "",
  slug: "",
  description: null,
  isFeatured: false,
  position: 0,
};

export function BrandsManager({ rows }: { rows: BrandRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<BrandInput>(BLANK);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);

  const visible = rows.filter((r) =>
    r.name.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  function openEdit(row: BrandRow) {
    setAdding(false);
    setEditing(row.id);
    setErrors({});
    setDraft({
      name: row.name,
      slug: row.slug,
      description: null,
      isFeatured: row.isFeatured,
      position: row.position,
    });
  }

  function openAdd() {
    setEditing(null);
    setAdding(true);
    setErrors({});
    setDraft({ ...BLANK, position: rows.length });
  }

  function submit(id: string | null) {
    start(async () => {
      const result = await saveBrand(id, draft);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast({ text: result.error, tone: "error" });
        return;
      }
      setErrors({});
      setEditing(null);
      setAdding(false);
      toast({ text: `${draft.name} saved.` });
      router.refresh();
    });
  }

  function remove(row: BrandRow) {
    start(async () => {
      const result = await deleteBrand(row.id);
      if (!result.ok) {
        toast({ text: result.error, tone: "error" });
        setConfirming(null);
        return;
      }
      toast({ text: `${row.name} deleted.` });
      setConfirming(null);
      router.refresh();
    });
  }

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter brands"
          aria-label="Filter brands"
          className="w-full max-w-xs rounded-md border border-line bg-surface px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={openAdd}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-on-accent"
        >
          New brand
        </button>
        <span className="text-xs text-muted">
          {rows.length} brand{rows.length === 1 ? "" : "s"}
        </span>
      </div>

      {adding ? (
        <Editor
          draft={draft}
          setDraft={setDraft}
          errors={errors}
          pending={pending}
          onSave={() => submit(null)}
          onCancel={() => setAdding(false)}
          isNew
        />
      ) : null}

      <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-raised">
        <table className="w-full min-w-[34rem] text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Web address</th>
              <th className="px-4 py-2.5 font-medium">Products</th>
              <th className="px-4 py-2.5 font-medium">Featured</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-0">
                {editing === row.id ? (
                  <td colSpan={5} className="px-2 py-2">
                    <Editor
                      draft={draft}
                      setDraft={setDraft}
                      errors={errors}
                      pending={pending}
                      onSave={() => submit(row.id)}
                      onCancel={() => setEditing(null)}
                    />
                  </td>
                ) : (
                  <>
                    <td className="px-4 py-2.5 font-medium">{row.name}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted">
                      {row.slug}
                    </td>
                    <td className="px-4 py-2.5">
                      {row.products === 0 ? (
                        <span className="text-muted">none</span>
                      ) : (
                        row.products
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {row.isFeatured ? "Yes" : <span className="text-muted">No</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {confirming === row.id ? (
                        <span className="flex items-center justify-end gap-2">
                          <span className="text-xs">Delete {row.name}?</span>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => remove(row)}
                            className="text-xs font-medium text-warn underline"
                          >
                            Yes
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirming(null)}
                            className="text-xs text-muted underline"
                          >
                            Keep
                          </button>
                        </span>
                      ) : (
                        <span className="flex items-center justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => openEdit(row)}
                            className="text-xs text-accent underline"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirming(row.id)}
                            aria-label={`Delete ${row.name}`}
                            className="text-xs text-warn underline"
                          >
                            Delete
                          </button>
                        </span>
                      )}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {visible.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          {rows.length === 0
            ? "No brands yet."
            : `No brand matches “${filter}”.`}
        </p>
      ) : null}
    </>
  );
}

function Editor({
  draft,
  setDraft,
  errors,
  pending,
  onSave,
  onCancel,
  isNew = false,
}: {
  draft: BrandInput;
  setDraft: (next: BrandInput) => void;
  errors: Record<string, string>;
  pending: boolean;
  onSave: () => void;
  onCancel: () => void;
  isNew?: boolean;
}) {
  return (
    <div
      className={`flex flex-wrap items-start gap-3 rounded-md border border-line p-3 ${
        isNew ? "mt-3 bg-raised" : "bg-surface"
      }`}
    >
      <label className="min-w-40 flex-1">
        <span className="text-xs font-medium">Name</span>
        <input
          value={draft.name}
          onChange={(e) => {
            const next = e.target.value;
            setDraft({
              ...draft,
              name: next,
              // Only a new brand derives its address from the name. An existing
              // slug is a live URL; renaming "ANKER" must not break every link
              // that points at it.
              slug: isNew ? slugify(next) : draft.slug,
            });
          }}
          // The field appears because the user just clicked to open this
          // editor, so focus is where they are already looking. The rule
          // guards against stealing focus on page load, a different thing.
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          maxLength={80}
          className="mt-1 w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm"
        />
        {errors.name ? <span className="text-xs text-warn">{errors.name}</span> : null}
      </label>

      <label className="min-w-40 flex-1">
        <span className="text-xs font-medium">Web address</span>
        <input
          value={draft.slug}
          onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
          maxLength={120}
          spellCheck={false}
          className="mt-1 w-full rounded-md border border-line bg-surface px-2.5 py-1.5 font-mono text-xs"
        />
        {errors.slug ? <span className="text-xs text-warn">{errors.slug}</span> : null}
      </label>

      <label className="mt-5 flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={draft.isFeatured}
          onChange={(e) => setDraft({ ...draft, isFeatured: e.target.checked })}
        />
        Featured
      </label>

      <div className="mt-5 flex items-center gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={pending || !draft.name.trim()}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-on-accent disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-muted underline"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
