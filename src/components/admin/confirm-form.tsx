"use client";

import { useState, useTransition } from "react";

import { confirmPassword } from "@/lib/auth/reauth-actions";

export function ConfirmForm({ next }: { next: string }) {
  const [pending, start] = useTransition();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    start(async () => {
      // On success this redirects, so there is nothing to handle here.
      const result = await confirmPassword(password, next);
      setError(result.error);
      setPassword("");
    });
  }

  return (
    <form onSubmit={submit} className="mt-6 max-w-sm space-y-4">
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-warn px-3 py-2 text-sm text-warn"
        >
          {error}
        </p>
      ) : null}

      <label className="block">
        <span className="text-sm font-medium">Your password</span>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          // The page exists for this one field and nothing else, so focus is
          // where the user is already looking. The rule guards against
          // stealing focus on a page with other content.
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          className="mt-1.5 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
        />
      </label>

      <button
        type="submit"
        disabled={pending || password.length === 0}
        className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent disabled:opacity-50"
      >
        {pending ? "Checking…" : "Confirm"}
      </button>
    </form>
  );
}
