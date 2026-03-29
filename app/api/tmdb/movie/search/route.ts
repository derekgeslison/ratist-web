import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.TMDB_API_KEY;
const BASE = "https://api.themoviedb.org/3";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q");
  if (!query) return NextResponse.json({ results: [] });

  const res = await fetch(
    `${BASE}/search/movie?api_key=${API_KEY}&query=${encodeURIComponent(query)}&page=1`,
    { next: { revalidate: 300 } }
  );
  const data = await res.json();

  const results = (data.results ?? []).slice(0, 8).map((m: {
    id: number;
    title: string;
    poster_path: string | null;
    release_date: string;
  }) => ({
    id: m.id,
    title: m.title,
    posterPath: m.poster_path,
    releaseDate: m.release_date,
  }));

  return NextResponse.json({ results });
}
