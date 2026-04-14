import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchNewTrailers } from "@/lib/news-auto";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/news/fetch-trailers
 *
 * Scans popular/upcoming titles for new trailers. Runs daily via Vercel Cron.
 * Also prunes auto-generated trailers older than 60 days to keep the feed fresh.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await fetchNewTrailers();

  // Prune old auto-generated trailers (60+ days)
  const pruneCutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const pruned = await prisma.newsItem.deleteMany({
    where: {
      type: "TRAILER",
      externalKey: { not: null },
      publishedAt: { lt: pruneCutoff },
    },
  });

  return NextResponse.json({ ...result, pruned: pruned.count });
}
