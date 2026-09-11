import Link from "next/link";

import { signOut } from "@/lib/auth/actions";
import { requireStaff } from "@/lib/auth/guards";

/**
 * The admin gate.
 *
 * Every route under /admin passes through this layout, so access is enforced in
 * one place rather than remembered on each page. It runs on the server, so
 * nothing under here is ever sent to a browser that should not have it.
 *
 * Not middleware: the check needs the database to read the user's current role,
 * so a demoted account loses access on its next request rather than whenever
 * its cookie happens to expire.
 */
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireStaff();

  return (
    <div className="min-h-svh">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
          <Link href="/admin" className="text-sm font-semibold tracking-tight">
            DRPHONE admin
          </Link>
          <nav className="flex gap-4 text-sm text-muted">
            <Link href="/admin">Overview</Link>
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm text-muted">
            <span>
              {user.username ?? user.name ?? user.email}
              <span className="ml-1.5 rounded bg-line/50 px-1.5 py-0.5 text-xs">
                {user.role}
              </span>
            </span>
            <form action={signOut}>
              <button type="submit" className="underline underline-offset-4">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
    </div>
  );
}
