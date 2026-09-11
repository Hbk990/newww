/**
 * Presentational only — it performs no permission check.
 *
 * An earlier version called `requirePermission` itself, and that was a real
 * hole: this renders inside a page that has already begun streaming, and a
 * `redirect()` thrown at that point cannot change a response whose headers are
 * already sent. The page looked gated and was not.
 *
 * Guards belong at the top of the page or in a layout, before anything is
 * returned. Every page using this awaits its own check first.
 */
export function Placeholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <div className="mt-6 rounded-lg border border-dashed border-line bg-raised px-5 py-8">
        <p className="text-sm text-muted">{description}</p>
        <p className="mt-3 text-xs text-muted">
          The navigation, tables and permissions around this page are built —
          this screen itself is a later step.
        </p>
      </div>
    </>
  );
}
