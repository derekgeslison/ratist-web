// Fetch a published WatchCompanionData payload by TMDB movie id. Used
// by the Screening Room companion-tab integration to lazy-load the
// data when the user first toggles to the Companion view. The
// existing /movies/[id]/companion page loads the same shape inline,
// but it's a server component and can't be invoked from the client-
// side screening room page.

import { NextResponse } from "next/server";
import { loadMovieWatchCompanion } from "@/lib/load-watch-companion";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ tmdbId: string }> }) {
  const { tmdbId: raw } = await ctx.params;
  const tmdbId = Number(raw);
  if (!Number.isFinite(tmdbId) || tmdbId < 1) {
    return NextResponse.json({ error: "Invalid tmdbId" }, { status: 400 });
  }
  try {
    const data = await loadMovieWatchCompanion(tmdbId);
    if (!data) return NextResponse.json({ data: null }, { status: 404 });
    return NextResponse.json({ data });
  } catch (err) {
    console.error("GET /api/watch-companion/by-tmdb/movie/[tmdbId] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
