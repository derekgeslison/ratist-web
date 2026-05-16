import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scanPosterSafeSearch, shouldBlockPoster } from "@/lib/vision-safesearch";

export const dynamic = "force-dynamic";
// Vercel default function timeout is 10s on hobby / 60s on pro. The
// monthly NC-17 / NR sweep typically scans a few dozen rows, so this
// fits well within the bigger ceiling. maxDuration buys us headroom
// if a month happens to produce a fatter tail.
export const maxDuration = 300;

const TMDB_POSTER_BASE = "https://image.tmdb.org/t/p/w500";

/**
 * GET /api/cron/scan-nc17-posters
 *
 * Monthly Vision SafeSearch sweep over NC-17 / NR movies. Targets:
 *   - Never-scanned posters (caught by upsertMovie or rating change
 *     since the last sweep).
 *   - Scanned-but-unblocked posters whose poster_path has changed
 *     since the last verdict — TMDB sometimes swaps in a more
 *     explicit poster art.
 *   - Stale verdicts (>90 days) on currently-unblocked rows, so
 *     re-rated titles eventually get re-checked.
 *
 * Already-blocked rows are skipped — re-confirming "still blocked"
 * costs Vision credits for no decision value.
 *
 * Auth: CRON_SECRET as Bearer token, matching the other cron jobs.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace(/^Bearers+/i, "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const STALE_DAYS = 90;
  const staleCutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);

  const candidates = await prisma.movie.findMany({
    where: {
      mpaaRating: { in: ["NC-17", "NR"] },
      posterPath: { not: null },
      posterBlocked: false,
      OR: [
        { posterScannedAt: null },
        { posterScannedAt: { lt: staleCutoff } },
      ],
    },
    select: { id: true, tmdbId: true, title: true, posterPath: true },
    // Hard cap so a runaway month can't blow past the function
    // timeout. The expected steady-state population per month is
    // small (theatrical NC-17 is ~1–3/yr; the rest are TMDB
    // adult:true entries which upsertMovie already auto-blocks
    // without needing a scan).
    take: 200,
  });

  let scanned = 0;
  let blocked = 0;
  let apiFailures = 0;

  for (const movie of candidates) {
    if (!movie.posterPath) continue;
    const verdict = await scanPosterSafeSearch(`${TMDB_POSTER_BASE}${movie.posterPath}`);
    if (!verdict) {
      apiFailures++;
      continue;
    }
    const block = shouldBlockPoster(verdict);
    await prisma.movie.update({
      where: { id: movie.id },
      data: {
        posterScannedAt: new Date(),
        posterScanResult: verdict as unknown as object,
        ...(block ? { posterBlocked: true } : {}),
      },
    }).catch(() => { /* row deleted mid-run — ignore */ });
    scanned++;
    if (block) blocked++;
    // Small delay to be gentle on Vision quota — same pacing as
    // the bulk backfill script.
    await new Promise((r) => setTimeout(r, 200));
  }

  return NextResponse.json({
    ok: true,
    found: candidates.length,
    scanned,
    blocked,
    apiFailures,
  });
}
