import { NextRequest, NextResponse } from "next/server";
import { fetchNewTrailers } from "@/lib/news-auto";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/news/fetch-trailers
 *
 * Detects new official trailers via TMDB changes API and creates
 * NewsItem records. Runs daily via Vercel Cron.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await fetchNewTrailers();
  return NextResponse.json(result);
}
