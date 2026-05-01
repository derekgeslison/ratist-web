import { prisma } from "./prisma";
import { getBatchScoreEstimates, getBatchScoreEstimatesTv } from "./profile";

// Minimum number of items in a collection that must produce a non-null
// prediction before we'll publish a match score. One lucky guess on a
// 10-item collection shouldn't drive a "94% match" badge.
const MIN_PREDICTED_ITEMS = 2;

export interface CollectionItemRef {
  tmdbId: number;
  mediaType: "movie" | "tv";
}

/**
 * Cross-media batch predictor. Resolves TMDB IDs → internal Movie/TVShow
 * IDs in one round-trip per type, then delegates to the focused
 * estimators in lib/profile.ts. Returns a Map keyed by `${mediaType}-${tmdbId}`
 * (string) → predicted 1-10 score, or null when not enough community data
 * exists to predict.
 */
export async function predictRatingsBatch(
  userId: string,
  items: CollectionItemRef[]
): Promise<Map<string, number | null>> {
  const result = new Map<string, number | null>();
  if (items.length === 0) return result;

  const movieTmdbIds = Array.from(new Set(items.filter((i) => i.mediaType === "movie").map((i) => i.tmdbId)));
  const tvTmdbIds    = Array.from(new Set(items.filter((i) => i.mediaType === "tv").map((i) => i.tmdbId)));

  // Resolve TMDB → internal in parallel. The resolution rows include both
  // tmdbId and id so the prediction map can be re-keyed back to TMDB.
  const [movies, shows] = await Promise.all([
    movieTmdbIds.length > 0
      ? prisma.movie.findMany({ where: { tmdbId: { in: movieTmdbIds } }, select: { id: true, tmdbId: true } })
      : Promise.resolve([]),
    tvTmdbIds.length > 0
      ? prisma.tVShow.findMany({ where: { tmdbId: { in: tvTmdbIds } }, select: { id: true, tmdbId: true } })
      : Promise.resolve([]),
  ]);

  const movieIdByTmdb = new Map(movies.map((m) => [m.tmdbId, m.id]));
  const showIdByTmdb  = new Map(shows.map((s) => [s.tmdbId, s.id]));

  // Run the two focused estimators in parallel against the resolved
  // internal IDs. Either may be empty if the collection is single-media.
  const [movieEstimates, tvEstimates] = await Promise.all([
    movies.length > 0 ? getBatchScoreEstimates(userId, movies.map((m) => m.id)) : Promise.resolve(new Map<string, number | null>()),
    shows.length  > 0 ? getBatchScoreEstimatesTv(userId, shows.map((s) => s.id)) : Promise.resolve(new Map<string, number | null>()),
  ]);

  for (const item of items) {
    const key = `${item.mediaType}-${item.tmdbId}`;
    if (item.mediaType === "movie") {
      const internalId = movieIdByTmdb.get(item.tmdbId);
      // No movie row in our DB = TMDB sync hasn't happened. Treat as
      // unpredictable rather than zero.
      result.set(key, internalId ? movieEstimates.get(internalId) ?? null : null);
    } else {
      const internalId = showIdByTmdb.get(item.tmdbId);
      result.set(key, internalId ? tvEstimates.get(internalId) ?? null : null);
    }
  }

  return result;
}

/**
 * Compute a 0-100 match score for a collection from a user's perspective.
 * Returns null when fewer than MIN_PREDICTED_ITEMS items in the collection
 * produced a non-null prediction.
 *
 * Math: average of non-null per-item 1-10 predictions, multiplied by 10
 * and rounded. A predicted 8.5/10 → 85% match.
 */
export async function computeCollectionMatchScore(
  userId: string,
  items: CollectionItemRef[]
): Promise<number | null> {
  const predictions = await predictRatingsBatch(userId, items);
  const nonNull: number[] = [];
  for (const v of predictions.values()) {
    if (typeof v === "number") nonNull.push(v);
  }
  if (nonNull.length < MIN_PREDICTED_ITEMS) return null;
  const avg = nonNull.reduce((a, b) => a + b, 0) / nonNull.length;
  return Math.round(avg * 10);
}

export interface CollectionWithItems {
  id: string;
  items: CollectionItemRef[];
}

/**
 * Cache-aware batch fetch of match scores from one user's perspective.
 * Caller passes pre-loaded items so the same fetch can be reused for
 * watched-progress and other per-collection concerns — no double load.
 *
 * Behavior:
 *   1. Read cached rows for (userId, collectionIds) in one query.
 *   2. For misses: predict across the union of all uncached items in one
 *      shared batch (TMDB→internal + movie estimate + TV estimate),
 *      then divide back into per-collection averages.
 *   3. Persist the freshly computed rows (null included).
 *
 * Returns Map<collectionId, score | null>. A null entry is real ("no
 * prediction possible right now") and is cached so subsequent loads
 * skip the recompute.
 */
export async function getOrComputeMatchScoresBatch(
  userId: string,
  collections: CollectionWithItems[]
): Promise<Map<string, number | null>> {
  const result = new Map<string, number | null>();
  if (collections.length === 0) return result;

  const collectionIds = collections.map((c) => c.id);
  const cached = await prisma.collectionMatchCache.findMany({
    where: { userId, collectionId: { in: collectionIds } },
    select: { collectionId: true, score: true },
  });
  const cachedMap = new Map(cached.map((c) => [c.collectionId, c.score]));

  const missing: CollectionWithItems[] = [];
  for (const c of collections) {
    if (cachedMap.has(c.id)) result.set(c.id, cachedMap.get(c.id) ?? null);
    else missing.push(c);
  }

  if (missing.length === 0) return result;

  // Predict across the union of every uncached collection's items so one
  // TMDB→internal resolution + one movie batch + one TV batch covers all.
  const allRefs: CollectionItemRef[] = missing.flatMap((c) => c.items);
  const predictions = await predictRatingsBatch(userId, allRefs);

  const cacheRows: { userId: string; collectionId: string; score: number | null }[] = [];
  for (const c of missing) {
    const nonNull: number[] = [];
    for (const r of c.items) {
      const v = predictions.get(`${r.mediaType}-${r.tmdbId}`);
      if (typeof v === "number") nonNull.push(v);
    }
    let score: number | null;
    if (nonNull.length < MIN_PREDICTED_ITEMS) {
      score = null;
    } else {
      const avg = nonNull.reduce((a, b) => a + b, 0) / nonNull.length;
      score = Math.round(avg * 10);
    }
    result.set(c.id, score);
    cacheRows.push({ userId, collectionId: c.id, score });
  }

  // createMany + skipDuplicates is race-safe: two parallel feed requests
  // both missing the same row → the second insert is a no-op.
  if (cacheRows.length > 0) {
    await prisma.collectionMatchCache.createMany({
      data: cacheRows,
      skipDuplicates: true,
    });
  }

  return result;
}

/**
 * Wipe all cached match scores for a collection. Call on PATCH
 * (item/visibility changes) and on publish/unpublish — anything that
 * could shift the prediction outcome should drop the rows.
 */
export async function invalidateCollectionMatchCache(collectionId: string): Promise<void> {
  await prisma.collectionMatchCache.deleteMany({ where: { collectionId } });
}

/**
 * Wipe all cached match scores for a user. Call from rebuildUserProfile
 * — a profile shift means every previously cached score for that user
 * is potentially stale.
 */
export async function invalidateUserMatchCache(userId: string): Promise<void> {
  await prisma.collectionMatchCache.deleteMany({ where: { userId } });
}
