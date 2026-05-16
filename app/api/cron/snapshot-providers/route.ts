import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getPopularMovies,
  getPopularShows,
  getWatchProviders,
  getShowWatchProviders,
  STREAMING_PROVIDERS,
} from "@/lib/tmdb";
import { detectStreamingLaunches } from "@/lib/releases";
import { notifyWatchlistLaunches } from "@/lib/watchlist-streaming-notify";

export const dynamic = "force-dynamic";
// Vercel Pro caps at 300s. We're snapshotting ~3000 items at ~25 in
// parallel, which fits in well under 60s in practice — but TMDB
// occasionally rate-limits so we leave ourselves headroom.
export const maxDuration = 300;

const REGION = "US";
const MOVIE_PAGES = 100; // 100 * 20 = top ~2000 popular movies
const SHOW_PAGES = 50;   // 50 * 20 = top ~1000 popular shows
const PARALLELISM = 25;
// Trim snapshots older than this. The streaming-launches feature only
// needs today + yesterday for diffing; older rows are dead storage.
const RETENTION_DAYS = 14;

const BIG_EIGHT_PROVIDER_IDS = new Set<number>(
  STREAMING_PROVIDERS.map((p) => p.id),
);

/**
 * GET /api/cron/snapshot-providers
 *
 * Daily snapshot of which big-8 streaming providers each top-popular
 * movie and TV show is on, in the US. Powers /releases streaming-
 * launches by diffing today's snapshot vs yesterday's. Items where
 * a provider id is in today's set but not yesterday's are "newly on
 * [provider]" events, surfaced on /releases on the snapshot date.
 *
 * Idempotent — the unique key (tmdbId, mediaType, region, snapshot_date)
 * means a re-run on the same day overwrites nothing it shouldn't.
 *
 * Auth: CRON_SECRET via Bearer header (matches other crons).
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace(/^Bearers+/i, "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  try {
    // --- 1. Build the working set: top-popular movies + shows. ---
    // We pull pages serially because TMDB rate-limits on burst, and
    // the popular-list endpoints are cheap enough that 100 + 50 calls
    // takes only a few seconds anyway.
    const movieTargets: number[] = [];
    for (let p = 1; p <= MOVIE_PAGES; p++) {
      try {
        const page = await getPopularMovies(p);
        for (const m of page.results) movieTargets.push(m.id);
      } catch { /* skip a single failing page */ }
    }
    const showTargets: number[] = [];
    for (let p = 1; p <= SHOW_PAGES; p++) {
      try {
        const page = await getPopularShows(p);
        for (const s of page.results) showTargets.push(s.id);
      } catch { /* skip */ }
    }

    // --- 2. Snapshot providers per item. ---
    // Parallel chunks. We persist as we go (rather than accumulating
    // in-memory then bulk-inserting) so a partial run still leaves
    // useful data behind.
    const stats = {
      movies: { snapshotted: 0, withProviders: 0, errors: 0 },
      shows:  { snapshotted: 0, withProviders: 0, errors: 0 },
    };

    async function snapshotMovie(tmdbId: number) {
      try {
        const result = await getWatchProviders(tmdbId);
        const providerIds = (result?.flatrate ?? [])
          .map((p) => p.provider_id)
          .filter((id) => BIG_EIGHT_PROVIDER_IDS.has(id));
        await prisma.mediaProviderSnapshot.upsert({
          where: {
            tmdbId_mediaType_region_snapshotDate: {
              tmdbId,
              mediaType: "movie",
              region: REGION,
              snapshotDate: today,
            },
          },
          create: {
            tmdbId,
            mediaType: "movie",
            region: REGION,
            snapshotDate: today,
            providerIds,
          },
          update: { providerIds },
        });
        stats.movies.snapshotted++;
        if (providerIds.length > 0) stats.movies.withProviders++;
      } catch {
        stats.movies.errors++;
      }
    }

    async function snapshotShow(tmdbId: number) {
      try {
        const result = await getShowWatchProviders(tmdbId);
        const providerIds = (result?.flatrate ?? [])
          .map((p) => p.provider_id)
          .filter((id) => BIG_EIGHT_PROVIDER_IDS.has(id));
        await prisma.mediaProviderSnapshot.upsert({
          where: {
            tmdbId_mediaType_region_snapshotDate: {
              tmdbId,
              mediaType: "tv",
              region: REGION,
              snapshotDate: today,
            },
          },
          create: {
            tmdbId,
            mediaType: "tv",
            region: REGION,
            snapshotDate: today,
            providerIds,
          },
          update: { providerIds },
        });
        stats.shows.snapshotted++;
        if (providerIds.length > 0) stats.shows.withProviders++;
      } catch {
        stats.shows.errors++;
      }
    }

    async function runChunked<T>(items: T[], fn: (x: T) => Promise<void>) {
      for (let i = 0; i < items.length; i += PARALLELISM) {
        const chunk = items.slice(i, i + PARALLELISM);
        await Promise.all(chunk.map(fn));
      }
    }

    await runChunked(movieTargets, snapshotMovie);
    await runChunked(showTargets, snapshotShow);

    // --- 3. Trim old snapshots beyond the retention window. ---
    const cutoff = new Date(today);
    cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS);
    const pruned = await prisma.mediaProviderSnapshot.deleteMany({
      where: { snapshotDate: { lt: cutoff } },
    });

    // --- 4. Notify watchlist subscribers of today's launches. ---
    // Lookback of 2 means we have today + yesterday in scope, which
    // is enough to diff one day. The notify helper filters to events
    // with launchDate === today so a Tuesday backfill doesn't re-
    // notify users about Monday's launches. Best-effort — a notify
    // failure shouldn't fail the cron.
    let notifyResult = { notified: 0, matchedItems: 0 };
    try {
      const events = await detectStreamingLaunches(REGION, 2);
      notifyResult = await notifyWatchlistLaunches(events);
    } catch (err) {
      console.error("watchlist streaming-notify pass failed:", err);
    }

    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - startedAt,
      movies: stats.movies,
      shows: stats.shows,
      pruned: pruned.count,
      watchlistNotify: notifyResult,
    });
  } catch (err) {
    console.error("snapshot-providers cron error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
