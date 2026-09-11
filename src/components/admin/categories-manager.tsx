"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useToast } from "@/components/admin/toast";
import {
  deleteCategory,
  saveCategory,
  type CategoryInput,
} from "@/lib/admin/taxonomy-actions";
import { slugify } from "@/lib/slug";

export type CategoryRow = {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  isActive: boolean;
  position: number;
  products: number;
  children: number;
};

export function CategoriesManager({ rows }: { rows: CategoryRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  /** Holds the parent id when adding a child, or null when adding a group. */
  const [addingUnder, setAddingUnder] = useState<string | null | undefined>(undefined);
  const [draft, setDraft] = useState<CategoryInput | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState<string | null>(null);

  const groups = rows.filter((r) => r.parentId === null);
  const childrenOf = (id: string) => rows.filter((r) => r.parentId === id);

  function openEdit(row: CategoryRow) {
    setAddingUnder(undefined);
    setEditing(row.id);
    setErrors({});
    setDraft({
      name: row.name,
      slug: row.slug,
      parentId: row.parentId,
      description: null,
      isActive: row.isActive,
      position: row.position,
    });
  }

  function openAdd(parentId: string | null) {
    setEditing(null);
    setAddingUnder(parentId);
    setErrors({});
    setDraft({
      name: "",
      slug: "",
      parentId,
      description: null,
      isActive: true,
      position: parentId ? childrenOf(parentId).length : groups.length,
    });
  }

  function close() {
    setEditing(null);
    setAddingUnder(undefined);
    setDraft(null);
    setErrors({});
  }

  function submit(id: string | null) {
    if (!draft) return;
    start(async () => {
      const result = await saveCategory(id, draft);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast({ text: result.error, tone: "error" });
        return;
      }
      toast({ text: `${draft.name} saved.` });
      close();
      router.refresh();
    });
  }

  function remove(row: CategoryRow) {
    start(async () => {
      const result = await deleteCategory(row.id);
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

  const editor = (id: string | null) =>
    draft ? (
      <Editor
        draft={draft}
        setDraft={setDraft}
        errors={errors}
        pending={pending}
        isNew={id === null}
        onSave={() => submit(id)}
        onCancel={close}
      />
    ) : null;

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => openAdd(null)}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-on-accent"
        >
          New group
        </button>
        <span className="text-xs text-muted">
          {groups.length} group{groups.length === 1 ? "" : "s"} ·{" "}
          {rows.length - groups.length} categor
          {rows.length - groups.length === 1 ? "y" : "ies"}
        </span>
      </div>

      {addingUnder === null ? <div className="mt-3">{editor(null)}</div> : null}

      <div className="mt-4 space-y-2">
        {groups.map((group) => (
          <div key={group.id} className="rounded-lg border border-line bg-raised">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
              <span className="font-medium">{group.name}</span>
              {!group.isActive ? (
                <span className="rounded bg-sunken px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                  off
                </span>
              ) : null}
              <span className="font-mono text-xs text-muted">{group.slug}</span>
              <span className="text-xs text-muted">
                {childrenOf(group.id).length} inside
                {group.products > 0 ? ` · ${group.products} filed here` : null}
              </span>
              <Actions
                row={group}
                pending={pending}
                confirming={confirming === group.id}
                onEdit={() => openEdit(group)}
                onAskDelete={() => setConfirming(group.id)}
                onCancelDelete={() => setConfirming(null)}
                onDelete={() => remove(group)}
                onAddChild={() => openAdd(group.id)}
              />
            </div>

            {editing === group.id ? <div className="px-3 pb-3">{editor(group.id)}</div> : null}
            {addingUnder === group.id ? (
              <div className="px-3 pb-3">{editor(null)}</div>
            ) : null}

            <ul className="divide-y divide-line border-t border-line">
              {childrenOf(group.id).map((child) => (
                <li key={child.id} className="px-3 py-2">
                  {editing === child.id ? (
                    editor(child.id)
                  ) : (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-3">
                      <span className="text-sm">{child.name}</span>
                      {!child.isActive ? (
                        <span className="rounded bg-sunken px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                          off
                        </span>
                      ) : null}
                      <span className="font-mono text-xs text-muted">{child.slug}</span>
                      <span className="text-xs text-muted">
                        {child.products === 0
                          ? "no products"
                          : `${child.products} product${child.products === 1 ? "" : "s"}`}
                      </span>
                      <Actions
                        row={child}
                        pending={pending}
                        confirming={confirming === child.id}
                        onEdit={() => openEdit(child)}
                        onAskDelete={() => setConfirming(child.id)}
                        onCancelDelete={() => setConfirming(null)}
                        onDelete={() => remove(child)}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}

function Actions({
  row,
  pending,
  confirming,
  onEdit,
  onAskDelete,
  onCancelDelete,
  onDelete,
  onAddChild,
}: {
  row: CategoryRow;
  pending: boolean;
  confirming: boolean;
  onEdit: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
  onAddChild?: () => void;
}) {
  if (confirming) {
    return (
      <span className="ml-auto flex items-center gap-2">
        <span className="text-xs">Delete {row.name}?</span>
        <button
          type="button"
          disabled={pending}
          onClick={onDelete}
          className="text-xs font-medium text-warn underline"
        >
          Yes
        </button>
        <button type="button" onClick={onCancelDelete} className="text-xs text-muted underline">
          Keep
        </button>
      </span>
    );
  }
  return (
    <span className="ml-auto flex items-center gap-3">
      {onAddChild ? (
        <button type="button" onClick={onAddChild} className="text-xs text-accent underline">
          Add inside
        </button>
      ) : null}
      <button type="button" onClick={onEdit} className="text-xs text-accent underline">
        Edit
      </button>
      <button
        type="button"
        onClick={onAskDelete}
        aria-label={`Delete ${row.name}`}
        className="text-xs text-warn underline"
      >
        Delete
      </button>
    </span>
  );
}

function Editor({
  draft,
  setDraft,
  errors,
  pending,
  isNew,
  onSave,
  onCancel,
}: {
  draft: CategoryInput;
  setDraft: (next: CategoryInput) => void;
  errors: Record<string, string>;
  pending: boolean;
  isNew: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start gap-3 rounded-md border border-line bg-surface p-3">
      <label className="min-w-40 flex-1">
        <span className="text-xs font-medium">Name</span>
        <input
          value={draft.name}
          onChange={(e) =>
            setDraft({
              ...draft,
              name: e.target.value,
              // An existing slug is a live URL and is never rewritten by a
              // rename; a new one derives from the name.
              slug: isNew ? slugify(e.target.value) : draft.slug,
            })
          }
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
          checked={draft.isActive}
          onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
        />
        Shown on the site
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
        <button type="button" onClick={onCancel} className="text-xs text-muted underline">
          Cancel
        </button>
      </div>
      {errors.parentId ? (
        <p className="w-full text-xs text-warn">{errors.parentId}</p>
      ) : null}
    </div>
  );
}
