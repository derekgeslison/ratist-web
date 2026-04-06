import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminAuth } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

/** GET /api/cineq/stats — get user's CineQ stats */
export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid }, select: { id: true } });
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const allAttempts = await prisma.cineQAttempt.findMany({
      where: { userId: user.id, status: "completed" },
      select: { rawScore: true, difficulty: true, mode: true, mediaType: true, createdAt: true, answers: true },
      orderBy: { createdAt: "desc" },
    });

    const dailyAttempts = allAttempts.filter((a) => a.mode === "daily");
    const practiceAttempts = allAttempts.filter((a) => a.mode === "practice");

    const diffMultiplier = (d: string) => d === "hard" ? 2.0 : d === "medium" ? 1.5 : 1.0;

    // Weighted lifetime points (daily only)
    const weightedLifetime = dailyAttempts.reduce((sum, a) => sum + a.rawScore * diffMultiplier(a.difficulty), 0);

    // Average raw score
    const avgRaw = dailyAttempts.length > 0
      ? dailyAttempts.reduce((sum, a) => sum + a.rawScore, 0) / dailyAttempts.length
      : 0;

    // Best daily score
    const bestDaily = dailyAttempts.reduce((max, a) => Math.max(max, a.rawScore), 0);

    // Accuracy: correct answers / total answers
    let totalCorrect = 0;
    let totalAnswers = 0;
    let totalWrongGuesses = 0;
    for (const a of allAttempts) {
      const answers = a.answers as unknown as { correct: boolean; wrongGuesses: number }[];
      if (Array.isArray(answers)) {
        for (const ans of answers) {
          totalAnswers++;
          if (ans.correct) totalCorrect++;
          totalWrongGuesses += ans.wrongGuesses ?? 0;
        }
      }
    }

    // Daily streak
    let streak = 0;
    if (dailyAttempts.length > 0) {
      const dates = [...new Set(dailyAttempts.map((a) =>
        a.createdAt.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" })
      ))].sort().reverse();

      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
      if (dates[0] === today || dates[0] === getPrevDate(today)) {
        streak = 1;
        for (let i = 1; i < dates.length; i++) {
          if (dates[i] === getPrevDate(dates[i - 1])) streak++;
          else break;
        }
      }
    }

    // Quizzes played/started today (includes in_progress and abandoned to block retakes)
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
    const allTodayAttempts = await prisma.cineQAttempt.findMany({
      where: { userId: user.id, mode: "daily" },
      select: { mediaType: true, difficulty: true, createdAt: true },
    });
    const playedToday = allTodayAttempts
      .filter((a) => a.createdAt.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }) === today)
      .map((a) => `${a.mediaType}-${a.difficulty}`);

    return NextResponse.json({
      weightedLifetime: Math.round(weightedLifetime * 10) / 10,
      avgRawScore: Math.round(avgRaw * 10) / 10,
      bestDailyScore: Math.round(bestDaily * 10) / 10,
      totalDailyQuizzes: dailyAttempts.length,
      totalPracticeQuizzes: practiceAttempts.length,
      accuracy: totalAnswers > 0 ? Math.round((totalCorrect / totalAnswers) * 1000) / 10 : 0,
      avgWrongGuessesPerQuiz: allAttempts.length > 0 ? Math.round((totalWrongGuesses / allAttempts.length) * 10) / 10 : 0,
      dailyStreak: streak,
      playedToday,
    });
  } catch (err) {
    console.error("CineQ stats error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

function getPrevDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
