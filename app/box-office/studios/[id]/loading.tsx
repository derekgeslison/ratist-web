// Mirrors /box-office/franchises/[id]/loading.tsx — same shape
// (header + stat strip + per-film table).
export default function Loading() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="animate-pulse">
        <div className="h-9 w-2/3 bg-[var(--surface-2)] rounded mb-2" />
        <div className="h-4 w-1/3 bg-[var(--surface-2)] rounded mb-6" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-[var(--surface-2)] rounded-xl h-20" />
          ))}
        </div>
        <div className="bg-[var(--surface-2)] rounded-xl">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] last:border-0">
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
