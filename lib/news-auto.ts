/**
 * Auto-generated news: detects trailers from TMDB.
 *
 * Three sources:
 * 1. Curated lists (popular, upcoming, now playing, top rated)
 * 2. Discover API (catches anticipated movies not yet on lists)
 * 3. Trending titles (catches movies/shows with fresh buzz from trailer drops)
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
 * Discover upcoming/recent movies and TV shows via TMDB discover API.
 * Sorted by popularity desc, scans 20 pages (~400 titles each).
 * This catches anticipated titles that aren't on the curated lists.
 */
async function getDiscoverTitles(): Promise<{ movies: TMDBListResult[]; shows: TMDBListResult[] }> {
  const today = new Date().toISOString().slice(0, 10);
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const twoYearsOut = new Date(Date.now() + 730 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Discover upcoming + recently released movies (sorted by popularity)
  const moviePages = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      tmdbGet<PageResult<TMDBListResult>>("/discover/movie", {
        "primary_release_date.gte": twoWeeksAgo,
        "primary_release_date.lte": twoYearsOut,
        sort_by: "popularity.desc",
        include_adult: "false",
        page: String(i + 1),
      }).catch(() => ({ results: [] as TMDBListResult[], total_pages: 0 }))
    )
  );

  // Discover upcoming + recent TV shows
  const tvPages = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      tmdbGet<PageResult<TMDBListResult>>("/discover/tv", {
        "first_air_date.gte": twoWeeksAgo,
        "first_air_date.lte": twoYearsOut,
        sort_by: "popularity.desc",
        include_adult: "false",
        page: String(i + 1),
      }).catch(() => ({ results: [] as TMDBListResult[], total_pages: 0 }))
    )
  );

  return {
    movies: moviePages.flatMap((p) => p.results),
    shows: tvPages.flatMap((p) => p.results),
  };
}

/**
 * Trending titles (day + week) for both movies and TV shows.
 * Catches titles with fresh buzz (e.g. just dropped a trailer) that may
 * not yet rank high enough in discover or curated lists.
 */
async function getTrendingTitles(): Promise<{ movies: TMDBListResult[]; shows: TMDBListResult[] }> {
  const [movieDay, movieWeek, tvDay, tvWeek] = await Promise.all([
    tmdbGet<PageResult<TMDBListResult>>("/trending/movie/day", { page: "1" }),
    tmdbGet<PageResult<TMDBListResult>>("/trending/movie/week", { page: "1" }),
    tmdbGet<PageResult<TMDBListResult>>("/trending/tv/day", { page: "1" }),
    tmdbGet<PageResult<TMDBListResult>>("/trending/tv/week", { page: "1" }),
  ]);

  const movieMap = new Map<number, TMDBListResult>();
  for (const m of [...movieDay.results, ...movieWeek.results]) movieMap.set(m.id, m);
  const showMap = new Map<number, TMDBListResult>();
  for (const s of [...tvDay.results, ...tvWeek.results]) showMap.set(s.id, s);

  return { movies: [...movieMap.values()], shows: [...showMap.values()] };
}

// ─── Trailer detection ──────────────────────────────────────────────────────

const SKIP_PATTERNS = /\b(short|reel|clip|now streaming|now on|available now|out now|in theaters|watch now|red band|restricted|uncensored|unrated|18\+|nsfw)\b/i;

// English titles: very low threshold (discover API provides relevance sorting)
// Foreign titles: higher threshold to filter obscure content
const MIN_POP_EN = 1;
const MIN_POP_FOREIGN = 50;
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

  // Movies: gate strictly to upcoming-only. Once a film is past its
  // primary release date, fresh teasers/trailers shouldn't be auto-
  // pulled — the marketing window is over and it just clutters the
  // news feed.
  if (item.release_date) {
    const todayISO = new Date().toISOString().slice(0, 10);
    if (item.release_date < todayISO) return false;
  }
  // TV shows: keep the rolling 2-week window on first_air_date. The
  // field reflects series premiere (often years old for ongoing shows),
  // so tighter gating would exclude every season-N trailer.
  else if (item.first_air_date) {
    const airDate = new Date(item.first_air_date);
    if (airDate < recentReleaseLimit) return false;
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

  // Gather candidates from curated lists + discover API + trending
  const [listData, discoverData, trendingData] = await Promise.all([
    getListIds(),
    getDiscoverTitles().catch(() => ({ movies: [], shows: [] })),
    getTrendingTitles().catch(() => ({ movies: [], shows: [] })),
  ]);

  // Merge and deduplicate
  const movieMap = new Map<number, TMDBListResult>();
  for (const m of [...listData.movies, ...discoverData.movies, ...trendingData.movies]) movieMap.set(m.id, m);
  const showMap = new Map<number, TMDBListResult>();
  for (const s of [...listData.shows, ...discoverData.shows, ...trendingData.shows]) showMap.set(s.id, s);

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
