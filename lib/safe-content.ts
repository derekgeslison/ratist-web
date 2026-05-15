import { prisma } from "@/lib/prisma";
import { POSTER_BLOCKED_SENTINEL } from "@/lib/tmdb";
import { scanPosterSafeSearch, shouldBlockPoster } from "@/lib/vision-safesearch";
import { batchAdultKeywordCheck } from "@/lib/adult-detection";

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
  isAdult: boolean;
  adultKeywordsCheckedAt: Date | null;
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
 * `stripBlockedPosters: true` for any surface that renders posters;
 * pass `adultKeywordCheck: true` on popular / discovery rails where
 * we want to catch softcore / erotic films that TMDB never flagged
 * `adult: true`. All are safe to combine.
 */
export async function safeguardTMDBMovies<T extends MovieLike>(
  items: T[],
  opts: { filterNC17?: boolean; stripBlockedPosters?: boolean; adultKeywordCheck?: boolean } = {},
): Promise<T[]> {
  if (items.length === 0) return items;
  const tmdbIds = items.map((i) => i.id);
  let rows = await prisma.movie.findMany({
    where: { tmdbId: { in: tmdbIds } },
    select: {
      tmdbId: true, posterPath: true,
      mpaaRating: true, posterBlocked: true, posterScannedAt: true,
      isAdult: true, adultKeywordsCheckedAt: true,
    },
  });

  // Adult-keyword auto-detect pass for popular / discovery surfaces.
  // Runs ONLY when the caller opts in via `adultKeywordCheck: true`.
  // For any TMDB id that's either missing a Movie row or has
  // never been keyword-checked, we fetch /movie/{id}/keywords
  // concurrently, flag matches as isAdult, and stamp
  // adultKeywordsCheckedAt so subsequent renders skip the round-trip.
  // First-render hits pay the TMDB-keyword fetch latency; once the
  // verdict is cached, future popular-rail renders are zero-cost.
  if (opts.adultKeywordCheck) {
    const checkedIds = new Set(
      rows.filter((r) => r.adultKeywordsCheckedAt != null).map((r) => r.tmdbId),
    );
    const adultIds = new Set(rows.filter((r) => r.isAdult).map((r) => r.tmdbId));
    const needCheck = tmdbIds.filter((id) => !checkedIds.has(id) && !adultIds.has(id));
    if (needCheck.length > 0) {
      try {
        const newAdult = await batchAdultKeywordCheck(needCheck);
        if (newAdult.size > 0) {
          // Pull the updated rows so the existing isAdult-driven filter
          // below sees them. We avoid a second findMany when nothing
          // matched — the common case on cold-encounter rails.
          rows = await prisma.movie.findMany({
            where: { tmdbId: { in: tmdbIds } },
            select: {
              tmdbId: true, posterPath: true,
              mpaaRating: true, posterBlocked: true, posterScannedAt: true,
              isAdult: true, adultKeywordsCheckedAt: true,
            },
          });
        }
      } catch {
        // Keyword check is best-effort; never let it crash the render.
      }
    }
  }

  // Lazy auto-scan: any NC-17 movie that hasn't been through Vision
  // SafeSearch yet gets scanned on this render so the verdict applies
  // immediately. Only runs when the caller cares about poster masking.
  const map = opts.stripBlockedPosters
    ? await scanUnscannedNC17(rows)
    : new Map(rows.map((r) => [r.tmdbId, r]));

  let result: T[] = items;
  // Always-on hide rule: TMDB.adult === true → vanish entirely.
  // TMDB reserves the adult flag for commercial porn-industry
  // releases regardless of how they got rated (or didn't), so the
  // mpaaRating dimension was redundant — mainstream NC-17 films
  // (Clockwork Orange, Showgirls, etc.) carry adult: false anyway.
  result = result.filter((i) => !map.get(i.id)?.isAdult);
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

/**
 * Mask posterPath strings on items already pulled from our DB. The
 * caller's query just needs to also select `posterBlocked` per row;
 * this helper then swaps the posterPath for the rendering sentinel
 * on blocked rows. Cheaper than safeguardTMDBMovies because there's
 * no extra DB round-trip.
 *
 * Use this for our DB-backed list surfaces — watchlist, /seen,
 * /ratings, community feeds, custom collections, movie-club, etc.
 * Any place where the caller queries `Movie` directly and forwards
 * posterPath to the renderer.
 */
export function maskBlockedPosterPaths<T extends { posterPath: string | null; posterBlocked?: boolean }>(items: T[]): T[] {
  return items.map((i) => i.posterBlocked ? { ...i, posterPath: POSTER_BLOCKED_SENTINEL } : i);
}

/**
 * Recursively walk an API response payload and mask `posterPath` /
 * `poster_path` on any nested object whose `tmdbId` matches a
 * currently-blocked movie or TV show. Used for feed-shaped routes
 * (/api/feed/for-you, /api/community/*, /api/feed/following, …)
 * that return arbitrarily-nested structures with many movie/show
 * references. ONE wrapping call per route — the walker collects
 * tmdbIds, does a single union DB lookup for both tables, and
 * stamps the rendering sentinel on every reference to a blocked
 * title. No-ops fast when no tmdbIds are present in the payload.
 */
export async function maskBlockedInResponse<T>(payload: T): Promise<T> {
  const tmdbIds = new Set<number>();
  function collect(o: unknown): void {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) { o.forEach(collect); return; }
    const r = o as Record<string, unknown>;
    if (typeof r.tmdbId === "number") tmdbIds.add(r.tmdbId);
    // TMDB-shape feeds sometimes use `id` for the movie/show id
    // directly. Limit that to objects that also carry a poster path
    // so we don't accidentally collect unrelated `id` fields (user
    // ids, comment ids, etc.).
    if (typeof r.id === "number" && (typeof r.poster_path === "string" || typeof r.posterPath === "string" || r.poster_path === null || r.posterPath === null)) {
      tmdbIds.add(r.id);
    }
    for (const v of Object.values(r)) collect(v);
  }
  collect(payload);
  if (tmdbIds.size === 0) return payload;

  const ids = [...tmdbIds];
  const [movieRows, blockedShows] = await Promise.all([
    prisma.movie.findMany({
      where: { tmdbId: { in: ids } },
      select: { tmdbId: true, posterBlocked: true, isAdult: true, mpaaRating: true },
    }),
    prisma.tVShow.findMany({ where: { tmdbId: { in: ids }, posterBlocked: true }, select: { tmdbId: true } }),
  ]);

  // Hide-entirely set: any TMDB-adult-flagged movie vanishes from
  // every discovery / list / feed surface. mpaaRating doesn't add
  // safety here — TMDB only marks commercial porn-industry titles
  // adult, regardless of MPAA rating.
  const hidden = new Set<number>();
  // Poster-mask set: anything currently flagged blocked but not in
  // the hide-entirely set (mainstream NC-17 with explicit posters,
  // admin-flagged titles, etc.).
  const blocked = new Set<number>();
  for (const m of movieRows) {
    if (m.isAdult) hidden.add(m.tmdbId);
    else if (m.posterBlocked) blocked.add(m.tmdbId);
  }
  for (const s of blockedShows) blocked.add(s.tmdbId);
  if (hidden.size === 0 && blocked.size === 0) return payload;

  function extractId(out: Record<string, unknown>): number | null {
    if (typeof out.tmdbId === "number") return out.tmdbId;
    if (typeof out.id === "number" && (typeof out.poster_path === "string" || typeof out.posterPath === "string" || out.poster_path === null || out.posterPath === null)) {
      return out.id;
    }
    return null;
  }

  function process(o: unknown): unknown {
    if (!o || typeof o !== "object") return o;
    // Preserve Date objects intact. Without this, the for-of below
    // iterates Object.entries(date) — which returns [] because Date
    // has no enumerable own properties — and we rebuild the field as
    // {} instead of the Date. Then NextResponse.json serializes {}
    // as an empty object, the client sees `watchedDate: {}` instead
    // of an ISO string, and parsing falls over. Caused every dated
    // diary entry on /seen to render as undated for any user whose
    // payload triggered a non-no-op mask pass.
    if (o instanceof Date) return o;
    if (Array.isArray(o)) {
      // Filter out hide-entirely items at the array level, then recurse.
      return o
        .filter((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return true;
          const id = extractId(item as Record<string, unknown>);
          return id === null || !hidden.has(id);
        })
        .map(process);
    }
    const r = o as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) out[k] = process(v);
    const id = extractId(out);
    if (id !== null && blocked.has(id)) {
      if (typeof out.posterPath === "string") out.posterPath = POSTER_BLOCKED_SENTINEL;
      if (typeof out.poster_path === "string") out.poster_path = POSTER_BLOCKED_SENTINEL;
    }
    return out;
  }
  return process(payload) as T;
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
