import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const TMDB_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE = "https://api.themoviedb.org/3";

async function avg(values: (number | null)[]): Promise<number | null> {
  const nums = values.filter((v): v is number => v !== null);
  return nums.length === 0 ? null : nums.reduce((a, b) => a + b, 0) / nums.length;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tmdbIdStr } = await params;
  const tmdbId = parseInt(tmdbIdStr, 10);
  if (isNaN(tmdbId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  // Get or create the movie record
  let movie = await prisma.movie.findFirst({ where: { tmdbId } });

  if (!movie) {
    // Fetch from TMDB
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

  const ratings = await prisma.movieRating.findMany({ where: { movieId: movie.id } });

  const fields = [
    { category: "plot", values: ratings.map((r) => r.plot) },
    { category: "storytelling", values: ratings.map((r) => r.storytelling) },
    { category: "pacingClimax", values: ratings.map((r) => r.pacingClimax) },
    { category: "characterDev", values: ratings.map((r) => r.characterDev) },
    { category: "premiseOriginality", values: ratings.map((r) => r.premiseOriginality) },
    { category: "cinematography", values: ratings.map((r) => r.cinematography) },
    { category: "artisticEffect", values: ratings.map((r) => r.artisticEffect) },
    { category: "musicSound", values: ratings.map((r) => r.musicSound) },
    { category: "acting", values: ratings.map((r) => r.actingQuality) },
    { category: "dialogue", values: ratings.map((r) => r.dialogueScripting) },
    { category: "overallEmotion", values: ratings.map((r) => r.overallEmotion) },
    { category: "rewatchability", values: ratings.map((r) => r.appeal) },
    { category: "emotionalImpact", values: ratings.map((r) => r.movingness) },
    { category: "direction", values: ratings.map((r) => r.artisticEffect) },
    { category: "musicScore", values: ratings.map((r) => r.musicSound) },
  ] as const;

  const breakdown = await Promise.all(
    fields.map(async (f) => ({
      category: f.category,
      score: await avg([...f.values]),
    }))
  );

  // Use cached ratist score if available
  const ratistScore = ratings.length > 0
    ? ratings.reduce((sum, r) => sum + (r.overallRating ?? 0), 0) / ratings.length
    : null;

  return NextResponse.json({
    tmdbId,
    title: movie.title,
    posterPath: movie.posterPath,
    releaseDate: movie.releaseDate
      ? (typeof movie.releaseDate === "string"
          ? (movie.releaseDate as string).slice(0, 10)
          : (movie.releaseDate as Date).toISOString().slice(0, 10))
      : null,
    ratistScore: ratistScore ? Math.round(ratistScore * 10) / 10 : null,
    totalRatings: ratings.length,
    breakdown,
  });
}
