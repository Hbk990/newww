import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">DRPHONE</h1>
      <p className="mt-2 text-sm text-muted">
        Scaffold only — no storefront yet.
      </p>

      <ol className="mt-8 space-y-2 text-sm">
        <li>
          <span className="text-muted">Step 1</span> Scaffold and database
          wiring — done
        </li>
        <li>
          <span className="text-muted">Step 2</span> Port{" "}
          <code className="rounded bg-line/40 px-1">docs/schema.sql</code> to
          Drizzle and generate the first migration
        </li>
        <li>
          <span className="text-muted">Step 3</span> Seed categories, brands and
          device models
        </li>
      </ol>

      <p className="mt-8 text-sm">
        <Link href="/health" className="underline underline-offset-4">
          Check the database connection →
        </Link>
      </p>
    </main>
  );
}
