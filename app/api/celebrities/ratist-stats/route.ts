import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ userAvg: null, userCount: 0 });

    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) return NextResponse.json({ userAvg: null, userCount: 0 });

    const { tmdbIds } = await req.json();
    if (!Array.isArray(tmdbIds) || tmdbIds.length === 0) return NextResponse.json({ userAvg: null, userCount: 0 });

    const agg = await prisma.movieRating.aggregate({
      where: {
        userId: user.id,
        movie: { tmdbId: { in: tmdbIds } },
        ratistRating: { not: null },
      },
      _avg: { ratistRating: true },
      _count: { ratistRating: true },
    });

    return NextResponse.json({
      userAvg: agg._avg.ratistRating,
      userCount: agg._count.ratistRating,
    });
  } catch (err) {
    console.error("Celebrity ratist stats error:", err);
    return NextResponse.json({ userAvg: null, userCount: 0 });
  }
}
