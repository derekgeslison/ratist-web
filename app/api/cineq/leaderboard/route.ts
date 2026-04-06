import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPacificDate } from "@/lib/cineq";

export const dynamic = "force-dynamic";

/** GET /api/cineq/leaderboard?date=2026-04-06&mediaType=movie&difficulty=easy */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const date = url.searchParams.get("date") ?? getPacificDate();
    const mediaType = url.searchParams.get("mediaType") ?? "movie";
    const difficulty = url.searchParams.get("difficulty") ?? "easy";

    const daily = await prisma.cineQDaily.findUnique({
      where: { date_mediaType_difficulty: { date, mediaType, difficulty } },
    });

    if (!daily) return NextResponse.json({ entries: [] });

    const attempts = await prisma.cineQAttempt.findMany({
      where: { dailyId: daily.id, status: "completed", rawScore: { gt: 0 } },
      select: {
        rawScore: true,
        createdAt: true,
        user: { select: { firebaseUid: true, name: true, avatarUrl: true } },
      },
      orderBy: { rawScore: "desc" },
      take: 50,
    });

    const diffMultiplier = difficulty === "hard" ? 2.0 : difficulty === "medium" ? 1.5 : 1.0;

    const entries = attempts.map((a, i) => ({
      rank: i + 1,
      user: a.user,
      rawScore: a.rawScore,
      weightedScore: Math.round(a.rawScore * diffMultiplier * 10) / 10,
      completedAt: a.createdAt.toISOString(),
    }));

    return NextResponse.json({ date, mediaType, difficulty, entries });
  } catch (err) {
    console.error("CineQ leaderboard error:", err);
    return NextResponse.json({ entries: [] });
  }
}
