"use client";

import { useEffect } from "react";

/**
 * The admin segment's error boundary.
 *
 * Without this file a thrown server action renders the framework's own error
 * page: the admin chrome disappears, and in production the message is replaced
 * by a digest hash with no way back. That is a bad outcome for the person who
 * runs the shop — the failure looks like the whole site broke.
 *
 * `reset()` re-renders the segment without a full reload, which is usually all
 * a transient database error needs.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The server digest is the only handle on the real stack in production, so
    // it goes to the console where a support conversation can ask for it.
    console.error("admin error", error.digest ?? "", error);
  }, [error]);

  return (
    <div className="rounded-lg border border-line bg-raised px-5 py-8">
      <h1 className="text-lg font-semibold tracking-tight">
        Something went wrong
      </h1>
      <p className="mt-2 text-sm text-muted">
        The action didn&apos;t complete. Nothing was saved, so you can try again.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-on-accent"
        >
          Try again
        </button>
        {/*
          A plain anchor, not a Link: the router may itself be the thing that
          failed, and a hard navigation is the one escape that always works.
        */}
        <a href="/admin" className="text-sm text-accent underline">
          Back to dashboard
        </a>
      </div>

      {error.digest ? (
        <p className="mt-5 text-xs text-muted">
          Reference <code className="font-mono">{error.digest}</code> — quote
          this if you report the problem.
        </p>
      ) : null}
    </div>
  );
}
