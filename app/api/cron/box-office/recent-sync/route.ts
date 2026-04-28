import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMovieDetails } from "@/lib/tmdb";
import { upsertMovie } from "@/lib/tmdb-sync";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/box-office/recent-sync
 *
 * Refreshes box-office data for recent theatrical releases. The
 * /box-office/recent page leans on revenue figures that TMDB updates
 * gradually as theatrical runs unfold — without an active sync, only
 * movies a user has visited are kept current. This cron walks the
 * most popular recent releases and re-fetches them so the recent
 * leaderboards stay live.
 *
 * Schedule: 2× daily (configured in vercel.json) at ~12-hour spacing.
 *
 * Volume: top 200 by popularity within a 120-day release window.
 * 200 × ~300ms = ~60s, near Vercel's default timeout. If that becomes
 * a problem we can split into "<60d very recent" and "60–120d
 * settling" passes on different schedules.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 120-day window. Wider than /box-office/recent's longest tile (90d)
  // so we keep the trailing-edge results fresh too — by the time a
  // movie ages out of the 90d window, its revenue is mostly settled.
  const ninetyDaysAgo = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  // Don't re-fetch movies we just fetched. 8h window is short enough
  // to refresh both daily passes but long enough to avoid wasting an
  // API call on a movie whose data didn't change.
  const cutoffStale = new Date(Date.now() - 8 * 60 * 60 * 1000);

  const candidates = await prisma.movie.findMany({
    where: {
      releaseDate: { gte: ninetyDaysAgo },
      // Skip total no-name entries — TMDB has thousands of obscure
      // foreign/indie films within any 120-day window that will
      // never have meaningful box-office numbers. popularity ≥ 5
      // tracks roughly the films users actually browse.
      popularity: { gte: 5 },
      OR: [{ cachedAt: null }, { cachedAt: { lt: cutoffStale } }],
    },
    orderBy: { popularity: "desc" },
    take: 200,
    select: { tmdbId: true, title: true },
  });

  let updated = 0;
  let failed = 0;
  for (const movie of candidates) {
    try {
      const tmdb = await getMovieDetails(movie.tmdbId);
      await upsertMovie(tmdb);
      updated++;
    } catch (err) {
      failed++;
      console.error(`recent-sync failed for tmdb=${movie.tmdbId} (${movie.title}):`, err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json({
    candidates: candidates.length,
    updated,
    failed,
    cutoffDate: ninetyDaysAgo,
  });
}
