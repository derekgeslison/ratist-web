import { prisma } from "./prisma";

export interface CollectionForProgress {
  id: string;
  items: { tmdbId: number; mediaType: "movie" | "tv" }[];
}

export interface WatchedProgress {
  watched: number;
  total: number;
}

/**
 * Count how many items in each collection the user has watched.
 *
 * "Watched" = movies have any UserWatchLog entry; TV shows have any
 * EpisodeSeen entry (one episode counts — collection cards are about
 * "you've encountered this thing", not "you've completed it").
 *
 * Single-shot batch: one TMDB→internal resolution for movies, one
 * UserWatchLog read, one EpisodeSeen read. Total of ~3 queries
 * regardless of collection count.
 */
export async function getWatchedProgressBatch(
  userId: string,
  collections: CollectionForProgress[]
): Promise<Map<string, WatchedProgress>> {
  const result = new Map<string, WatchedProgress>();
  if (collections.length === 0) return result;

  // Collect unique TMDB IDs across all collections, split by media type.
  const movieTmdbIds = new Set<number>();
  const tvTmdbIds = new Set<number>();
  for (const c of collections) {
    for (const it of c.items) {
      if (it.mediaType === "movie") movieTmdbIds.add(it.tmdbId);
      else tvTmdbIds.add(it.tmdbId);
    }
  }

  // Resolve movies (TMDB → internal). UserWatchLog uses internal Movie.id;
  // EpisodeSeen uses showTmdbId directly so no resolution needed for TV.
  const movieRows = movieTmdbIds.size > 0
    ? await prisma.movie.findMany({
        where: { tmdbId: { in: Array.from(movieTmdbIds) } },
        select: { id: true, tmdbId: true },
      })
    : [];
  const movieIdByTmdb = new Map(movieRows.map((m) => [m.tmdbId, m.id]));
  const internalMovieIds = movieRows.map((m) => m.id);

  // Pull watched movie set + watched-show set in parallel. distinct on
  // movieId / showTmdbId collapses the per-rewatch / per-episode rows.
  const [watchedMovies, watchedShows] = await Promise.all([
    internalMovieIds.length > 0
      ? prisma.userWatchLog.findMany({
          where: { userId, movieId: { in: internalMovieIds } },
          select: { movieId: true },
          distinct: ["movieId"],
        })
      : Promise.resolve([]),
    tvTmdbIds.size > 0
      ? prisma.episodeSeen.findMany({
          where: { userId, showTmdbId: { in: Array.from(tvTmdbIds) } },
          select: { showTmdbId: true },
          distinct: ["showTmdbId"],
        })
      : Promise.resolve([]),
  ]);

  const watchedMovieInternalIds = new Set(watchedMovies.map((w) => w.movieId));
  const watchedShowTmdbIds       = new Set(watchedShows.map((s) => s.showTmdbId));

  for (const c of collections) {
    let watched = 0;
    for (const it of c.items) {
      if (it.mediaType === "movie") {
        const internalId = movieIdByTmdb.get(it.tmdbId);
        if (internalId && watchedMovieInternalIds.has(internalId)) watched++;
      } else {
        if (watchedShowTmdbIds.has(it.tmdbId)) watched++;
      }
    }
    result.set(c.id, { watched, total: c.items.length });
  }

  return result;
}

/** Single-collection convenience wrapper for the detail page. */
export async function getWatchedProgress(
  userId: string,
  collection: CollectionForProgress,
): Promise<WatchedProgress> {
  const map = await getWatchedProgressBatch(userId, [collection]);
  return map.get(collection.id) ?? { watched: 0, total: collection.items.length };
}
