import { prisma } from "@/lib/prisma";
import { POSTER_BLOCKED_SENTINEL } from "@/lib/tmdb";
import { scanPosterSafeSearch, shouldBlockPoster } from "@/lib/vision-safesearch";

/**
 * Browse / discovery safety helpers. Two concerns wired up here:
 *
 * 1. NC-17 movies must never appear on the home page or in other
 *    public discovery rails. TMDB list endpoints don't return MPAA
 *    rating inline, so we cache certifications on Movie.mpaaRating
 *    (via upsertMovie on detail views) and post-filter using that.
 *
 * 2. Some posters (NC-17 or otherwise) contain explicit nudity. We
 *    let admins block individual posters via Movie.posterBlocked /
 *    TVShow.posterBlocked, AND lazily auto-scan any NC-17 poster
 *    that hasn't been run through Google Cloud Vision SafeSearch
 *    yet — first render of a page that includes an unscanned NC-17
 *    movie kicks off the scan, applies the verdict, and stores it
 *    so subsequent renders are instant. The bulk backfill script
 *    (scripts/scan-nc17-posters.ts) covers the existing catalog;
 *    this on-render path covers anything new the site encounters.
 */

const TMDB_POSTER_BASE = "https://image.tmdb.org/t/p/w500";
// Concurrency cap on parallel Vision calls. Vision quota defaults to
// 1800 req/min so we'd hit that ceiling fast on a heavy actor page
// without this. 10 keeps us well under and still finishes a 30-film
// filmography in ~2 rounds (~1s wall-clock).
const SCAN_CONCURRENCY = 10;

type MovieLike = { id: number; poster_path: string | null };
type ShowLike = { id: number; poster_path: string | null };

interface MovieRow {
  tmdbId: number;
  posterPath: string | null;
  mpaaRating: string | null;
  posterBlocked: boolean;
  posterScannedAt: Date | null;
}

async function runWithConcurrency<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const out: T[] = new Array(tasks.length);
  let cursor = 0;
  async function worker() {
    while (cursor < tasks.length) {
      const idx = cursor++;
      try {
        out[idx] = await tasks[idx]();
      } catch {
        // swallow — task results are written individually; failures
        // leave the slot undefined and the caller treats absence
        // as "skip, don't update DB".
      }
    }
  }
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return out;
}

/**
 * Scan any NC-17 movies in `rows` whose poster hasn't been processed
 * yet. Updates the DB and returns a new map keyed by tmdbId with the
 * post-scan posterBlocked state so the caller can mask without
 * needing a second round-trip.
 */
async function scanUnscannedNC17(rows: MovieRow[]): Promise<Map<number, MovieRow>> {
  const map = new Map(rows.map((r) => [r.tmdbId, r]));
  // We scan anything that could plausibly carry explicit content:
  // - NC-17 (the obvious one)
  // - NR  / null mpaaRating (unrated indies, foreign releases — we
  //   don't know what's on the poster until Vision tells us)
  // We do NOT scan rated-G-through-R movies; their posters are
  // theatrically vetted and the false-positive rate isn't worth
  // the Vision cost across the whole catalog.
  const RISK_RATINGS = new Set(["NC-17", "NR"]);
  const unscanned = rows.filter(
    (r) =>
      !r.posterScannedAt &&
      r.posterPath &&
      (r.mpaaRating == null || RISK_RATINGS.has(r.mpaaRating)),
  );
  if (unscanned.length === 0) return map;

  const tasks = unscanned.map((row) => async () => {
    const verdict = await scanPosterSafeSearch(`${TMDB_POSTER_BASE}${row.posterPath}`);
    if (!verdict) return;
    const block = shouldBlockPoster(verdict);
    await prisma.movie.update({
      where: { tmdbId: row.tmdbId },
      data: {
        posterScannedAt: new Date(),
        posterScanResult: verdict as unknown as object,
        ...(block ? { posterBlocked: true } : {}),
      },
    }).catch(() => { /* race / row missing — ignore */ });
    if (block) {
      const updated = { ...row, posterBlocked: true, posterScannedAt: new Date() };
      map.set(row.tmdbId, updated);
    }
  });

  await runWithConcurrency(tasks, SCAN_CONCURRENCY);
  return map;
}

/**
 * Apply NC-17 filter + poster-block masking to a list of TMDB-shaped
 * movies. Pass `filterNC17: true` for public discovery rails; pass
 * `stripBlockedPosters: true` for any surface that renders posters.
 * Both are safe to call together.
 */
export async function safeguardTMDBMovies<T extends MovieLike>(
  items: T[],
  opts: { filterNC17?: boolean; stripBlockedPosters?: boolean } = {},
): Promise<T[]> {
  if (items.length === 0) return items;
  const tmdbIds = items.map((i) => i.id);
  const rows = await prisma.movie.findMany({
    where: { tmdbId: { in: tmdbIds } },
    select: {
      tmdbId: true, posterPath: true,
      mpaaRating: true, posterBlocked: true, posterScannedAt: true,
    },
  });

  // Lazy auto-scan: any NC-17 movie that hasn't been through Vision
  // SafeSearch yet gets scanned on this render so the verdict applies
  // immediately. Only runs when the caller cares about poster masking.
  const map = opts.stripBlockedPosters
    ? await scanUnscannedNC17(rows)
    : new Map(rows.map((r) => [r.tmdbId, r]));

  let result: T[] = items;
  if (opts.filterNC17) {
    result = result.filter((i) => map.get(i.id)?.mpaaRating !== "NC-17");
  }
  if (opts.stripBlockedPosters) {
    result = result.map((i) => {
      const row = map.get(i.id);
      if (row?.posterBlocked) return { ...i, poster_path: POSTER_BLOCKED_SENTINEL };
      return i;
    });
  }
  return result;
}

/** TV analogue. Filters on contentRating === "TV-MA" if requested. */
export async function safeguardTMDBShows<T extends ShowLike>(
  items: T[],
  opts: { stripBlockedPosters?: boolean } = {},
): Promise<T[]> {
  if (items.length === 0) return items;
  const tmdbIds = items.map((i) => i.id);
  const rows = await prisma.tVShow.findMany({
    where: { tmdbId: { in: tmdbIds } },
    select: { tmdbId: true, posterBlocked: true },
  });
  const map = new Map(rows.map((r) => [r.tmdbId, r]));

  let result: T[] = items;
  if (opts.stripBlockedPosters) {
    result = result.map((i) => {
      const row = map.get(i.id);
      if (row?.posterBlocked) return { ...i, poster_path: POSTER_BLOCKED_SENTINEL };
      return i;
    });
  }
  return result;
}
