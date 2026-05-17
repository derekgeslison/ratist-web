// Gray-block skeleton shown while MovieDetailTabsLoader fetches reviews,
// discussions, and awards. Matches the tab strip + a content rail so
// the layout doesn't jump on swap.

export default function MovieDetailTabsSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Tab strip */}
      <div className="flex gap-2 border-b border-[var(--border)] mb-6 overflow-x-auto pb-px">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="h-9 w-28 shrink-0 bg-[var(--surface-2)] rounded-md"
          />
        ))}
      </div>

      {/* Overview-like content area */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-4">
          <div className="h-4 w-3/4 bg-[var(--surface-2)] rounded" />
          <div className="h-4 w-full bg-[var(--surface-2)] rounded" />
          <div className="h-4 w-5/6 bg-[var(--surface-2)] rounded" />
          <div className="h-4 w-2/3 bg-[var(--surface-2)] rounded" />

          <div className="h-5 w-32 bg-[var(--surface-2)] rounded mt-6" />
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <div className="aspect-[2/3] rounded-lg bg-[var(--surface-2)]" />
                <div className="h-3 w-3/4 bg-[var(--surface-2)] rounded" />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-2">
              <div className="h-3 w-24 shrink-0 bg-[var(--surface-2)] rounded" />
              <div className="h-3 flex-1 bg-[var(--surface-2)] rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
