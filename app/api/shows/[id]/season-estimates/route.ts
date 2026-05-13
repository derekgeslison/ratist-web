import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { getSeasonScoreEstimatesTv } from "@/lib/profile";

export const dynamic = "force-dynamic";

// GET /api/shows/[id]/season-estimates
// Returns { estimates: { [seasonNumber: number]: number | null } }
// keyed by season number — entries only present for seasons that have at
// least one full Ratist rating in the DB. Auth required since the
// estimate is personalized to the viewer's profile.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: tmdbId } = await params;
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ estimates: {} });
    }
    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) return NextResponse.json({ estimates: {} });

    const tvShow = await prisma.tVShow.findUnique({
      where: { tmdbId: Number(tmdbId) },
      select: { id: true },
    });
    if (!tvShow) return NextResponse.json({ estimates: {} });

    const map = await getSeasonScoreEstimatesTv(user.id, tvShow.id);
    const estimates: Record<number, number | null> = {};
    for (const [k, v] of map.entries()) estimates[k] = v;
    return NextResponse.json({ estimates });
  } catch (err) {
    console.error("Season estimates error:", err);
    return NextResponse.json({ estimates: {} });
  }
}
