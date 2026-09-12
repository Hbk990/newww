"use client";

import { useState, useTransition } from "react";

import { resendCode } from "@/lib/auth/actions";

export function ResendCode() {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="mt-5 text-sm text-muted">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await resendCode();
            setMessage(result?.error ?? result?.notice ?? null);
          })
        }
        className="text-ink underline underline-offset-4 disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send another code"}
      </button>
      {message ? (
        <p
          role="status"
          className="mt-2 rounded-lg border border-line bg-accent-soft px-3 py-2 text-sm text-ink"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
