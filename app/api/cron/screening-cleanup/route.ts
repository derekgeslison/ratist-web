import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminDatabase } from "@/lib/firebase-admin";
import { LOBBY_MAX_DURATION_MS, rtdbPaths } from "@/lib/screening";

// Sweeps abandoned LOBBY-status screening sessions that nobody ever
// loaded after creation, so the in-route self-heal didn't have a
// chance to run. Without this, host-created-and-walked-away lobbies
// would sit in the DB indefinitely and also keep the host blocked by
// the no-concurrent-room gate.
//
// The in-route check in /api/screening/[id] handles the case where
// someone actually visits a stale lobby; this cron handles the rest.
//
// Protected by CRON_SECRET. Scheduled in vercel.json.

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cutoff = new Date(Date.now() - LOBBY_MAX_DURATION_MS);
    const stale = await prisma.screeningSession.findMany({
      where: { status: "LOBBY", createdAt: { lt: cutoff } },
      select: { id: true },
    });

    for (const s of stale) {
      try { await prisma.screeningSession.delete({ where: { id: s.id } }); } catch { /* already gone */ }
      try { await adminDatabase.ref(rtdbPaths.session(s.id)).remove(); } catch { /* best-effort */ }
    }

    return NextResponse.json({ deletedLobbies: stale.length });
  } catch (err) {
    console.error("Screening cleanup cron error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
