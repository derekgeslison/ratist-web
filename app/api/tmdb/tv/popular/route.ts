import { NextResponse } from "next/server";
import { getPopularShows } from "@/lib/tmdb";
import { safeguardTMDBShows } from "@/lib/safe-content";

// Onboarding's step 4 (mark seen) used to fetch TMDB directly from the
// browser; that broke once we stopped exposing the TMDB key publicly.
// Routing through the server here keeps the key off the client AND
// dodges any CORS edge cases.
export async function GET() {
  try {
    const data = await getPopularShows(1);
    const safe = await safeguardTMDBShows(data.results, {
      stripBlockedPosters: true,
    });
    return NextResponse.json({ results: safe });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
