import Link from "next/link";
import type { Route } from "next";

/**
 * Shown instead of letting someone fill a form that will bounce on save.
 *
 * The guard in `requirePermission` is what actually enforces re-authentication,
 * and it redirects without knowing which page asked — it cannot. So a screen
 * that knows it is about to need it says so first, and carries the return path
 * the guard could not.
 */
export function ReauthNotice({ next }: { next: string }) {
  return (
    <div className="mt-4 rounded-lg border border-warn bg-raised p-4">
      <p className="text-sm font-medium">Confirm your password to make changes</p>
      <p className="mt-1 text-sm text-muted">
        You can read this screen as it is. Changing it needs your password
        again, which guards against a laptop left unlocked.
      </p>
      <Link
        href={`/admin/confirm?next=${encodeURIComponent(next)}` as Route}
        className="mt-2 inline-block text-sm text-accent underline"
      >
        Confirm it is you
      </Link>
    </div>
  );
}
