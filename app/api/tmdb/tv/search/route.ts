import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.TMDB_API_KEY;
const BASE = "https://api.themoviedb.org/3";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q");
  if (!query) return NextResponse.json({ results: [] });

  const res = await fetch(
    `${BASE}/search/tv?api_key=${API_KEY}&query=${encodeURIComponent(query)}&page=1`,
    { next: { revalidate: 300 } }
  );
  const data = await res.json();

  const results = (data.results ?? []).slice(0, 8).map((s: {
    id: number;
    name: string;
    poster_path: string | null;
    first_air_date: string;
  }) => ({
    id: s.id,
    title: s.name,
    posterPath: s.poster_path,
    releaseDate: s.first_air_date,
  }));

  return NextResponse.json({ results });
}
