import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getWatchProviders, getShowWatchProviders } from "@/lib/tmdb";

export const dynamic = "force-dynamic";

const STALE_DAYS = 7;

interface ProviderInfo { name: string; logo: string }
interface ProviderData { flatrate: ProviderInfo[]; rent: ProviderInfo[] }

// POST: fetch/cache providers for a batch of movies/shows
// Body: { items: [{ tmdbId: number, mediaType: "movie" | "tv" }] }
export async function POST(req: NextRequest) {
  try {
    const { items } = await req.json();
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ providers: {} });
    }

    // Limit batch size
    const batch = items.slice(0, 30);
    const staleThreshold = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);

    const movieIds = batch.filter((i: { mediaType: string }) => i.mediaType === "movie").map((i: { tmdbId: number }) => i.tmdbId);
    const showIds = batch.filter((i: { mediaType: string }) => i.mediaType === "tv").map((i: { tmdbId: number }) => i.tmdbId);

    // Check DB cache first
    const [cachedMovies, cachedShows] = await Promise.all([
      movieIds.length > 0 ? prisma.movie.findMany({
        where: { tmdbId: { in: movieIds }, watchProviders: { not: Prisma.JsonNullValueFilter.JsonNull }, providersUpdatedAt: { gte: staleThreshold } },
        select: { tmdbId: true, watchProviders: true },
      }) : [],
      showIds.length > 0 ? prisma.tVShow.findMany({
        where: { tmdbId: { in: showIds }, watchProviders: { not: Prisma.JsonNullValueFilter.JsonNull }, providersUpdatedAt: { gte: staleThreshold } },
        select: { tmdbId: true, watchProviders: true },
      }) : [],
    ]);

    const result: Record<string, ProviderData> = {};

    // Add cached results
    for (const m of cachedMovies) {
      result[`movie-${m.tmdbId}`] = m.watchProviders as unknown as ProviderData;
    }
    for (const s of cachedShows) {
      result[`tv-${s.tmdbId}`] = s.watchProviders as unknown as ProviderData;
    }

    // Find uncached items
    const cachedMovieIds = new Set(cachedMovies.map((m) => m.tmdbId));
    const cachedShowIds = new Set(cachedShows.map((s) => s.tmdbId));
    const uncachedMovies = movieIds.filter((id) => !cachedMovieIds.has(id));
    const uncachedShows = showIds.filter((id) => !cachedShowIds.has(id));

    // Fetch from TMDB and cache
    const fetchAndCache = async (tmdbId: number, mediaType: "movie" | "tv") => {
      try {
        const raw = mediaType === "tv"
          ? await getShowWatchProviders(tmdbId)
          : await getWatchProviders(tmdbId);

        const data: ProviderData = {
          flatrate: (raw?.flatrate ?? []).map((p: { provider_id: number; provider_name: string; logo_path: string }) => ({ name: p.provider_name, logo: p.logo_path, providerId: p.provider_id })).slice(0, 5),
          rent: (raw?.rent ?? []).map((p: { provider_id: number; provider_name: string; logo_path: string }) => ({ name: p.provider_name, logo: p.logo_path, providerId: p.provider_id })).slice(0, 3),
        };

        // Cache to DB (fire and forget)
        if (mediaType === "movie") {
          prisma.movie.updateMany({ where: { tmdbId }, data: { watchProviders: data as never, providersUpdatedAt: new Date() } }).catch(() => {});
        } else {
          prisma.tVShow.updateMany({ where: { tmdbId }, data: { watchProviders: data as never, providersUpdatedAt: new Date() } }).catch(() => {});
        }

        result[`${mediaType}-${tmdbId}`] = data;
      } catch { /* skip */ }
    };

    // Batch TMDB calls in groups of 5
    const uncached = [
      ...uncachedMovies.map((id) => ({ id, type: "movie" as const })),
      ...uncachedShows.map((id) => ({ id, type: "tv" as const })),
    ];

    for (let i = 0; i < uncached.length; i += 5) {
      await Promise.all(
        uncached.slice(i, i + 5).map((item) => fetchAndCache(item.id, item.type))
      );
    }

    return NextResponse.json({ providers: result });
  } catch (err) {
    console.error("Provider fetch error:", err);
    return NextResponse.json({ providers: {} });
  }
}
