import { NextRequest, NextResponse } from "next/server";
import { safeguardTMDBShows } from "@/lib/safe-content";

const API_KEY = process.env.TMDB_API_KEY;
const BASE = "https://api.themoviedb.org/3";

interface TMDBSearchShow {
  id: number;
  name: string;
  poster_path: string | null;
  first_air_date: string;
  popularity?: number;
}

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q");
  const page = req.nextUrl.searchParams.get("page") ?? "1";
  if (!query) return NextResponse.json({ results: [], totalPages: 0 });

  const res = await fetch(
    `${BASE}/search/tv?api_key=${API_KEY}&query=${encodeURIComponent(query)}&include_adult=false&page=${page}`,
    { next: { revalidate: 300 } }
  );
  const data = await res.json();

  // Discovery safeguard: stamp the blocked-poster sentinel on anything
  // admin-flagged.
  const safe = await safeguardTMDBShows(
    (data.results ?? []) as TMDBSearchShow[],
    { stripBlockedPosters: true },
  );

  const results = safe.map((s) => ({
    id: s.id,
    title: s.name,
    posterPath: s.poster_path,
    releaseDate: s.first_air_date,
    popularity: s.popularity ?? 0,
  }));

  return NextResponse.json({ results, totalPages: data.total_pages ?? 1 });
}
