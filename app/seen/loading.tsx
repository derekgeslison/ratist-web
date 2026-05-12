import { MovieGridSkeleton } from "@/components/MovieCardSkeleton";

// /seen is the user's film diary — title + filter strip + grouped
// posters. Skeleton matches the broad structure without trying to
// reproduce the per-month grouping.
export default function Loading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="animate-pulse space-y-4 mb-6">
        <div className="h-8 w-40 bg-[var(--surface-2)] rounded" />
        <div className="flex flex-wrap gap-2">
          <div className="h-9 w-32 bg-[var(--surface-2)] rounded-lg" />
          <div className="h-9 w-28 bg-[var(--surface-2)] rounded-lg" />
          <div className="h-9 w-24 bg-[var(--surface-2)] rounded-lg" />
        </div>
      </div>
      <MovieGridSkeleton count={18} />
    </div>
  );
}
