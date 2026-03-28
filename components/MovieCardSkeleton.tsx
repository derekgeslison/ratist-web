export default function MovieCardSkeleton() {
  return (
    <div className="flex flex-col bg-[var(--surface)] rounded-lg overflow-hidden border border-[var(--border)] animate-pulse">
      <div className="aspect-[2/3] bg-[var(--surface-2)]" />
      <div className="p-2.5 space-y-2">
        <div className="h-3.5 bg-[var(--surface-2)] rounded w-3/4" />
        <div className="h-3 bg-[var(--surface-2)] rounded w-1/3" />
        <div className="flex gap-2 mt-1">
          <div className="h-5 bg-[var(--surface-2)] rounded-full w-12" />
          <div className="h-5 bg-[var(--surface-2)] rounded-full w-12" />
        </div>
      </div>
    </div>
  );
}

export function MovieGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <MovieCardSkeleton key={i} />
      ))}
    </div>
  );
}
