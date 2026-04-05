import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { computeRatistScores } from "@/lib/ratings";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: tmdbId } = await params;
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const body = await req.json();
    const reviewType = body.reviewType ?? "standard";
    const ratingScope = body.ratingScope ?? "series";
    const seasonNumber = ratingScope === "season" ? (body.seasonNumber ?? 0) : 0;

    // Ensure show exists in our DB
    const tvShow = await prisma.tVShow.upsert({
      where: { tmdbId: Number(tmdbId) },
      create: {
        tmdbId: Number(tmdbId),
        name: body.showName ?? "Unknown",
        firstAirDate: body.firstAirDate ?? null,
      },
      update: {
        ...(body.showName ? { name: body.showName } : {}),
      },
    });

    let scores;
    if (reviewType === "basic") {
      scores = {
        storyScore: null,
        styleScore: null,
        emotiveScore: null,
        actingScore: null,
        entertainScore: null,
        ratistRating: body.overallRating ?? null,
      };
    } else {
      scores = computeRatistScores(body);
    }

    const ratingData: Record<string, unknown> = {
      ratingScope,
      seasonNumber,
      // Story
      plot: body.plot ?? null,
      premiseOriginality: body.premiseOriginality ?? null,
      storytelling: body.storytelling ?? null,
      characterDev: body.characterDev ?? null,
      pacingClimax: body.pacingClimax ?? null,
      // Style
      cinematography: body.cinematography ?? null,
      locationCost: body.locationCost ?? null,
      realism: body.realism ?? null,
      artisticEffect: body.artisticEffect ?? null,
      visualEffects: body.visualEffects ?? null,
      musicSound: body.musicSound ?? null,
      // Emotive
      overallEmotion: body.overallEmotion ?? null,
      relatability: body.relatability ?? null,
      meaning: body.meaning ?? null,
      movingness: body.movingness ?? null,
      // Acting
      casting: body.casting ?? null,
      actingQuality: body.actingQuality ?? null,
      dialogueScripting: body.dialogueScripting ?? null,
      blockingChoreo: body.blockingChoreo ?? null,
      // Entertainment
      appeal: body.appeal ?? null,
      superficialAllure: body.superficialAllure ?? null,
      choreography: body.choreography ?? null,
      // Overall
      overallRating: body.overallRating ?? null,
      // Review text
      reviewText: body.reviewText ?? null,
      // Computed
      storyScore: scores.storyScore,
      styleScore: scores.styleScore,
      emotiveScore: scores.emotiveScore,
      actingScore: scores.actingScore,
      entertainScore: scores.entertainScore,
      ratistRating: scores.ratistRating,
      // Review mode
      reviewType,
      hasSpoilers: body.hasSpoilers ?? false,
      commentsDisabled: body.commentsDisabled ?? false,
      fieldComments: body.fieldComments ?? null,
      categoryComments: body.categoryComments ?? null,
    };

    const rating = await prisma.tVShowRating.upsert({
      where: {
        userId_tvShowId_ratingScope_seasonNumber: {
          userId: user.id,
          tvShowId: tvShow.id,
          ratingScope,
          seasonNumber,
        },
      },
      create: { userId: user.id, tvShowId: tvShow.id, ...ratingData },
      update: ratingData,
    });

    // Also mark show as seen
    await prisma.userFavoriteShow.upsert({
      where: { userId_tvShowId: { userId: user.id, tvShowId: tvShow.id } },
      create: { userId: user.id, tvShowId: tvShow.id },
      update: {},
    }).catch(() => {});

    return NextResponse.json({ rating });
  } catch (err) {
    console.error("Show rate error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: tmdbId } = await params;
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const tvShow = await prisma.tVShow.findUnique({ where: { tmdbId: Number(tmdbId) } });
    if (!tvShow) return NextResponse.json({ error: "No rating found" }, { status: 404 });

    const scope = req.nextUrl.searchParams.get("scope") ?? "series";
    const seasonNum = req.nextUrl.searchParams.get("season");

    const deleted = await prisma.tVShowRating.deleteMany({
      where: {
        userId: user.id,
        tvShowId: tvShow.id,
        ratingScope: scope,
        seasonNumber: scope === "season" && seasonNum ? Number(seasonNum) : 0,
      },
    });

    if (deleted.count === 0) return NextResponse.json({ error: "No rating found" }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Delete show rating error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: tmdbId } = await params;
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ rating: null });
    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) return NextResponse.json({ rating: null });

    const tvShow = await prisma.tVShow.findUnique({ where: { tmdbId: Number(tmdbId) } });
    if (!tvShow) return NextResponse.json({ rating: null });

    // Return series-level rating by default
    const scope = req.nextUrl.searchParams.get("scope") ?? "series";
    const seasonNum = req.nextUrl.searchParams.get("season");

    const rating = await prisma.tVShowRating.findFirst({
      where: {
        userId: user.id,
        tvShowId: tvShow.id,
        ratingScope: scope,
        seasonNumber: scope === "season" && seasonNum ? Number(seasonNum) : 0,
      },
    });

    // Also fetch all season ratings for this show
    const seasonRatings = await prisma.tVShowRating.findMany({
      where: { userId: user.id, tvShowId: tvShow.id, ratingScope: "season" },
      select: { seasonNumber: true, ratistRating: true, overallRating: true },
      orderBy: { seasonNumber: "asc" },
    });

    return NextResponse.json({ rating, seasonRatings });
  } catch {
    return NextResponse.json({ rating: null });
  }
}
