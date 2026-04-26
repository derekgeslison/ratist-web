import { prisma } from "@/lib/prisma";

/**
 * Picks the next sortOrder for an entry being inserted into a
 * watchlist, honoring the user's `watchlistAddPosition` preference.
 * Movies and shows share a single sortOrder space (the reorder
 * endpoint flattens them), so we look at the min/max across both.
 *
 *   "top"    → min(existing) - 1   (so the new entry sorts first)
 *   "bottom" → max(existing) + 1   (appended at the end)
 */
export async function nextSortOrderForList(
  watchlistId: string,
  position: string
): Promise<number> {
  const [movieAgg, showAgg] = await Promise.all([
    prisma.watchlistMovie.aggregate({
      where: { watchlistId },
      _min: { sortOrder: true },
      _max: { sortOrder: true },
    }),
    prisma.watchlistShow.aggregate({
      where: { watchlistId },
      _min: { sortOrder: true },
      _max: { sortOrder: true },
    }),
  ]);

  if (position === "top") {
    const candidates = [movieAgg._min.sortOrder, showAgg._min.sortOrder].filter(
      (v): v is number => typeof v === "number"
    );
    if (candidates.length === 0) return 0;
    return Math.min(...candidates) - 1;
  }

  // Default: append at bottom.
  const candidates = [movieAgg._max.sortOrder, showAgg._max.sortOrder].filter(
    (v): v is number => typeof v === "number"
  );
  if (candidates.length === 0) return 0;
  return Math.max(...candidates) + 1;
}
