import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const TMDB_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE = "https://api.themoviedb.org/3";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tmdbIdStr } = await params;
  const tmdbId = parseInt(tmdbIdStr, 10);
  if (isNaN(tmdbId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  let show = await prisma.tVShow.findFirst({ where: { tmdbId } });

  if (!show) {
    const res = await fetch(`${TMDB_BASE}/tv/${tmdbId}?api_key=${TMDB_KEY}`);
    if (!res.ok) return NextResponse.json({ error: "Show not found" }, { status: 404 });
    const tmdb = await res.json();
    show = await prisma.tVShow.upsert({
      where: { tmdbId },
      create: {
        tmdbId,
        name: tmdb.name,
        firstAirDate: tmdb.first_air_date ?? null,
        posterPath: tmdb.poster_path ?? null,
        overview: tmdb.overview ?? null,
        popularity: tmdb.popularity ?? 0,
      },
      update: {},
    });
  }

  // Aggregate series-level ratings (ratingScope = "series")
  const agg = await prisma.tVShowRating.aggregate({
    where: { tvShowId: show.id, ratistRating: { not: null }, ratingScope: "series", excluded: false },
    _avg: {
      ratistRating: true,
      storyScore: true,
      styleScore: true,
      emotiveScore: true,
      actingScore: true,
      entertainScore: true,
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
      superficialAllure: true,
      choreography: true,
    },
    _sum: { ratistRating: true },
    _count: { ratistRating: true },
  });

  const tmdbScore = show.voteAverage;
  const ratistCount = agg._count.ratistRating;
  const ratistSum = agg._sum.ratistRating ?? 0;
  const buffer = Math.max(0, 50 - ratistCount);
  const hybridRating = tmdbScore != null
    ? Math.round(((tmdbScore * buffer + ratistSum) / Math.max(50, ratistCount)) * 10) / 10
    : ratistCount > 0
      ? Math.round((ratistSum / ratistCount) * 10) / 10
      : null;

  const breakdown = [
    { category: "Story", score: agg._avg.storyScore },
    { category: "Style", score: agg._avg.styleScore },
    { category: "Emotion", score: agg._avg.emotiveScore },
    { category: "Acting", score: agg._avg.actingScore },
    { category: "Entertainment", score: agg._avg.entertainScore },
  ].map((b) => ({ ...b, score: b.score != null ? Math.round(b.score * 10) / 10 : null }));

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
    superficialAllure: agg._avg.superficialAllure,
    choreography: agg._avg.choreography,
  };

  return NextResponse.json({
    tmdbId,
    title: show.name,
    posterPath: show.posterPath,
    releaseDate: show.firstAirDate
      ? (typeof show.firstAirDate === "string"
          ? (show.firstAirDate as string).slice(0, 10)
          : (show.firstAirDate as Date).toISOString().slice(0, 10))
      : null,
    ratistScore: hybridRating,
    totalRatings: ratistCount,
    breakdown,
    fields,
  });
}
