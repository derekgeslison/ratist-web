import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { computeRatistScores } from "@/lib/ratings";
import { checkBadges } from "@/lib/badges";
import { autoCompleteIfExpired } from "@/lib/screening-auto-complete";

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

    // Auto-advance to COMPLETE when everyone who finished watching
    // has submitted their review. Previously the session sat in
    // POST_WATCH until the host clicked "View comparison" or "Skip
    // to comparison". The Skip button is still there as a manual
    // override if someone got stuck (e.g. a participant marked
    // themselves Finished but then left without submitting). We
    // count against participants with hasFinished=true since those
    // are the people who actually reached POST_WATCH.
    if (session.status === "POST_WATCH") {
      const [finishedCount, ratedCount] = await Promise.all([
        prisma.screeningParticipant.count({
          where: { sessionId: id, hasFinished: true },
        }),
        prisma.screeningRating.groupBy({
          by: ["userId"],
          where: { sessionId: id },
        }).then((rows) => rows.length),
      ]);
      if (finishedCount > 0 && ratedCount >= finishedCount) {
        await prisma.screeningSession.update({
          where: { id },
          data: { status: "COMPLETE", ...(session.finishedAt ? {} : { finishedAt: new Date() }) },
        });
        // Same badge re-check the PATCH handler does on a manual
        // COMPLETE transition. The Screening Host SQL keys on
        // status=COMPLETE so the auto-advance path needs to fire it
        // too or the host never gets credited.
        const participants = await prisma.screeningParticipant.findMany({
          where: { sessionId: id },
          select: { userId: true },
        });
        for (const p of participants) {
          checkBadges(p.userId, "screening_end").catch(() => {});
        }
      }
    }

    // Even when not all reviews are in, run the time-limit auto-
    // close so a session that hit the 25-min post-watch cap (or the
    // 4hr wall-clock cap) gets flipped to COMPLETE off the back of
    // this rating submission. Idempotent — no-op when no cap met.
    await autoCompleteIfExpired({
      id: session.id,
      status: session.status,
      startedAt: session.startedAt,
      finishedAt: session.finishedAt,
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
