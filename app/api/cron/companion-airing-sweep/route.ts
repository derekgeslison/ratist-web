import { NextRequest, NextResponse } from "next/server";
import { runAiringSweep } from "@/lib/companion-airing-cron";

// Daily cron that scans CompanionAiringSeason rows in airing status, runs
// per-episode generation for newly eligible episodes (air_date + 2 days
// past), and finalizes seasons whose last episode + buffer has passed by
// running the recap chunks and flipping status to 'completed'.
//
// Schedule defined in vercel.json. Secured by CRON_SECRET — same pattern
// as the other cron routes (purge-users, promo-expiry, etc.).
//
// maxDuration: cap at 5 minutes. Sweep enforces a per-row episode-cap so
// the wall-clock stays bounded; rows that need more episodes will be
// picked up on subsequent sweeps. Anthropic API + Wikipedia + Prisma
// can each contribute hundreds of ms of latency, so 300s gives ~3 rows
// of headroom per sweep at typical timing.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runAiringSweep();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("companion-airing-sweep cron error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
