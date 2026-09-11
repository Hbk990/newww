"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useToast } from "@/components/admin/toast";
import type {
  ActionResult,
  AttributeInput,
} from "@/lib/admin/attribute-actions";

const TYPES = [
  {
    value: "text",
    label: "Text",
    hint: "Free text. Not filterable in a useful way — prefer a choice list.",
  },
  {
    value: "number",
    label: "Number",
    hint: "Sortable and range-filterable: “over 10000mAh” works.",
  },
  { value: "boolean", label: "Yes / no", hint: "A single on-or-off spec." },
  {
    value: "enum",
    label: "Choice list",
    hint: "You define the options; the product form shows a dropdown.",
  },
] as const;

/**
 * Turns "Battery capacity" into "battery_capacity".
 *
 * Only ever used to prefill an untouched code field on a new attribute. Once
 * the code exists it is the storefront's filter key, so it is never quietly
 * rewritten by editing the label.
 */
function slugifyCode(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);
}

export function AttributeForm({
  initial,
  submit,
  submitLabel,
  /** Create prefills the code from the label; edit leaves it alone. */
  autoCode,
}: {
  initial: AttributeInput;
  submit: (input: AttributeInput) => Promise<ActionResult>;
  submitLabel: string;
  autoCode: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [form, setForm] = useState<AttributeInput>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Once the code is typed into, the label stops driving it — otherwise a
  // deliberate code is overwritten by the next keystroke in the label.
  const [codeTouched, setCodeTouched] = useState(!autoCode);

  function set<K extends keyof AttributeInput>(key: K, value: AttributeInput[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
    // Clear this field's error as soon as it changes: leaving it up while the
    // value is being corrected makes the form feel broken.
    setErrors((previous) => {
      if (!previous[key]) return previous;
      const next = { ...previous };
      delete next[key as string];
      return next;
    });
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    start(async () => {
      const result = await submit(form);
      if (result.ok) {
        setErrors({});
        toast({ text: `${form.label} saved.` });
        if (result.id) router.push(`/admin/attributes/${result.id}`);
        else router.push("/admin/attributes");
        // The list and the edit page both read this row; without a refresh the
        // destination can render from a cache that predates the write.
        router.refresh();
        return;
      }
      setErrors(result.fieldErrors ?? {});
      toast({ text: result.error, tone: "error" });
    });
  }

  const showUnit = form.dataType === "number";

  return (
    <form onSubmit={onSubmit} className="mt-5 max-w-2xl space-y-5">
      <Field label="Label" error={errors.label} hint="What staff and customers see, like “Battery capacity”.">
        <input
          value={form.label}
          onChange={(e) => {
            const label = e.target.value;
            set("label", label);
            if (!codeTouched) set("code", slugifyCode(label));
          }}
          maxLength={80}
          required
          className="w-full rounded-md border border-line bg-bg px-3 py-2 text-sm"
        />
      </Field>

      <Field
        label="Code"
        error={errors.code}
        hint="The filter key in URLs. Lowercase letters, numbers and underscores."
      >
        <input
          value={form.code}
          onChange={(e) => {
            setCodeTouched(true);
            set("code", e.target.value);
          }}
          maxLength={50}
          required
          spellCheck={false}
          className="w-full rounded-md border border-line bg-bg px-3 py-2 font-mono text-sm"
        />
      </Field>

      <fieldset>
        <legend className="text-sm font-medium">Type</legend>
        {errors.dataType ? (
          <p className="mt-1 text-xs text-warn">{errors.dataType}</p>
        ) : null}
        <div className="mt-2 space-y-2">
          {TYPES.map((type) => (
            <label
              key={type.value}
              className={`flex cursor-pointer gap-3 rounded-md border px-3 py-2.5 ${
                form.dataType === type.value
                  ? "border-accent bg-accent-soft"
                  : "border-line"
              }`}
            >
              <input
                type="radio"
                name="dataType"
                value={type.value}
                checked={form.dataType === type.value}
                onChange={() => set("dataType", type.value)}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-medium">{type.label}</span>
                <span className="block text-xs text-muted">{type.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {showUnit ? (
        <Field
          label="Unit"
          error={errors.unit}
          hint="Shown after the number — mAh, W, mm. Optional."
        >
          <input
            value={form.unit ?? ""}
            onChange={(e) => set("unit", e.target.value || null)}
            maxLength={16}
            className="w-40 rounded-md border border-line bg-bg px-3 py-2 text-sm"
          />
        </Field>
      ) : null}

      <div className="space-y-2">
        <Toggle
          checked={form.isFilterable}
          onChange={(v) => set("isFilterable", v)}
          label="Show as a storefront filter"
          hint="Appears in the sidebar filters on category pages."
        />
        <Toggle
          checked={form.isComparable}
          onChange={(v) => set("isComparable", v)}
          label="Include when comparing products"
          hint="Appears as a row in a side-by-side comparison."
        />
      </div>

      <Field
        label="Sort position"
        error={errors.position}
        hint="Lower numbers come first on the product form. Ties fall back to the label."
      >
        <input
          type="number"
          value={form.position}
          onChange={(e) => set("position", Number(e.target.value))}
          min={0}
          max={9999}
          className="w-28 rounded-md border border-line bg-bg px-3 py-2 text-sm"
        />
      </Field>

      <div className="flex items-center gap-3 border-t border-line pt-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-on-accent disabled:opacity-60"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/attributes")}
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

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5"
      />
      <span>
        <span className="block text-sm">{label}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </label>
  );
}
