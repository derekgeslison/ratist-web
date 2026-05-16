import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pickRandomAndAssign } from "@/lib/movie-club";
import { pregenWatchCompanionForWeek } from "@/lib/movie-club-companion-pregen";

// Cron that runs Mon 13:00 UTC — 1 hour ahead of the Mon 14:00 UTC
// status-transition cron. For each Movie Club week scheduled to start
// today:
//   - If it's a random-pick week without an assigned movie yet, assign
//     one now (pulled out of the 14:00 cron so we have a target to
//     generate against).
//   - For any week now carrying a movie, run pregenWatchCompanionForWeek.
//     Silently skips ineligible movies (still-theatrical, etc.) per spec.
//
// We do NOT transition status or send notifications here — the 14:00
// cron handles both. By then the companion is published and ready.
//
// Companion gen wall time is ~5min, Vercel cron ceiling is 300s. One
// movie-club week per Monday means we comfortably fit. If we ever run
// multiple parallel MC tracks, we'd need to chunk this across runs.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace(/^Bearers+/i, "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Same "today" comparison as runStatusTransitions uses for the
  // scheduled → watching/voting transition — keeps the two crons
  // in lockstep about which week is in scope.
  const today = new Date().toISOString().slice(0, 10);

  const weeks = await prisma.movieClubWeek.findMany({
    where: { status: "scheduled", startDate: { lte: today } },
    select: { id: true, pickMethod: true, pickFilters: true, movieTmdbId: true },
  });

  const results: Array<{ weekId: string; picked: boolean; status: string; reason?: string }> = [];

  for (const week of weeks) {
    let picked = false;
    if (week.pickMethod === "random" && !week.movieTmdbId) {
      await pickRandomAndAssign(week.id, week.pickFilters as Record<string, string> | null);
      picked = true;
    }

    // Community-vote weeks won't have a movie yet at this point —
    // they get pre-genned in the Thu-morning UTC vote-resolve cron
    // path inside runStatusTransitions. Admin-pick + (just-picked)
    // random will both have a movieTmdbId after the block above.
    const refreshed = await prisma.movieClubWeek.findUnique({
      where: { id: week.id },
      select: { movieTmdbId: true },
    });
    if (!refreshed?.movieTmdbId) {
      results.push({ weekId: week.id, picked, status: "no_movie" });
      continue;
    }

    const result = await pregenWatchCompanionForWeek(week.id);
    results.push({ weekId: week.id, picked, status: result.status, reason: result.reason });
  }

  return NextResponse.json({ scanned: weeks.length, results });
}
