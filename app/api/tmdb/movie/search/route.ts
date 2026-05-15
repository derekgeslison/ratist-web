import { NextRequest, NextResponse } from "next/server";
import { safeguardTMDBMovies } from "@/lib/safe-content";

const API_KEY = process.env.TMDB_API_KEY;
const BASE = "https://api.themoviedb.org/3";

interface TMDBSearchMovie {
  id: number;
  title: string;
  poster_path: string | null;
  release_date: string;
  popularity?: number;
}

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q");
  const page = req.nextUrl.searchParams.get("page") ?? "1";
  if (!query) return NextResponse.json({ results: [], totalPages: 0 });

  // Forward include_adult=false so TMDB itself filters its own
  // hardcore-flagged results. Our safeguard pass below catches anything
  // they didn't tag (admin-flagged or auto-detected adult content).
  const res = await fetch(
    `${BASE}/search/movie?api_key=${API_KEY}&query=${encodeURIComponent(query)}&include_adult=false&page=${page}`,
    { next: { revalidate: 300 } }
  );
  const data = await res.json();

  // Discovery safeguard: hide TMDB-adult-flagged titles and stamp the
  // blocked-poster sentinel on anything an admin has flagged.
  const safe = await safeguardTMDBMovies(
    (data.results ?? []) as TMDBSearchMovie[],
    { stripBlockedPosters: true },
  );

  const results = safe.map((m) => ({
    id: m.id,
    title: m.title,
    posterPath: m.poster_path,
    releaseDate: m.release_date,
    popularity: m.popularity ?? 0,
  }));

  return NextResponse.json({ results, totalPages: data.total_pages ?? 1 });
}
