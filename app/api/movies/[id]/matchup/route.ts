import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { maskBlockedInResponse } from "@/lib/safe-content";

const TMDB_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE = "https://api.themoviedb.org/3";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tmdbIdStr } = await params;
  const tmdbId = parseInt(tmdbIdStr, 10);
  if (isNaN(tmdbId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  let movie = await prisma.movie.findFirst({ where: { tmdbId } });

  if (!movie) {
    const res = await fetch(`${TMDB_BASE}/movie/${tmdbId}?api_key=${TMDB_KEY}`);
    if (!res.ok) return NextResponse.json({ error: "Movie not found" }, { status: 404 });
    const tmdb = await res.json();
    movie = await prisma.movie.upsert({
      where: { tmdbId },
      create: {
        tmdbId,
        title: tmdb.title,
        releaseDate: tmdb.release_date ?? null,
        posterPath: tmdb.poster_path ?? null,
        overview: tmdb.overview ?? null,
        popularity: tmdb.popularity ?? 0,
      },
      update: {},
    });
  }

  // Get community averages — same aggregate as the movie page uses
  const agg = await prisma.movieRating.aggregate({
    where: { movieId: movie.id, ratistRating: { not: null }, excluded: false },
    _avg: {
      ratistRating: true,
      storyScore: true,
      styleScore: true,
      emotiveScore: true,
      actingScore: true,
      entertainScore: true,
      // Individual fields
      plot: true,
      premiseOriginality: true,
      storytelling: true,
      characterDev: true,
      pacingClimax: true,
      cinematography: true,
      locationCost: true,
      artisticEffect: true,
      visualEffects: true,
      musicSound: true,
      overallEmotion: true,
      relatability: true,
      meaning: true,
      movingness: true,
      casting: true,
      actingQuality: true,
      dialogueScripting: true,
      blockingChoreo: true,
      appeal: true,
      choreography: true,
    },
    _sum: { ratistRating: true },
    _count: { ratistRating: true },
  });

  // Hybrid community rating (same formula as movie page)
  const tmdbScore = movie.voteAverage;
  const ratistCount = agg._count.ratistRating;
  const ratistSum = agg._sum.ratistRating ?? 0;
  const buffer = Math.max(0, 50 - ratistCount);
  const hybridRating = tmdbScore != null
    ? Math.round(((tmdbScore * buffer + ratistSum) / Math.max(50, ratistCount)) * 10) / 10
    : ratistCount > 0
      ? Math.round((ratistSum / ratistCount) * 10) / 10
      : null;

  // Category breakdown — 5 pillars matching the movie page
  const breakdown = [
    { category: "Story", score: agg._avg.storyScore },
    { category: "Style", score: agg._avg.styleScore },
    { category: "Emotion", score: agg._avg.emotiveScore },
    { category: "Acting", score: agg._avg.actingScore },
    { category: "Entertainment", score: agg._avg.entertainScore },
  ].map((b) => ({ ...b, score: b.score != null ? Math.round(b.score * 10) / 10 : null }));

  // Individual field averages for detailed breakdown
  const fields = {
    plot: agg._avg.plot,
    premiseOriginality: agg._avg.premiseOriginality,
    storytelling: agg._avg.storytelling,
    characterDev: agg._avg.characterDev,
    pacingClimax: agg._avg.pacingClimax,
    cinematography: agg._avg.cinematography,
    locationCost: agg._avg.locationCost,
    artisticEffect: agg._avg.artisticEffect,
    visualEffects: agg._avg.visualEffects,
    musicSound: agg._avg.musicSound,
    overallEmotion: agg._avg.overallEmotion,
    relatability: agg._avg.relatability,
    meaning: agg._avg.meaning,
    movingness: agg._avg.movingness,
    casting: agg._avg.casting,
    actingQuality: agg._avg.actingQuality,
    dialogueScripting: agg._avg.dialogueScripting,
    blockingChoreo: agg._avg.blockingChoreo,
    appeal: agg._avg.appeal,
    choreography: agg._avg.choreography,
  };

  return NextResponse.json(await maskBlockedInResponse({
    tmdbId,
    title: movie.title,
    posterPath: movie.posterPath,
    releaseDate: movie.releaseDate
      ? (typeof movie.releaseDate === "string"
          ? (movie.releaseDate as string).slice(0, 10)
          : (movie.releaseDate as Date).toISOString().slice(0, 10))
      : null,
    ratistScore: hybridRating,
    totalRatings: ratistCount,
    breakdown,
    fields,
  }));
}
