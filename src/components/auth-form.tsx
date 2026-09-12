"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { FormState } from "@/lib/auth/actions";

export function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1 rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-on-accent disabled:opacity-60"
    >
      {pending ? "Working…" : label}
    </button>
  );
}

export function Field({
  label,
  name,
  type = "text",
  hint,
  ...rest
}: {
  label: string;
  name: string;
  type?: string;
  hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <input
        id={name}
        name={name}
        type={type}
        className="rounded-md border border-line bg-surface px-3 py-2 text-sm"
        /* aria-invalid is not set here: these forms report one error for the
           whole submission rather than per field, so marking every input as
           invalid would be a lie to a screen reader. */
        {...rest}
      />
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

/**
 * Wraps a server action so errors render next to the form instead of replacing
 * the page, and so what was typed survives a failed submit.
 */
export function ActionForm({
  action,
  children,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  children: React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error ? (
        <p
          role="alert"
          /* The palette's own warning colour rather than hardcoded reds:
             those were written before the shop had a red of its own, and two
             reds on one page read as a mistake. */
          className="rounded-md border border-warn px-3 py-2 text-sm text-warn"
        >
          {state.error}
        </p>
      ) : null}
      {state?.notice ? (
        <p
          role="status"
          className="rounded-md border border-line bg-surface px-3 py-2 text-sm"
        /* aria-invalid is not set here: these forms report one error for the
           whole submission rather than per field, so marking every input as
           invalid would be a lie to a screen reader. */
        >
          {state.notice}
        </p>
      ) : null}
      {children}
    </form>
  );
}
