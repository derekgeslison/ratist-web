// Mirrors /box-office/year/[year] layout: header + per-film table.
// No stat strip on this page — replaced with a thin prev/next nav row.
export default function Loading() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="animate-pulse">
        <div className="h-9 w-2/3 bg-[var(--surface-2)] rounded mb-4" />
        <div className="flex gap-2 mb-6">
          <div className="h-8 w-20 bg-[var(--surface-2)] rounded" />
          <div className="h-8 w-20 bg-[var(--surface-2)] rounded" />
        </div>
        <div className="bg-[var(--surface-2)] rounded-xl">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] last:border-0">
              <div className="w-6 h-6 bg-[var(--surface)] rounded" />
              <div className="w-8 h-12 bg-[var(--surface)] rounded" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-2/3 bg-[var(--surface)] rounded" />
              </div>
              <div className="h-4 w-16 bg-[var(--surface)] rounded" />
              <div className="h-4 w-16 bg-[var(--surface)] rounded" />
              <div className="h-4 w-12 bg-[var(--surface)] rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
