import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: Props) {
  try {
    const { id: tmdbId } = await params;
    const movie = await prisma.movie.findUnique({ where: { tmdbId: Number(tmdbId) }, select: { id: true } });
    if (!movie) return NextResponse.json({ buckets: Array(10).fill(0), total: 0, avg: null });

    const ratings = await prisma.movieRating.findMany({
      where: { movieId: movie.id, ratistRating: { not: null } },
      select: { ratistRating: true },
    });

    // Build buckets: 0-1, 1-2, 2-3, ..., 9-10
    const buckets = Array(10).fill(0);
    let sum = 0;
    for (const r of ratings) {
      const score = r.ratistRating!;
      sum += score;
      // Map 0-10 score to bucket 0-9 (10.0 goes in bucket 9)
      const bucket = Math.min(Math.floor(score), 9);
      buckets[bucket]++;
    }

    return NextResponse.json({
      buckets,
      total: ratings.length,
      avg: ratings.length > 0 ? sum / ratings.length : null,
    });
  } catch {
    return NextResponse.json({ buckets: Array(10).fill(0), total: 0, avg: null });
  }
}
