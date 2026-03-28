import { MovieGridSkeleton } from "@/components/MovieCardSkeleton";

export default function MoviesLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="h-8 w-48 bg-[var(--surface-2)] rounded animate-pulse mb-6" />
      <MovieGridSkeleton count={18} />
    </div>
  );
}
