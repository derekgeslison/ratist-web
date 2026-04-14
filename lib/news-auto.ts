/**
 * Auto-generated news: detects trailers from TMDB.
 *
 * Two sources:
 * 1. Curated lists (popular, upcoming, now playing, top rated)
 * 2. Recently changed titles (catches anticipated movies not yet on lists)
 *
 * Filters: official trailers/teasers only, published within 30 days,
 * not Shorts, not adult, not red band, English or high-popularity foreign.
 */

import { prisma } from "@/lib/prisma";

const API_KEY = process.env.TMDB_API_KEY;
const BASE = "https://api.themoviedb.org/3";

interface TMDBListResult {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  popularity: number;
  release_date?: string;
  first_air_date?: string;
  adult?: boolean;
  original_language?: string;
}

interface VideoResult {
  key: string;
  name: string;
  site: string;
  type: string;
  official: boolean;
  published_at: string;
}

interface PageResult<T> {
  results: T[];
  total_pages: number;
}

async function tmdbGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set("api_key", API_KEY!);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`TMDB ${res.status}: ${path}`);
  return res.json();
}

// ─── Gathering candidate titles ─────────────────────────────────────────────

async function getListIds(): Promise<{ movies: TMDBListResult[]; shows: TMDBListResult[] }> {
  const [pop1, pop2, pop3, up1, up2, np1, np2, topRated, popTV1, popTV2, popTV3, topTV] = await Promise.all([
    tmdbGet<PageResult<TMDBListResult>>("/movie/popular", { page: "1" }),
    tmdbGet<PageResult<TMDBListResult>>("/movie/popular", { page: "2" }),
    tmdbGet<PageResult<TMDBListResult>>("/movie/popular", { page: "3" }),
    tmdbGet<PageResult<TMDBListResult>>("/movie/upcoming", { page: "1" }),
    tmdbGet<PageResult<TMDBListResult>>("/movie/upcoming", { page: "2" }),
    tmdbGet<PageResult<TMDBListResult>>("/movie/now_playing", { page: "1" }),
    tmdbGet<PageResult<TMDBListResult>>("/movie/now_playing", { page: "2" }),
    tmdbGet<PageResult<TMDBListResult>>("/movie/top_rated", { page: "1" }),
    tmdbGet<PageResult<TMDBListResult>>("/tv/popular", { page: "1" }),
    tmdbGet<PageResult<TMDBListResult>>("/tv/popular", { page: "2" }),
    tmdbGet<PageResult<TMDBListResult>>("/tv/popular", { page: "3" }),
    tmdbGet<PageResult<TMDBListResult>>("/tv/top_rated", { page: "1" }),
  ]);

  const movieMap = new Map<number, TMDBListResult>();
  for (const m of [...pop1.results, ...pop2.results, ...pop3.results, ...up1.results, ...up2.results, ...np1.results, ...np2.results, ...topRated.results]) {
    movieMap.set(m.id, m);
  }
  const showMap = new Map<number, TMDBListResult>();
  for (const s of [...popTV1.results, ...popTV2.results, ...popTV3.results, ...topTV.results]) {
    showMap.set(s.id, s);
  }

  return { movies: [...movieMap.values()], shows: [...showMap.values()] };
}

/**
 * Fetch recently changed movie/TV IDs from TMDB changes API,
 * then resolve their details. This catches anticipated titles
 * that aren't on the curated lists yet.
 */
async function getRecentChanges(): Promise<{ movies: TMDBListResult[]; shows: TMDBListResult[] }> {
  const endDate = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [movieChanges, tvChanges] = await Promise.all([
    Promise.all(
      [1, 2, 3, 4, 5].map((page) =>
        tmdbGet<PageResult<{ id: number; adult?: boolean }>>("/movie/changes", { start_date: startDate, end_date: endDate, page: String(page) })
          .catch(() => ({ results: [], total_pages: 0 }))
      )
    ),
    Promise.all(
      [1, 2, 3].map((page) =>
        tmdbGet<PageResult<{ id: number; adult?: boolean }>>("/tv/changes", { start_date: startDate, end_date: endDate, page: String(page) })
          .catch(() => ({ results: [], total_pages: 0 }))
      )
    ),
  ]);

  const movieIds = [...new Set(movieChanges.flatMap((p) => p.results.filter((r) => !r.adult).map((r) => r.id)))];
  const tvIds = [...new Set(tvChanges.flatMap((p) => p.results.filter((r) => !r.adult).map((r) => r.id)))];

  // Fetch details for changed titles (batch, skip ones that fail)
  const movies: TMDBListResult[] = [];
  for (const id of movieIds) {
    try {
      const m = await tmdbGet<TMDBListResult>(`/movie/${id}`);
      movies.push(m);
    } catch { /* skip */ }
  }

  const shows: TMDBListResult[] = [];
  for (const id of tvIds) {
    try {
      const s = await tmdbGet<TMDBListResult>(`/tv/${id}`);
      shows.push(s);
    } catch { /* skip */ }
  }

  return { movies, shows };
}

