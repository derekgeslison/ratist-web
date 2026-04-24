import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE = "https://api.themoviedb.org/3";

/**
 * Serves the rich TMDB payload the fun-facts carousel renders during a
 * watch-companion generation. This is a server route (not a client fetch
 * from the viewer) so we can control the response shape and cache-friendly
 * revalidate the TMDB call. Returns a minimal envelope — the component
 * decides which fields to show.
 *
 * Fields pulled match Cine-Q's trivia set: tagline, budget, revenue,
 * runtime, release/air dates, original language, collection, credits,
 * networks, creators, content ratings, etc.
 */
export async function GET(req: NextRequest) {
  if (!API_KEY) return NextResponse.json({ error: "TMDB not configured" }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const tmdbId = Number(searchParams.get("tmdbId"));
  const mediaType = searchParams.get("mediaType") === "tv" ? "tv" : "movie";
  if (!Number.isFinite(tmdbId) || tmdbId < 1) {
    return NextResponse.json({ error: "Invalid tmdbId" }, { status: 400 });
  }

  const appendForMovie = "credits,release_dates";
  const appendForTv = "credits,aggregate_credits,content_ratings";
  const append = mediaType === "movie" ? appendForMovie : appendForTv;

  try {
    const res = await fetch(
      `${TMDB_BASE}/${mediaType}/${tmdbId}?api_key=${API_KEY}&append_to_response=${append}&language=en-US`,
      { next: { revalidate: 3600 } }, // 1-hour cache — these fields don't change often
    );
    if (!res.ok) return NextResponse.json({ error: "TMDB error" }, { status: res.status });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("fun-facts TMDB fetch error:", err);
    return NextResponse.json({ error: "TMDB fetch failed" }, { status: 500 });
  }
}
