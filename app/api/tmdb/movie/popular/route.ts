import { NextResponse } from "next/server";
import { getPopularMovies } from "@/lib/tmdb";
import { safeguardTMDBMovies } from "@/lib/safe-content";

export async function GET() {
  try {
    const data = await getPopularMovies(1);
    // Onboarding pulls 15 popular films here; this route must drop
    // adult-flagged titles AND mask admin-blocked posters before the
    // client sees them. filterNC17 is on for consistency with the
    // home-page popular rail.
    // Onboarding pulls 15 popular films from this route. Opt into
    // the adult-keyword auto-detect so softcore / erotic films TMDB
    // never flagged adult slip out of the onboarding picker.
    const safe = await safeguardTMDBMovies(data.results, {
      filterNC17: true,
      stripBlockedPosters: true,
      adultKeywordCheck: true,
    });
    return NextResponse.json({ results: safe });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
