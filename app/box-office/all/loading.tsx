import { Loader2, TrendingUp } from "lucide-react";

/**
 * Route-segment loading state for /box-office/all.
 *
 * The page's server component runs a prisma.genre.findMany before
 * rendering, which adds ~1-3s of perceived latency when the user
 * clicks "Browse the full list" from /box-office. Without this file,
 * Next.js blocks the navigation entirely — the user sees the previous
 * page until the new one is ready. With this file, Next streams this
 * skeleton in immediately so the click registers visually.
 */
export default function Loading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <TrendingUp className="w-6 h-6 text-[var(--ratist-red)]" />
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Box Office — All Movies</h1>
        </div>
        <p className="text-sm text-[var(--foreground-muted)]">
          Filter and sort every movie tracked with box-office data.
        </p>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-12 text-center">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3 text-[var(--ratist-red)]" />
        <p className="text-sm text-[var(--foreground-muted)]">
          Compiling the full box-office list…
        </p>
        <p className="text-xs text-[var(--foreground-muted)]/70 mt-2">
          Working through thousands of films. This usually takes a few seconds.
        </p>
      </div>
    </div>
  );
}
