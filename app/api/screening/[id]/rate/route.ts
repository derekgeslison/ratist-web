import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { computeRatistScores } from "@/lib/ratings";

export const dynamic = "force-dynamic";

/** POST — Submit or update a screening rating */
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
    if (session.status !== "POST_WATCH" && session.status !== "COMPLETE") {
      return NextResponse.json({ error: "Not in post-watch phase" }, { status: 400 });
    }

    const body = await req.json();
    const { reviewType, overallRating, reviewText, ...fields } = body;

    // Compute scores for standard reviews
    let computed = { storyScore: null as number | null, styleScore: null as number | null, emotiveScore: null as number | null, actingScore: null as number | null, entertainScore: null as number | null, ratistRating: null as number | null };
    if (reviewType !== "basic") {
      computed = computeRatistScores({ ...fields, overallRating });
    } else {
      computed.ratistRating = overallRating ?? null;
    }

    const rating = await prisma.screeningRating.upsert({
      where: { sessionId_userId: { sessionId: id, userId: user.id } },
      create: {
        sessionId: id,
        userId: user.id,
        reviewType: reviewType ?? "standard",
        overallRating: overallRating ?? null,
        reviewText: reviewText ?? null,
        ...fields,
        ...computed,
      },
      update: {
        reviewType: reviewType ?? "standard",
        overallRating: overallRating ?? null,
        reviewText: reviewText ?? null,
        ...fields,
        ...computed,
      },
    });

    return NextResponse.json(rating);
  } catch (err) {
    console.error("Submit screening rating error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** GET — Fetch all screening ratings for a session */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const ratings = await prisma.screeningRating.findMany({
      where: { sessionId: id },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    });

    return NextResponse.json(ratings);
  } catch (err) {
    console.error("Fetch screening ratings error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