// ─── Trailer detection ──────────────────────────────────────────────────────

const SKIP_PATTERNS = /\b(short|reel|clip|now streaming|now on|available now|out now|in theaters|watch now|red band|restricted|uncensored|unrated|18\+|nsfw)\b/i;

// English titles need modest popularity; foreign titles need high popularity
const MIN_POP_EN = 5;
const MIN_POP_FOREIGN = 100;
const ENGLISH_LANGS = new Set(["en"]);

async function isYouTubeShort(key: string): Promise<boolean> {
  try {
    const res = await fetch(`https://www.youtube.com/shorts/${key}`, { redirect: "manual" });
    return res.status === 200;
  } catch {
    return false;
  }
}

async function getBestTrailer(
  mediaType: "movie" | "tv",
  tmdbId: number,
  cutoff: Date,
): Promise<VideoResult | null> {
  try {
    const data = await tmdbGet<{ results: VideoResult[] }>(`/${mediaType}/${tmdbId}/videos`);
    const candidates = data.results.filter(
      (v) => v.site === "YouTube"
        && (v.type === "Trailer" || v.type === "Teaser")
        && v.official
        && new Date(v.published_at) > cutoff
        && !SKIP_PATTERNS.test(v.name)
    );
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => {
      if (a.type !== b.type) return a.type === "Trailer" ? -1 : 1;
      return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
    });
    for (const candidate of candidates.slice(0, 3)) {
      if (!(await isYouTubeShort(candidate.key))) return candidate;
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

function shouldInclude(item: TMDBListResult, recentReleaseLimit: Date): boolean {
  if (item.adult) return false;

  const popThreshold = ENGLISH_LANGS.has(item.original_language ?? "") ? MIN_POP_EN : MIN_POP_FOREIGN;
  if (item.popularity < popThreshold) return false;

  // For movies with a release date: skip if released more than 2 weeks ago
  const dateStr = item.release_date ?? item.first_air_date;
  if (dateStr) {
    const releaseDate = new Date(dateStr);
    if (releaseDate < recentReleaseLimit) return false;
  }

  return true;
}

async function processTitle(
  mediaType: "movie" | "tv",
  item: TMDBListResult,
  cutoff: Date,
): Promise<{ created: boolean; error?: string }> {
  try {
    const trailer = await getBestTrailer(mediaType, item.id, cutoff);
    if (!trailer) return { created: false };

    const key = `trailer:${mediaType}:${item.id}:${trailer.key}`;
    const existing = await prisma.newsItem.findUnique({ where: { externalKey: key } });
    if (existing) return { created: false };

    const name = mediaType === "movie" ? item.title : item.name;
    const label = trailer.type === "Teaser" ? "Official Teaser" : "Official Trailer";

    await prisma.newsItem.create({
      data: {
        type: "TRAILER",
        title: `${name} — ${label}`,
        excerpt: `Watch the ${label.toLowerCase()} for ${name}.`,
        published: true,
        publishedAt: new Date(trailer.published_at),
        ...(mediaType === "movie" ? { movieTmdbId: item.id } : { showTmdbId: item.id }),
        posterPath: item.poster_path,
        youtubeKey: trailer.key,
        sourceName: "YouTube",
        sourceUrl: `https://www.youtube.com/watch?v=${trailer.key}`,
        externalKey: key,
      },
    });
    return { created: true };
  } catch (err) {
    return { created: false, error: `${mediaType}:${item.id}: ${err instanceof Error ? err.message : "unknown"}` };
  }
}

export async function fetchNewTrailers(): Promise<{ created: number; checked: number; errors: string[] }> {
  if (!API_KEY) return { created: 0, checked: 0, errors: ["TMDB_API_KEY not configured"] };

  const errors: string[] = [];
  let created = 0;
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentReleaseLimit = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  // Gather candidates from both sources
  const [listData, changesData] = await Promise.all([
    getListIds(),
    getRecentChanges().catch(() => ({ movies: [], shows: [] })),
  ]);

  // Merge and deduplicate
  const movieMap = new Map<number, TMDBListResult>();
  for (const m of [...listData.movies, ...changesData.movies]) movieMap.set(m.id, m);
  const showMap = new Map<number, TMDBListResult>();
  for (const s of [...listData.shows, ...changesData.shows]) showMap.set(s.id, s);

  const movies = [...movieMap.values()].filter((m) => shouldInclude(m, recentReleaseLimit));
  const shows = [...showMap.values()].filter((s) => shouldInclude(s, recentReleaseLimit));
  const checked = movies.length + shows.length;

  for (const movie of movies) {
    const result = await processTitle("movie", movie, cutoff);
    if (result.created) created++;
    if (result.error) errors.push(result.error);
  }

  for (const show of shows) {
    const result = await processTitle("tv", show, cutoff);
    if (result.created) created++;
    if (result.error) errors.push(result.error);
  }

  return { created, checked, errors };
}
