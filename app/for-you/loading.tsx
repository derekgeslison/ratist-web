import { MovieGridSkeleton } from "@/components/MovieCardSkeleton";

// /for-you has multiple stacked sections (top picks, anticipated,
// because-you-liked, trending, watchlist, follow activity). Each is a
// header + grid pattern. Skeleton mirrors a couple of those so the
// shape is familiar before the data resolves.
export default function Loading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
      <div className="animate-pulse h-8 w-56 bg-[var(--surface-2)] rounded" />
      {Array.from({ length: 2 }).map((_, s) => (
        <div key={s}>
          <div className="animate-pulse h-6 w-48 bg-[var(--surface-2)] rounded mb-4" />
          <MovieGridSkeleton count={10} />
        </div>
      ))}
    </div>
  );
}
