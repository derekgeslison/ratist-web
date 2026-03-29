import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.TMDB_API_KEY;
const BASE = "https://api.themoviedb.org/3";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q");
  if (!query) return NextResponse.json({ results: [] });

  const res = await fetch(
    `${BASE}/search/person?api_key=${API_KEY}&query=${encodeURIComponent(query)}&page=1`,
    { next: { revalidate: 300 } }
  );
  const data = await res.json();

  const results = (data.results ?? []).slice(0, 8).map((p: {
    id: number;
    name: string;
    profile_path: string | null;
    known_for_department: string;
  }) => ({
    id: p.id,
    name: p.name,
    profilePath: p.profile_path,
    department: p.known_for_department,
  }));

  return NextResponse.json({ results });
}
