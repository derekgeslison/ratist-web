import { NextRequest, NextResponse } from "next/server";
import { safeguardTMDBMovies, safeguardTMDBShows } from "@/lib/safe-content";

export const dynamic = "force-dynamic";

const API_KEY = process.env.TMDB_API_KEY;
const BASE = "https://api.themoviedb.org/3";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ movies: [], shows: [], people: [], sectionOrder: ["movies", "shows", "people"] });
  }

  try {
    const [movieRes, tvRes, personRes] = await Promise.all([
      fetch(`${BASE}/search/movie?api_key=${API_KEY}&query=${encodeURIComponent(q)}&include_adult=false&page=1`),
      fetch(`${BASE}/search/tv?api_key=${API_KEY}&query=${encodeURIComponent(q)}&include_adult=false&page=1`),
      fetch(`${BASE}/search/person?api_key=${API_KEY}&query=${encodeURIComponent(q)}&include_adult=false&page=1`),
    ]);

    const [movieData, tvData, personData] = await Promise.all([
      movieRes.ok ? movieRes.json() : { results: [] },
      tvRes.ok ? tvRes.json() : { results: [] },
      personRes.ok ? personRes.json() : { results: [] },
    ]);

    // Apply the discovery safeguard before slicing: drops TMDB-adult-
    // flagged titles entirely and stamps the blocked-poster sentinel on
    // anything an admin has flagged. We slice to a slightly wider cap
    // first so the safeguard's hide-pass doesn't drop the dropdown
    // below its display count.
    const safeMovies = await safeguardTMDBMovies(
      (movieData.results ?? []).slice(0, 12) as { id: number; poster_path: string | null }[],
      { stripBlockedPosters: true },
    );
    const safeShows = await safeguardTMDBShows(
      (tvData.results ?? []).slice(0, 8) as { id: number; poster_path: string | null }[],
      { stripBlockedPosters: true },
    );
    const rawMovies = (safeMovies as unknown as Record<string, unknown>[]).slice(0, 5);
    const rawShows = (safeShows as unknown as Record<string, unknown>[]).slice(0, 3);
    const rawPeople = (personData.results ?? []).slice(0, 3);

    const movies = rawMovies.map((m: Record<string, unknown>) => ({
      id: m.id,
      title: m.title,
      posterPath: m.poster_path,
      year: (m.release_date as string)?.slice(0, 4) ?? null,
    }));

    const shows = rawShows.map((s: Record<string, unknown>) => ({
      id: s.id,
      name: s.name,
      posterPath: s.poster_path,
      year: (s.first_air_date as string)?.slice(0, 4) ?? null,
    }));

    const people = rawPeople.map((p: Record<string, unknown>) => ({
      id: p.id,
      name: p.name,
      profilePath: p.profile_path,
      department: p.known_for_department,
    }));

    // Determine section order by top result popularity
    const qLower = q.toLowerCase();
    const topMoviePop = (rawMovies[0]?.popularity as number) ?? 0;
    const topShowPop = (rawShows[0]?.popularity as number) ?? 0;
    const topPersonPop = (rawPeople[0]?.popularity as number) ?? 0;

    // Boost: exact name match gets a big bump
    const movieBoost = rawMovies[0] && (rawMovies[0].title as string)?.toLowerCase() === qLower ? 500 : 0;
    const showBoost = rawShows[0] && (rawShows[0].name as string)?.toLowerCase() === qLower ? 500 : 0;
    const personBoost = rawPeople[0] && (rawPeople[0].name as string)?.toLowerCase().includes(qLower) ? 500 : 0;

    const sections: { key: string; score: number }[] = [
      { key: "movies", score: topMoviePop + movieBoost },
      { key: "shows", score: topShowPop + showBoost },
      { key: "people", score: topPersonPop + personBoost },
    ];
    sections.sort((a, b) => b.score - a.score);
    const sectionOrder = sections.filter((s) => {
      if (s.key === "movies") return movies.length > 0;
      if (s.key === "shows") return shows.length > 0;
      if (s.key === "people") return people.length > 0;
      return false;
    }).map((s) => s.key);

    return NextResponse.json({ movies, shows, people, sectionOrder });
  } catch {
    return NextResponse.json({ movies: [], shows: [], people: [], sectionOrder: ["movies", "shows", "people"] });
  }
}
