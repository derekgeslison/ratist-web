import { NextRequest, NextResponse } from "next/server";
import { ensureUpcomingWeeks, runStatusTransitions } from "@/lib/movie-club";

export const dynamic = "force-dynamic";

/**
 * Cron endpoint for Movie Club automation.
 * Runs status transitions and ensures upcoming weeks exist.
 *
 * Schedule: runs at key transition times (see vercel.json):
 * - Monday 2am ET (7am UTC): scheduled→watching/voting, discussion→archived
 * - Wednesday 2am ET (7am UTC): voting→watching
 * - Friday 8pm ET (1am UTC Sat): watching→discussion
 *
 * Protected by CRON_SECRET to prevent unauthorized triggers.
 */
export async function GET(req: NextRequest) {
  // Verify the request is from Vercel Cron
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await runStatusTransitions();
    await ensureUpcomingWeeks();
    return NextResponse.json({ ok: true, time: new Date().toISOString() });
  } catch (err) {
    console.error("Movie club cron error:", err);
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}
