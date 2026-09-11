"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useToast } from "@/components/admin/toast";
import { addOption, deleteOption, reorderOptions } from "@/lib/admin/attribute-actions";

export type OptionRow = {
  id: string;
  value: string;
  colorHex: string | null;
  position: number;
};

/**
 * The choice list for an `enum` attribute.
 *
 * Reorder is up/down buttons rather than drag-and-drop: these lists are short,
 * buttons work on touch and with a keyboard without any extra work, and drag
 * needs a live region to be usable by a screen reader at all.
 */
export function AttributeOptions({
  attributeId,
  rows,
}: {
  attributeId: string;
  rows: OptionRow[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [value, setValue] = useState("");
  const [colorHex, setColorHex] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    start(async () => {
      const result = await addOption(attributeId, { value: trimmed, colorHex });
      if (result.ok) {
        setValue("");
        setColorHex("");
        setError(null);
        router.refresh();
        return;
      }
      setError(result.error);
    });
  }

  function remove(row: OptionRow) {
    start(async () => {
      const result = await deleteOption(attributeId, row.id);
      if (!result.ok) {
        toast({ text: result.error, tone: "error" });
        return;
      }
      toast({ text: `Removed “${row.value}”.` });
      router.refresh();
    });
  }

  function move(index: number, delta: number) {
    const next = [...rows];
    const target = index + delta;
    const a = next[index];
    const b = next[target];
    // Guards the ends of the list, and satisfies noUncheckedIndexedAccess
    // without a non-null assertion.
    if (!a || !b) return;
    next[index] = b;
    next[target] = a;
    start(async () => {
      const result = await reorderOptions(attributeId, next.map((r) => r.id));
      if (!result.ok) {
        toast({ text: result.error, tone: "error" });
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="mt-8">
      <h2 className="text-base font-semibold">Options</h2>
      <p className="mt-1 text-sm text-muted">
        The dropdown the product form shows. Defining them here is what stops
        &ldquo;Silicone&rdquo;, &ldquo;silicone&rdquo; and &ldquo;silicon&rdquo;
        becoming three different filters.
      </p>

      {rows.length === 0 ? (
        <p className="mt-3 rounded-md border border-dashed border-warn px-3 py-2.5 text-sm text-muted">
          No options yet — this attribute would render an empty dropdown.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-raised">
          {rows.map((row, index) => (
            <li key={row.id} className="flex items-center gap-3 px-3 py-2">
              {row.colorHex ? (
                <span
                  aria-hidden
                  className="size-4 shrink-0 rounded-full border border-line"
                  style={{ backgroundColor: row.colorHex }}
                />
              ) : null}
              <span className="min-w-0 flex-1 truncate text-sm">{row.value}</span>
              {row.colorHex ? (
                <span className="font-mono text-xs text-muted">{row.colorHex}</span>
              ) : null}
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={pending || index === 0}
                aria-label={`Move ${row.value} up`}
                className="px-1.5 text-muted disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={pending || index === rows.length - 1}
                aria-label={`Move ${row.value} down`}
                className="px-1.5 text-muted disabled:opacity-30"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => remove(row)}
                disabled={pending}
                className="text-xs text-warn underline disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="mt-3 flex flex-wrap items-start gap-2">
        <span className="min-w-48 flex-1">
          <input
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            placeholder="Add an option — Silicone"
            maxLength={60}
            className="w-full rounded-md border border-line bg-bg px-3 py-2 text-sm"
          />
          {error ? <span className="mt-1 block text-xs text-warn">{error}</span> : null}
        </span>
        <span className="flex items-center gap-1.5">
          {/*
            Paired colour picker and text input: the picker cannot express
            "no swatch", and the text field cannot be browsed. Clearing the
            text is how a swatch is removed.
          */}
          <input
            type="color"
            value={colorHex || "#888888"}
            onChange={(e) => setColorHex(e.target.value)}
            aria-label="Swatch colour"
            className="size-9 rounded-md border border-line bg-bg"
          />
          <input
            value={colorHex}
            onChange={(e) => setColorHex(e.target.value)}
            placeholder="#hex"
            aria-label="Swatch hex"
            className="w-24 rounded-md border border-line bg-bg px-2 py-2 font-mono text-xs"
          />
        </span>
        <button
          type="submit"
          disabled={pending || !value.trim()}
          className="rounded-md border border-line px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          Add
        </button>
      </form>
    </section>
  );
}
