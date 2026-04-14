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
  const [pop1, pop2, upcoming, nowPlaying, popTV1, popTV2] = await Promise.all([
    tmdbGet<PageResult<TMDBListResult>>("/movie/popular", { page: "1" }),
    tmdbGet<PageResult<TMDBListResult>>("/movie/popular", { page: "2" }),
    tmdbGet<PageResult<TMDBListResult>>("/movie/upcoming"),
    tmdbGet<PageResult<TMDBListResult>>("/movie/now_playing"),
    tmdbGet<PageResult<TMDBListResult>>("/tv/popular", { page: "1" }),
    tmdbGet<PageResult<TMDBListResult>>("/tv/popular", { page: "2" }),
  ]);

  // Deduplicate by ID
  const movieMap = new Map<number, TMDBListResult>();
  for (const m of [...pop1.results, ...pop2.results, ...upcoming.results, ...nowPlaying.results]) {
    movieMap.set(m.id, m);
  }
  const showMap = new Map<number, TMDBListResult>();
  for (const s of [...popTV1.results, ...popTV2.results]) {
    showMap.set(s.id, s);
  }

  return {
    movies: [...movieMap.values()],
    shows: [...showMap.values()],
  };
}

/**
 * For a title, find the best official YouTube trailer.
 * No date filtering — we rely on externalKey dedup instead.
 */
async function getBestTrailer(
  mediaType: "movie" | "tv",
  tmdbId: number,
): Promise<VideoResult | null> {
  try {
    const data = await tmdbGet<{ results: VideoResult[] }>(`/${mediaType}/${tmdbId}/videos`);
    const trailers = data.results.filter(
      (v) => v.site === "YouTube" && v.type === "Trailer" && v.official
    );
    if (trailers.length === 0) return null;
    // Pick the most recently published trailer
    trailers.sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());
    return trailers[0];
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

  const { movies, shows } = await getRelevantIds();
  const checked = movies.length + shows.length;

  // Process movies
  for (const movie of movies) {
    try {
      const trailer = await getBestTrailer("movie", movie.id);
      if (!trailer) continue;

      const key = `trailer:movie:${movie.id}:${trailer.key}`;
      const existing = await prisma.newsItem.findUnique({ where: { externalKey: key } });
      if (existing) continue;

      await prisma.newsItem.create({
        data: {
          type: "TRAILER",
          title: `${movie.title} — Official Trailer`,
          excerpt: `Watch the official trailer for ${movie.title}.`,
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
      const trailer = await getBestTrailer("tv", show.id);
      if (!trailer) continue;

      const key = `trailer:tv:${show.id}:${trailer.key}`;
      const existing = await prisma.newsItem.findUnique({ where: { externalKey: key } });
      if (existing) continue;

      await prisma.newsItem.create({
        data: {
          type: "TRAILER",
          title: `${show.name} — Official Trailer`,
          excerpt: `Watch the official trailer for ${show.name}.`,
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
