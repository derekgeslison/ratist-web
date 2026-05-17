// Gray-block skeleton shown while ProfileTabsLoader fetches the heavy
// per-tab payload (ratings, watchlists, rankings, episodes, similar
// users, recommendations). Roughly matches the final layout — tab row
// + a poster grid + a couple of section headers — so the page doesn't
// jump much when real content streams in.

export default function ProfileTabsSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Tab strip */}
      <div className="flex gap-2 border-b border-[var(--border)] mb-6 overflow-x-auto pb-px">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="h-9 w-24 shrink-0 bg-[var(--surface-2)] rounded-md"
          />
        ))}
      </div>

      {/* "Section heading" + poster grid */}
      <div className="space-y-6">
        <div className="h-5 w-40 bg-[var(--surface-2)] rounded" />
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="aspect-[2/3] rounded-lg bg-[var(--surface-2)]" />
              <div className="h-3 w-3/4 bg-[var(--surface-2)] rounded" />
              <div className="h-2.5 w-1/3 bg-[var(--surface-2)] rounded" />
            </div>
          ))}
        </div>

        <div className="h-5 w-32 bg-[var(--surface-2)] rounded mt-8" />
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] rounded bg-[var(--surface-2)]" />
          ))}
        </div>
      </div>
    </div>
  );
}
