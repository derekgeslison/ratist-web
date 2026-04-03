import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { computeRatistScores } from "@/lib/ratings";
import { rebuildUserProfile } from "@/lib/profile";

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

    // Ensure movie exists in our DB
    const movie = await prisma.movie.upsert({
      where: { tmdbId: Number(tmdbId) },
      create: {
        tmdbId: Number(tmdbId),
        title: body.movieTitle ?? "Unknown",
        releaseDate: body.releaseDate ?? null,
      },
      update: {
        ...(body.releaseDate ? { releaseDate: body.releaseDate } : {}),
        ...(body.movieTitle ? { title: body.movieTitle } : {}),
      },
    });

    // For basic mode: set ratistRating = overallRating, skip component computation
    // For standard/critic: compute from components as normal
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
      // Genres
      genreAction: body.genreAction ?? null,
      genreHorror: body.genreHorror ?? null,
      genreDrama: body.genreDrama ?? null,
      genreHistorical: body.genreHistorical ?? null,
      genreScifi: body.genreScifi ?? null,
      genreThriller: body.genreThriller ?? null,
      genreComedy: body.genreComedy ?? null,
      genreBookAdapt: body.genreBookAdapt ?? null,
      genreFantasy: body.genreFantasy ?? null,
      genreRomance: body.genreRomance ?? null,
      genreDocumentary: body.genreDocumentary ?? null,
      genreFamily: body.genreFamily ?? null,
      genreFilmNoir: body.genreFilmNoir ?? null,
      genreMusical: body.genreMusical ?? null,
      genreBiopic: body.genreBiopic ?? null,
      genreCrime: body.genreCrime ?? null,
      genreWestern: body.genreWestern ?? null,
      genreMystery: body.genreMystery ?? null,
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
      // Critic mode comments
      fieldComments: body.fieldComments ?? null,
      categoryComments: body.categoryComments ?? null,
      // Clear importSource when user submits any review (they've taken ownership)
      importSource: null,
    };

    const rating = await prisma.movieRating.upsert({
      where: { userId_movieId: { userId: user.id, movieId: movie.id } },
      create: { userId: user.id, movieId: movie.id, ...ratingData },
      update: ratingData,
    });

    // Also mark as seen (without auto-setting watchedDate — user sets that manually)
    await prisma.userFavoriteMovie.upsert({
      where: { userId_movieId: { userId: user.id, movieId: movie.id } },
      create: { userId: user.id, movieId: movie.id },
      update: {},
    }).catch(() => {});

    // Rebuild user profile/persona async
    rebuildUserProfile(user.id).catch(console.error);

    return NextResponse.json({ rating });
  } catch (err) {
    console.error("Rate error:", err);
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

    const movie = await prisma.movie.findUnique({ where: { tmdbId: Number(tmdbId) } });
    if (!movie) return NextResponse.json({ rating: null });

    const rating = await prisma.movieRating.findUnique({
      where: { userId_movieId: { userId: user.id, movieId: movie.id } },
    });
    return NextResponse.json({ rating });
  } catch {
    return NextResponse.json({ rating: null });
  }
}
