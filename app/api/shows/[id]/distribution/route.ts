import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: Props) {
  try {
    const { id: tmdbId } = await params;
    const show = await prisma.tVShow.findUnique({ where: { tmdbId: Number(tmdbId) }, select: { id: true } });
    if (!show) return NextResponse.json({ buckets: Array(10).fill(0), total: 0, avg: null });

    const ratings = await prisma.tVShowRating.findMany({
      where: { tvShowId: show.id, ratingScope: "series", ratistRating: { not: null }, excluded: false },
      select: { ratistRating: true },
    });

    const buckets = Array(10).fill(0);
    let sum = 0;
    for (const r of ratings) {
      const score = r.ratistRating!;
      sum += score;
      const bucket = Math.max(0, Math.min(Math.floor(score) - 1, 9));
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
