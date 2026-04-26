import { prisma } from "@/lib/prisma";

type Mode = "none" | "all" | "default";

/**
 * Removes a movie/show from the user's watchlists when they mark it
 * seen, honoring their `autoRemoveFromWatchlistOnSeen` setting:
 *   - "none":    no-op
 *   - "default": remove from the user's default watchlist only
 *   - "all":     remove from every watchlist the user owns
 *
 * Called fire-and-forget from the seen-toggle endpoints — failures
 * shouldn't block the user from marking seen.
 */
export async function autoRemoveFromWatchlists(
  userId: string,
  mode: Mode,
  target: { movieId?: string; tvShowId?: string }
): Promise<void> {
  if (mode === "none") return;

  const lists = await prisma.watchlist.findMany({
    where: mode === "default" ? { userId, isDefault: true } : { userId },
    select: { id: true },
  });
  if (lists.length === 0) return;
  const listIds = lists.map((l) => l.id);

  if (target.movieId) {
    await prisma.watchlistMovie.deleteMany({
      where: { watchlistId: { in: listIds }, movieId: target.movieId },
    });
  }
  if (target.tvShowId) {
    await prisma.watchlistShow.deleteMany({
      where: { watchlistId: { in: listIds }, tvShowId: target.tvShowId },
    });
  }
}
