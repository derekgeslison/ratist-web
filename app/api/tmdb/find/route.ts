import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.TMDB_API_KEY;
const BASE = "https://api.themoviedb.org/3";

export async function GET(req: NextRequest) {
  const imdbId = req.nextUrl.searchParams.get("imdbId");
  if (!imdbId || !API_KEY) return NextResponse.json({});

  try {
    const res = await fetch(`${BASE}/find/${imdbId}?api_key=${API_KEY}&external_source=imdb_id`);
    if (!res.ok) return NextResponse.json({});
    const data = await res.json();

    // Check movies first
    const movie = data.movie_results?.[0];
    if (movie) {
      return NextResponse.json({
        title: movie.title,
        year: movie.release_date ? parseInt(movie.release_date.slice(0, 4)) : undefined,
        type: "movie",
        tmdbId: movie.id,
      });
    }

    // Check TV shows
    const show = data.tv_results?.[0];
    if (show) {
      return NextResponse.json({
        title: show.name,
        year: show.first_air_date ? parseInt(show.first_air_date.slice(0, 4)) : undefined,
        type: "tv",
        tmdbId: show.id,
      });
    }

    return NextResponse.json({});
  } catch {
    return NextResponse.json({});
  }
}
