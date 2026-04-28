/**
 * "Box Office Rankings" section on the movie detail page Overview
 * tab. Renders one pill per applicable rank (all-time, year,
 * decade, genre, MPA, franchise, language) with the rank prominent
 * and the cohort label after. Each pill links into the corresponding
 * /box-office/* view.
 *
 * Renders nothing when no badges qualify — getMovieBoxOfficeRanks
 * filters out ranks beyond top-100 so the section doesn't surface
 * for movies that aren't a notable performer in any cut.
 */
import Link from "next/link";
import { TrendingUp } from "lucide-react";
import type { MovieRankBadges as RankBadges } from "@/lib/box-office-queries";

export function MovieRankBadges({ ranks }: { ranks: RankBadges }) {
  // Render order matters — broadest cohort first, narrower second.
  // Keep the all-time rank up-front since it's the most newsworthy
  // signal; specific cuts (genre, franchise) trail.
  const badges = [
    ranks.allTime,
    ranks.year,
    ranks.decade,
    ranks.genre,
    ranks.mpa,
    ranks.language,
    ranks.franchise,
  ].filter((b): b is NonNullable<typeof b> => b != null);

  if (badges.length === 0) return null;

  return (
    <div className="border-t border-[var(--border)] pt-4 mt-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-4 h-4 text-[var(--ratist-red)]" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
          Box Office Rankings
        </h3>
      </div>
      <div className="flex flex-wrap gap-2">
        {badges.map((b, i) => (
          <Link
            key={i}
            href={b.href}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--background)] border border-[var(--border)] hover:border-[var(--ratist-red)] rounded-md text-xs transition-colors group"
          >
            <span className="font-bold text-[var(--ratist-red)] tabular-nums">#{b.rank}</span>
            <span className="text-white">{b.label}</span>
            <span className="text-[var(--foreground-muted)] tabular-nums">
              of {b.total.toLocaleString()}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
