import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchAllFeeds } from "@/lib/rss";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/news/fetch-rss
 *
 * Fetches headlines from configured RSS feeds and upserts into RssHeadline.
 * Prunes headlines older than 30 days. Runs every 6 hours via Vercel Cron.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const items = await fetchAllFeeds();

  let inserted = 0;
  let skipped = 0;

  for (const item of items) {
    try {
      await prisma.rssHeadline.upsert({
        where: { url: item.url },
        create: {
          feedSource: item.feedSource,
          title: item.title,
          url: item.url,
          description: item.description ?? null,
          imageUrl: item.imageUrl ?? null,
        },
        update: {}, // don't overwrite existing
      });
      inserted++;
    } catch {
      skipped++;
    }
  }

  // Prune old headlines (30+ days, dismissed or unused)
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const pruned = await prisma.rssHeadline.deleteMany({
    where: {
      fetchedAt: { lt: cutoff },
      usedInPost: null,
    },
  });

  return NextResponse.json({ fetched: items.length, inserted, skipped, pruned: pruned.count });
}
