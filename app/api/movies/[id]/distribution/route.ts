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
      where: { movieId: movie.id, ratistRating: { not: null }, excluded: false },
      select: { ratistRating: true },
    });

    // Build buckets matching the displayed rating (rounded to 1 decimal).
    // bucket[0] = displayed 1.0–1.9 (labeled "1"), ... bucket[9] = displayed 10.0 (labeled "10")
    // A raw 3.949 displays as "3.9" → bucket "3". A raw 3.950 displays as "4.0" → bucket "4".
    const buckets = Array(10).fill(0);
    let sum = 0;
    for (const r of ratings) {
      const score = r.ratistRating!;
      sum += score;
      const displayed = Math.round(score * 10) / 10; // match toFixed(1) rounding
      const bucket = Math.max(0, Math.min(Math.floor(displayed) - 1, 9));
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
