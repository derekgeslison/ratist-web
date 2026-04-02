import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** POST — Submit a prediction */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const session = await prisma.screeningSession.findUnique({
      where: { id },
      include: { participants: true },
    });

    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!session.participants.some((p) => p.userId === user.id)) {
      return NextResponse.json({ error: "Not a participant" }, { status: 403 });
    }
    if (session.status !== "LOBBY" && session.status !== "COUNTDOWN") {
      return NextResponse.json({ error: "Predictions are locked" }, { status: 400 });
    }

    const { plotGuess, ratingGuess } = await req.json();

    const prediction = await prisma.screeningPrediction.upsert({
      where: { sessionId_userId: { sessionId: id, userId: user.id } },
      create: {
        sessionId: id,
        userId: user.id,
        plotGuess: plotGuess ?? null,
        ratingGuess: ratingGuess != null ? parseFloat(ratingGuess) : null,
      },
      update: {
        plotGuess: plotGuess ?? null,
        ratingGuess: ratingGuess != null ? parseFloat(ratingGuess) : null,
      },
    });

    return NextResponse.json(prediction);
  } catch (err) {
    console.error("Submit prediction error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
