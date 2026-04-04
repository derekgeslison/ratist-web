import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const API_KEY = process.env.TMDB_API_KEY;
const BASE = "https://api.themoviedb.org/3";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ movies: [], people: [] });
  }

  try {
    const [movieRes, personRes] = await Promise.all([
      fetch(`${BASE}/search/movie?api_key=${API_KEY}&query=${encodeURIComponent(q)}&include_adult=false&page=1`),
      fetch(`${BASE}/search/person?api_key=${API_KEY}&query=${encodeURIComponent(q)}&include_adult=false&page=1`),
    ]);

    const [movieData, personData] = await Promise.all([
      movieRes.ok ? movieRes.json() : { results: [] },
      personRes.ok ? personRes.json() : { results: [] },
    ]);

    const movies = (movieData.results ?? []).slice(0, 5).map((m: Record<string, unknown>) => ({
      id: m.id,
      title: m.title,
      posterPath: m.poster_path,
      year: (m.release_date as string)?.slice(0, 4) ?? null,
    }));

    const people = (personData.results ?? []).slice(0, 3).map((p: Record<string, unknown>) => ({
      id: p.id,
      name: p.name,
      profilePath: p.profile_path,
      department: p.known_for_department,
    }));

    return NextResponse.json({ movies, people });
  } catch {
    return NextResponse.json({ movies: [], people: [] });
  }
}
