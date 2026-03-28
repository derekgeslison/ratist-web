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

    // Ensure movie exists in our DB
    let movie = await prisma.movie.upsert({
      where: { tmdbId: Number(tmdbId) },
      create: {
        tmdbId: Number(tmdbId),
        title: body.movieTitle ?? "Unknown",
        releaseDate: body.releaseDate ?? null,
      },
      update: {
        // Backfill releaseDate if it was missing
        ...(body.releaseDate ? { releaseDate: body.releaseDate } : {}),
        ...(body.movieTitle ? { title: body.movieTitle } : {}),
      },
    });

    // Compute scores
    const scores = computeRatistScores(body);

    const ratingData = {
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
    };

    const rating = await prisma.movieRating.upsert({
      where: { userId_movieId: { userId: user.id, movieId: movie.id } },
      create: { userId: user.id, movieId: movie.id, ...ratingData },
      update: ratingData,
    });

    // Also mark as seen
    await prisma.userFavoriteMovie.upsert({
      where: { userId_movieId: { userId: user.id, movieId: movie.id } },
      create: { userId: user.id, movieId: movie.id },
      update: {},
    }).catch(() => {}); // Ignore if already exists with different logic

    // Rebuild user profile/persona async (don't block response)
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
