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

    // Build buckets: bucket[0] = scores 1.0-1.9 (labeled "1"), ... bucket[9] = scores 10.0 (labeled "10")
    const buckets = Array(10).fill(0);
    let sum = 0;
    for (const r of ratings) {
      const score = r.ratistRating!;
      sum += score;
      // 8.6 → bucket 7 (labeled "8"), 10.0 → bucket 9 (labeled "10"), 4.0 → bucket 3 (labeled "4")
      const bucket = Math.max(0, Math.min(Math.ceil(score) - 1, 9));
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
