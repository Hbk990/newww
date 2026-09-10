import { sql } from "drizzle-orm";

import { db } from "@/db";

/**
 * Proves the app can reach Postgres. Rendered per-request, never cached: a
 * cached health check reports the state of whenever it was last built.
 */
export const dynamic = "force-dynamic";

type Health =
  | { ok: true; version: string; database: string; latencyMs: number }
  | { ok: false; error: string };

/**
 * Drizzle wraps a driver failure in "Failed query: ..." and hides the real
 * reason (ECONNREFUSED, bad password, no such database) in `cause`. Without
 * unwrapping it, the page reports that something failed but not why.
 */
function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const causes: string[] = [];
  let cause = error.cause;
  while (cause instanceof Error && causes.length < 4) {
    const code = (cause as { code?: string }).code;
    causes.push(code ? `${cause.message} (${code})` : cause.message);
    cause = cause.cause;
  }
  return causes.length > 0 ? `${error.message}\n\nCaused by: ${causes.join("\n  ")}` : error.message;
}

async function check(): Promise<Health> {
  const startedAt = performance.now();
  try {
    const rows = await db.execute<{ version: string; database: string }>(
      sql`select version() as version, current_database() as database`,
    );
    const row = rows[0];
    if (!row) return { ok: false, error: "Query returned no rows" };
    return {
      ok: true,
      version: row.version,
      database: row.database,
      latencyMs: Math.round(performance.now() - startedAt),
    };
  } catch (error) {
    return { ok: false, error: describe(error) };
  }
}

export default async function HealthPage() {
  const health = await check();

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Database</h1>

      {health.ok ? (
        <>
          <p className="mt-4 text-sm font-medium text-green-700 dark:text-green-400">
            Connected in {health.latencyMs}ms
          </p>
          <dl className="mt-6 grid gap-3 text-sm">
            <div className="flex gap-3 border-b border-line pb-3">
              <dt className="w-28 shrink-0 text-muted">Database</dt>
              <dd className="font-mono">{health.database}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-28 shrink-0 text-muted">Server</dt>
              <dd className="font-mono break-all">{health.version}</dd>
            </div>
          </dl>
        </>
      ) : (
        <>
          <p className="mt-4 text-sm font-medium text-red-700 dark:text-red-400">
            Not connected
          </p>
          <pre className="mt-4 overflow-x-auto rounded border border-line p-4 text-xs whitespace-pre-wrap">
            {health.error}
          </pre>
          <p className="mt-4 text-sm text-muted">
            Start the database with <code>docker compose up -d</code>, then copy{" "}
            <code>.env.example</code> to <code>.env</code>.
          </p>
        </>
      )}
    </main>
  );
}
