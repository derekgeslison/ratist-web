import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminAuth } from "@/lib/firebase-admin";
import { generateQuiz, getPacificDate } from "@/lib/cineq";

export const dynamic = "force-dynamic";

async function getUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  if (!decoded) return null;
  return prisma.user.findUnique({ where: { firebaseUid: decoded.uid }, select: { id: true, firebaseUid: true } });
}

/** GET /api/cineq/daily?mediaType=movie&difficulty=easy */
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const mediaType = req.nextUrl.searchParams.get("mediaType") ?? "movie";
    const difficulty = req.nextUrl.searchParams.get("difficulty") ?? "easy";
    const today = getPacificDate();

    if (!["movie", "tv", "both"].includes(mediaType) || !["easy", "medium", "hard"].includes(difficulty)) {
      return NextResponse.json({ error: "Invalid params" }, { status: 400 });
    }

    // Check if user already completed this daily
    const existingDaily = await prisma.cineQDaily.findUnique({
      where: { date_mediaType_difficulty: { date: today, mediaType, difficulty } },
    });

    if (existingDaily) {
      const existingAttempt = await prisma.cineQAttempt.findUnique({
        where: { userId_dailyId: { userId: user.id, dailyId: existingDaily.id } },
      });
      if (existingAttempt) {
        return NextResponse.json({ error: "Already completed", alreadyPlayed: true, attempt: existingAttempt }, { status: 409 });
      }
    }

    // Get or generate today's quiz
    let daily = existingDaily;
    if (!daily) {
      const questions = await generateQuiz(mediaType as "movie" | "tv" | "both", difficulty);
      if (questions.length < 10) {
        return NextResponse.json({ error: "Could not generate enough questions. Try again." }, { status: 503 });
      }
      daily = await prisma.cineQDaily.create({
        data: { date: today, mediaType, difficulty, questions: questions as unknown as never },
      });
    }

    // Return questions WITHOUT answers (client doesn't get the answer field)
    const questions = (daily.questions as unknown as { tmdbId: number; mediaType: string; posterPath: string | null; phases: string[][]; options: string[]; answer: string }[]);

    // Shuffle question order per user (seeded by oderId + dailyId)
    const seed = hashCode(user.id + daily.id);
    const shuffled = seededShuffle(questions.map((q, i) => i), seed);

    const safeQuestions = shuffled.map((origIndex) => {
      const q = questions[origIndex];
      return {
        index: origIndex,
        mediaType: q.mediaType,
        phases: q.phases,
        options: q.options,
        answerIdx: q.options.indexOf(q.answer),
      };
    });

    return NextResponse.json({ dailyId: daily.id, date: today, mediaType, difficulty, questions: safeQuestions });
  } catch (err) {
    console.error("CineQ daily error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const result = [...arr];
  let s = seed;
  for (let i = result.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    const j = s % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
