"use client";

import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";

import type { FormState } from "@/lib/auth/actions";

/**
 * The controls the five auth screens are built from.
 *
 * Every order passes through these now that an account is required, so they
 * are worth more care than a form nobody sees twice: a full-width submit that
 * says what it does, a password field that can be read back, a code field
 * shaped like the six digits it wants, and validation styling the browser does
 * for free.
 */

export function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-2 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "Working…" : label}
    </button>
  );
}

/*
 * `:user-invalid` rather than `:invalid`.
 *
 * `:invalid` matches an empty required field the moment the page loads, so
 * every field on a registration form is outlined in red before anyone has
 * typed anything. `:user-invalid` waits until the field has been interacted
 * with or the form submitted, which is when the feedback is useful rather than
 * accusatory. Supported everywhere this shop's customers are.
 */
const FIELD =
  "w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none transition-colors focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/25 user-invalid:border-warn";

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
  const hintId = `${name}-hint`;
  return (
    <label className="flex flex-col gap-1.5" htmlFor={name}>
      <span className="text-sm font-medium">{label}</span>
      <input
        id={name}
        name={name}
        type={type}
        aria-describedby={hint ? hintId : undefined}
        className={FIELD}
        {...rest}
      />
      {hint ? (
        <span id={hintId} className="text-xs text-muted">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

/**
 * A password field that can be read back.
 *
 * On a phone, in a shop, a mistyped password is the most common reason someone
 * gives up on an account — and the requirement to have one is now the
 * requirement to place an order. The toggle is a button rather than a
 * checkbox so a thumb can hit it, and it says which state it will move to.
 */
export function PasswordField({
  label,
  name,
  hint,
  ...rest
}: {
  label: string;
  name: string;
  hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const [shown, setShown] = useState(false);
  const hintId = `${name}-hint`;

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium" htmlFor={name}>
        {label}
      </label>
      <div className="relative">
        <input
          id={name}
          name={name}
          type={shown ? "text" : "password"}
          aria-describedby={hint ? hintId : undefined}
          className={`${FIELD} pr-16`}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setShown((value) => !value)}
          // The control is the eye; the label says what pressing it does.
          className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-muted hover:text-ink"
        >
          {shown ? "Hide" : "Show"}
        </button>
      </div>
      {hint ? (
        <span id={hintId} className="text-xs text-muted">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/**
 * The six-digit code field, shaped like what it wants.
 *
 * One wide input rather than six boxes: six inputs need paste handling,
 * per-box focus management and backspace rules, and they break the `one-time-code`
 * autofill that iOS and Android offer from the SMS or the email itself. This
 * keeps the autofill and gets the same look from letter-spacing.
 *
 * `inputMode="numeric"` brings up the number pad; `pattern` is what makes the
 * browser refuse four digits before the request is ever sent.
 */
export function CodeField({
  label,
  name = "code",
  hint,
}: {
  label: string;
  name?: string;
  hint?: string;
}) {
  const hintId = useId();
  return (
    <label className="flex flex-col gap-1.5" htmlFor={name}>
      <span className="text-sm font-medium">{label}</span>
      <input
        id={name}
        name={name}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        placeholder="000000"
        aria-describedby={hint ? hintId : undefined}
        className="w-full rounded-lg border border-line bg-surface px-3 py-3 text-center text-2xl tracking-[0.45em] indent-[0.45em] tabular outline-none transition-colors placeholder:text-line focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/25 user-invalid:border-warn"
      />
      {hint ? (
        <span id={hintId} className="text-xs text-muted">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

/** A rule with a word in it, for "or continue with". */
export function Divider({ label }: { label: string }) {
  return (
    <div className="my-6 flex items-center gap-3">
      <span aria-hidden="true" className="h-px flex-1 bg-line" />
      <span className="text-xs uppercase tracking-[0.14em] text-muted">
        {label}
      </span>
      <span aria-hidden="true" className="h-px flex-1 bg-line" />
    </div>
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
          /* The palette's own warning colour rather than hardcoded reds: those
             were written before the shop had a red of its own, and two reds on
             one page read as a mistake. */
          className="rounded-lg border border-warn bg-warn/5 px-3 py-2.5 text-sm text-warn"
        >
          {state.error}
        </p>
      ) : null}
      {state?.notice ? (
        <p
          role="status"
          className="rounded-lg border border-line bg-accent-soft px-3 py-2.5 text-sm"
        >
          {state.notice}
        </p>
      ) : null}
      {children}
    </form>
  );
}
