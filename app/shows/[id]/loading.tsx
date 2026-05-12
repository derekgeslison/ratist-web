// Mirrors /movies/[id]/loading.tsx — same skeleton shape since the
// show detail page lays out near-identically to the movie detail
// page (backdrop, poster, title, action row, tabs).

export default function Loading() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="animate-pulse">
        <div className="h-4 w-24 bg-[var(--surface-2)] rounded mb-4" />
        <div className="aspect-[16/9] bg-[var(--surface-2)] rounded-2xl mb-6" />
        <div className="flex items-start gap-4 mb-4">
          <div className="hidden sm:block w-32 aspect-[2/3] bg-[var(--surface-2)] rounded-lg shrink-0 -mt-20 relative z-10" />
          <div className="flex-1 min-w-0">
            <div className="h-9 w-3/4 bg-[var(--surface-2)] rounded mb-3" />
            <div className="h-4 w-1/2 bg-[var(--surface-2)] rounded mb-3" />
            <div className="flex gap-2 mb-4">
              <div className="h-6 w-16 bg-[var(--surface-2)] rounded-full" />
              <div className="h-6 w-20 bg-[var(--surface-2)] rounded-full" />
              <div className="h-6 w-14 bg-[var(--surface-2)] rounded-full" />
            </div>
            <div className="h-4 w-full bg-[var(--surface-2)] rounded mb-1.5" />
            <div className="h-4 w-5/6 bg-[var(--surface-2)] rounded" />
          </div>
        </div>
        <div className="flex gap-2 mb-6">
          <div className="h-10 w-28 bg-[var(--surface-2)] rounded-lg" />
          <div className="h-10 w-28 bg-[var(--surface-2)] rounded-lg" />
          <div className="h-10 w-28 bg-[var(--surface-2)] rounded-lg" />
        </div>
        <div className="flex gap-2 mb-6 border-b border-[var(--border)] pb-3">
          <div className="h-7 w-20 bg-[var(--surface-2)] rounded" />
          <div className="h-7 w-24 bg-[var(--surface-2)] rounded" />
          <div className="h-7 w-20 bg-[var(--surface-2)] rounded" />
          <div className="h-7 w-20 bg-[var(--surface-2)] rounded" />
        </div>
        <div className="space-y-3">
          <div className="h-4 w-full bg-[var(--surface-2)] rounded" />
          <div className="h-4 w-5/6 bg-[var(--surface-2)] rounded" />
          <div className="h-4 w-4/6 bg-[var(--surface-2)] rounded" />
        </div>
      </div>
    </div>
  );
}
