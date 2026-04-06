import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminAuth } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

interface AnswerData {
  questionIndex: number;
  selectedOption: string;
  timeElapsed: number;     // seconds with 1 decimal
  wrongGuesses: number;
}

/** POST /api/cineq/submit — submit quiz answers and get results */
export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid }, select: { id: true } });
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { dailyId, attemptId, mode, mediaType, difficulty, answers } = await req.json() as {
      dailyId?: string;
      attemptId?: string;
      mode: "daily" | "practice";
      mediaType: string;
      difficulty: string;
      answers: AnswerData[];
    };

    if (!answers || answers.length !== 10) {
      return NextResponse.json({ error: "Must submit exactly 10 answers" }, { status: 400 });
    }

    // For daily mode, verify the daily quiz exists
    let daily: { id: string; questions: unknown } | null = null;
    if (mode === "daily" && dailyId) {
      daily = await prisma.cineQDaily.findUnique({ where: { id: dailyId } });
      if (!daily) return NextResponse.json({ error: "Daily quiz not found" }, { status: 404 });

      // Verify the in_progress attempt exists and belongs to this user
      if (attemptId) {
        const existing = await prisma.cineQAttempt.findUnique({ where: { id: attemptId } });
        if (!existing || existing.userId !== user.id || existing.status !== "in_progress") {
          return NextResponse.json({ error: "Invalid attempt" }, { status: 400 });
        }
      }
    }

    // Score each answer server-side
    const questions = daily
      ? (daily.questions as unknown as { answer: string; tmdbId: number; posterPath: string | null }[])
      : null;

    const POINTS_PER_SEC = 4;
    const WRONG_PENALTY = 25;
    const diffMultiplier = difficulty === "hard" ? 2.0 : difficulty === "medium" ? 1.5 : 1.0;

    let rawScore = 0;
    const results = answers.map((a) => {
      const correct = questions ? a.selectedOption === questions[a.questionIndex]?.answer : true; // practice mode — trust client
      const timePoints = Math.max(0, 100 - a.timeElapsed * POINTS_PER_SEC);
      const penalty = a.wrongGuesses * WRONG_PENALTY;
      const qScore = Math.max(0, Math.round((timePoints - penalty) * 10) / 10);
      rawScore += qScore;
      return {
        questionIndex: a.questionIndex,
        correct,
        timeElapsed: a.timeElapsed,
        wrongGuesses: a.wrongGuesses,
        points: qScore,
        answer: questions ? questions[a.questionIndex]?.answer : null,
        posterPath: questions ? questions[a.questionIndex]?.posterPath : null,
      };
    });

    rawScore = Math.round(rawScore * 10) / 10;
    const weightedScore = Math.round(rawScore * diffMultiplier * 10) / 10;

    // Save attempt — update in_progress for daily, create new for practice
    let attempt;
    if (mode === "daily" && attemptId) {
      attempt = await prisma.cineQAttempt.update({
        where: { id: attemptId },
        data: { rawScore, answers: results as unknown as never, status: "completed" },
      });
    } else {
      attempt = await prisma.cineQAttempt.create({
        data: {
          userId: user.id,
          dailyId: daily?.id ?? null,
          mediaType,
          difficulty,
          mode,
          status: "completed",
          rawScore,
          answers: results as unknown as never,
        },
      });
    }

    return NextResponse.json({
      attemptId: attempt.id,
      rawScore,
      weightedScore,
      difficultyMultiplier: diffMultiplier,
      results,
    });
  } catch (err) {
    console.error("CineQ submit error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
