import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { generateQuiz } from "@/lib/cineq";

export const dynamic = "force-dynamic";

/** GET /api/cineq/practice?mediaType=movie&difficulty=easy */
export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
    if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid }, select: { id: true } });
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const mediaType = req.nextUrl.searchParams.get("mediaType") ?? "movie";
    const difficulty = req.nextUrl.searchParams.get("difficulty") ?? "easy";

    if (!["movie", "tv", "both"].includes(mediaType) || !["easy", "medium", "hard"].includes(difficulty)) {
      return NextResponse.json({ error: "Invalid params" }, { status: 400 });
    }

    const questions = await generateQuiz(mediaType as "movie" | "tv" | "both", difficulty);

    // Return without answers
    const safeQuestions = questions.map((q, i) => ({
      index: i,
      mediaType: q.mediaType,
      phases: q.phases,
      options: q.options,
      answerIdx: q.options.indexOf(q.answer),
    }));

    return NextResponse.json({ mode: "practice", mediaType, difficulty, questions: safeQuestions });
  } catch (err) {
    console.error("CineQ practice error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
