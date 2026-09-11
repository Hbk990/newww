/**
 * Route-level fallback. Next shows this during navigation, which is what makes
 * a click feel answered before the data arrives — the skeleton half of the
 * loading decision, the progress bar being the other.
 */
export default function AdminLoading() {
  return (
    <div className="animate-pulse">
      <div className="mb-4 h-7 w-40 rounded bg-sunken" />
      <div className="mb-3 h-9 w-full rounded bg-sunken" />
      <div className="overflow-hidden rounded-lg border border-line">
        {Array.from({ length: 8 }, (_, index) => (
          <div
            key={index}
            className="flex items-center gap-3 border-b border-line px-3 py-3 last:border-0"
          >
            <div className="size-8 shrink-0 rounded bg-sunken" />
            <div className="h-4 flex-1 rounded bg-sunken" />
            <div className="h-4 w-16 rounded bg-sunken" />
            <div className="h-4 w-12 rounded bg-sunken" />
          </div>
        ))}
      </div>
    </div>
  );
}
