/**
 * Auto-generated news: detects new trailers from TMDB.
 *
 * Uses TMDB /movie/changes and /tv/changes endpoints to find titles
 * with recently added videos, then checks for official trailers.
 */

import { prisma } from "@/lib/prisma";

const API_KEY = process.env.TMDB_API_KEY;
const BASE = "https://api.themoviedb.org/3";

interface ChangeResult {
  id: number;
  adult?: boolean;
}

interface VideoResult {
  key: string;
  name: string;
  site: string;
  type: string;
  official: boolean;
  published_at: string;
}

interface TitleInfo {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  popularity: number;
}

async function tmdbGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set("api_key", API_KEY!);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`TMDB ${res.status}: ${path}`);
  return res.json();
}

/**
 * Fetch titles that had video changes in the last `hours` hours.
 * Returns TMDB IDs (may include non-trailer changes — we filter later).
 */
async function getChangedIds(mediaType: "movie" | "tv", hours = 24): Promise<number[]> {
  const endDate = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString().slice(0, 10);

  const ids: number[] = [];
  // Fetch up to 3 pages of changes (60 items per page)
  for (let page = 1; page <= 3; page++) {
    const data = await tmdbGet<{ results: ChangeResult[]; total_pages: number }>(
      `/${mediaType}/changes`,
      { start_date: startDate, end_date: endDate, page: String(page) }
    );
    for (const item of data.results) {
      if (!item.adult) ids.push(item.id);
    }
    if (page >= data.total_pages) break;
  }
  return ids;
}

/**
 * For a given title, fetch videos and find official YouTube trailers
 * that were published recently.
 */
async function findNewTrailers(
  mediaType: "movie" | "tv",
  tmdbId: number,
  cutoffDate: Date,
): Promise<{ video: VideoResult; info: TitleInfo } | null> {
  try {
    const [videosData, info] = await Promise.all([
      tmdbGet<{ results: VideoResult[] }>(`/${mediaType}/${tmdbId}/videos`),
      tmdbGet<TitleInfo>(`/${mediaType}/${tmdbId}`),
    ]);

    // Filter for official YouTube trailers published after cutoff
    const trailers = videosData.results.filter(
      (v) =>
        v.site === "YouTube" &&
        v.type === "Trailer" &&
        v.official &&
        new Date(v.published_at) > cutoffDate
    );

    if (trailers.length === 0) return null;

    // Skip low-popularity titles to avoid noise
    if (info.popularity < 5) return null;

    // Pick the most recently published trailer
    trailers.sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());
    return { video: trailers[0], info };
  } catch {
    return null;
  }
}

/**
 * Main function: detect new trailers and create NewsItem records.
 * Returns count of items created.
 */
export async function fetchNewTrailers(): Promise<{ created: number; checked: number; errors: string[] }> {
  if (!API_KEY) return { created: 0, checked: 0, errors: ["TMDB_API_KEY not configured"] };

  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000); // Look back 48h for trailer publish dates
  const errors: string[] = [];
  let created = 0;

  // Get movie and TV changes in parallel
  const [movieIds, tvIds] = await Promise.all([
    getChangedIds("movie").catch(() => [] as number[]),
    getChangedIds("tv").catch(() => [] as number[]),
  ]);

  const checked = movieIds.length + tvIds.length;

  // Process movies (batch to avoid rate limits)
  for (const tmdbId of movieIds) {
    try {
      const result = await findNewTrailers("movie", tmdbId, cutoff);
      if (!result) continue;

      const key = `trailer:movie:${tmdbId}:${result.video.key}`;
      const existing = await prisma.newsItem.findUnique({ where: { externalKey: key } });
      if (existing) continue;

      const title = `${result.info.title} — Official Trailer`;
      await prisma.newsItem.create({
        data: {
          type: "TRAILER",
          title,
          excerpt: `Watch the official trailer for ${result.info.title}.`,
          published: true,
          publishedAt: new Date(result.video.published_at),
          movieTmdbId: tmdbId,
          posterPath: result.info.poster_path,
          youtubeKey: result.video.key,
          sourceName: "YouTube",
          sourceUrl: `https://www.youtube.com/watch?v=${result.video.key}`,
          externalKey: key,
        },
      });
      created++;
    } catch (err) {
      errors.push(`movie:${tmdbId}: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  // Process TV shows
  for (const tmdbId of tvIds) {
    try {
      const result = await findNewTrailers("tv", tmdbId, cutoff);
      if (!result) continue;

      const key = `trailer:tv:${tmdbId}:${result.video.key}`;
      const existing = await prisma.newsItem.findUnique({ where: { externalKey: key } });
      if (existing) continue;

      const title = `${result.info.name} — Official Trailer`;
      await prisma.newsItem.create({
        data: {
          type: "TRAILER",
          title,
          excerpt: `Watch the official trailer for ${result.info.name}.`,
          published: true,
          publishedAt: new Date(result.video.published_at),
          showTmdbId: tmdbId,
          posterPath: result.info.poster_path,
          youtubeKey: result.video.key,
          sourceName: "YouTube",
          sourceUrl: `https://www.youtube.com/watch?v=${result.video.key}`,
          externalKey: key,
        },
      });
      created++;
    } catch (err) {
      errors.push(`tv:${tmdbId}: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  return { created, checked, errors };
}
