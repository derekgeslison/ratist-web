/**
 * Auto-generated news: detects trailers from popular/upcoming titles on TMDB.
 *
 * Scans popular movies, upcoming movies, and popular TV shows for official
 * YouTube trailers. Uses externalKey dedup to only create new items —
 * safe to run repeatedly.
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

async function tmdbGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set("api_key", API_KEY!);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`TMDB ${res.status}: ${path}`);
  return res.json();
}

interface PageResult<T> {
  results: T[];
  total_pages: number;
}

/**
 * Gather IDs from popular, upcoming, and now-playing lists.
 * These are the titles users actually care about.
 */
async function getRelevantIds(): Promise<{ movies: TMDBListResult[]; shows: TMDBListResult[] }> {
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

  // Deduplicate by ID
  const movieMap = new Map<number, TMDBListResult>();
  for (const m of [...pop1.results, ...pop2.results, ...pop3.results, ...up1.results, ...up2.results, ...np1.results, ...np2.results, ...topRated.results]) {
    movieMap.set(m.id, m);
  }
  const showMap = new Map<number, TMDBListResult>();
  for (const s of [...popTV1.results, ...popTV2.results, ...popTV3.results, ...topTV.results]) {
    showMap.set(s.id, s);
  }

  return {
    movies: [...movieMap.values()],
    shows: [...showMap.values()],
  };
}

// Video names that indicate YouTube Shorts, clips, re-uploads, or age-restricted content
const SKIP_PATTERNS = /\b(short|reel|clip|now streaming|now on|available now|out now|in theaters|watch now|red band|restricted|uncensored|unrated|18\+|nsfw)\b/i;

// Minimum popularity to filter out obscure titles
const MIN_POPULARITY = 20;
// Non-English titles need much higher popularity to be included (e.g. Parasite, Squid Game)
const MIN_POPULARITY_FOREIGN = 150;
// Languages considered "English market" (won't require the higher threshold)
const ENGLISH_MARKET_LANGS = new Set(["en"]);

/** Check if a YouTube video is a Short (vertical, < 60s). */
async function isYouTubeShort(key: string): Promise<boolean> {
  try {
    const res = await fetch(`https://www.youtube.com/shorts/${key}`, { redirect: "manual" });
    return res.status === 200; // Shorts return 200, regular videos redirect to /watch
  } catch {
    return false;
  }
}

/**
 * For a title, find the best official YouTube trailer.
 * Only returns trailers published within the last 30 days.
 * Skips Shorts, re-uploads, and restricted content.
 */
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
    // Prefer full trailers over teasers, then most recent
    candidates.sort((a, b) => {
      if (a.type !== b.type) return a.type === "Trailer" ? -1 : 1;
      return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
    });
    // Check top candidates until we find one that isn't a Short
    for (const candidate of candidates.slice(0, 3)) {
      if (!(await isYouTubeShort(candidate.key))) return candidate;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Main function: scan popular/upcoming titles for trailers and create
 * NewsItem records for any we haven't seen before.
 */
export async function fetchNewTrailers(): Promise<{ created: number; checked: number; errors: string[] }> {
  if (!API_KEY) return { created: 0, checked: 0, errors: ["TMDB_API_KEY not configured"] };

  const errors: string[] = [];
  let created = 0;
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days
  const now = new Date();
  // Only include titles that haven't released yet or released within the last 2 weeks
  const recentReleaseLimit = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const { movies, shows } = await getRelevantIds();
  const checked = movies.length + shows.length;

  // Process movies
  for (const movie of movies) {
    try {
      // Skip adult content, low-popularity, non-English obscure, and old releases
      if (movie.adult) continue;
      const popThreshold = ENGLISH_MARKET_LANGS.has(movie.original_language ?? "") ? MIN_POPULARITY : MIN_POPULARITY_FOREIGN;
      if (movie.popularity < popThreshold) continue;
      if (movie.release_date) {
        const releaseDate = new Date(movie.release_date);
        if (releaseDate < recentReleaseLimit) continue;
      }

      const trailer = await getBestTrailer("movie", movie.id, cutoff);
      if (!trailer) continue;

      const key = `trailer:movie:${movie.id}:${trailer.key}`;
      const existing = await prisma.newsItem.findUnique({ where: { externalKey: key } });
      if (existing) continue;

      const label = trailer.type === "Teaser" ? "Official Teaser" : "Official Trailer";
      await prisma.newsItem.create({
        data: {
          type: "TRAILER",
          title: `${movie.title} — ${label}`,
          excerpt: `Watch the ${label.toLowerCase()} for ${movie.title}.`,
          published: true,
          publishedAt: new Date(trailer.published_at),
          movieTmdbId: movie.id,
          posterPath: movie.poster_path,
          youtubeKey: trailer.key,
          sourceName: "YouTube",
          sourceUrl: `https://www.youtube.com/watch?v=${trailer.key}`,
          externalKey: key,
        },
      });
      created++;
    } catch (err) {
      errors.push(`movie:${movie.id}: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  // Process TV shows
  for (const show of shows) {
    try {
      // Skip adult content, low-popularity, non-English obscure, and old shows
      if (show.adult) continue;
      const showPopThreshold = ENGLISH_MARKET_LANGS.has(show.original_language ?? "") ? MIN_POPULARITY : MIN_POPULARITY_FOREIGN;
      if (show.popularity < showPopThreshold) continue;
      if (show.first_air_date) {
        const airDate = new Date(show.first_air_date);
        if (airDate < recentReleaseLimit) continue;
      }

      const trailer = await getBestTrailer("tv", show.id, cutoff);
      if (!trailer) continue;

      const key = `trailer:tv:${show.id}:${trailer.key}`;
      const existing = await prisma.newsItem.findUnique({ where: { externalKey: key } });
      if (existing) continue;

      const tvLabel = trailer.type === "Teaser" ? "Official Teaser" : "Official Trailer";
      await prisma.newsItem.create({
        data: {
          type: "TRAILER",
          title: `${show.name} — ${tvLabel}`,
          excerpt: `Watch the ${tvLabel.toLowerCase()} for ${show.name}.`,
          published: true,
          publishedAt: new Date(trailer.published_at),
          showTmdbId: show.id,
          posterPath: show.poster_path,
          youtubeKey: trailer.key,
          sourceName: "YouTube",
          sourceUrl: `https://www.youtube.com/watch?v=${trailer.key}`,
          externalKey: key,
        },
      });
      created++;
    } catch (err) {
      errors.push(`tv:${show.id}: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  return { created, checked, errors };
}
