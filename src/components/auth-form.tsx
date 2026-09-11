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
      className="mt-1 rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-surface disabled:opacity-60"
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
          className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          {state.error}
        </p>
      ) : null}
      {state?.notice ? (
        <p
          role="status"
          className="rounded-md border border-line bg-surface px-3 py-2 text-sm"
        >
          {state.notice}
        </p>
      ) : null}
      {children}
    </form>
  );
}
