import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthedUser } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

async function requireAdmin(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user?.isAdmin) return null;
  return user;
}

/** GET — list all weeks (admin view) */
export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const weeks = await prisma.movieClubWeek.findMany({
    orderBy: { weekNumber: "desc" },
    include: {
      _count: { select: { ratings: true, votes: true } },
    },
  });

  return NextResponse.json({ weeks });
}

/** POST — create a new week */
export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { startDate, pickMethod, pickFilters, pickTeaser, movieTmdbId, movieTitle, moviePoster, voteCandidates } = await req.json();

  if (!startDate) return NextResponse.json({ error: "startDate required" }, { status: 400 });

  // Calculate end date (Sunday = startDate + 6 days)
  const start = new Date(startDate + "T12:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const endDate = end.toISOString().slice(0, 10);

  // Get next week number
  const lastWeek = await prisma.movieClubWeek.findFirst({ orderBy: { weekNumber: "desc" } });
  const weekNumber = (lastWeek?.weekNumber ?? 0) + 1;

  // If admin pick, ensure movie exists in DB
  let movieId: string | null = null;
  if (pickMethod === "admin" && movieTmdbId) {
    const movie = await prisma.movie.upsert({
      where: { tmdbId: Number(movieTmdbId) },
      create: { tmdbId: Number(movieTmdbId), title: movieTitle ?? "Unknown", posterPath: moviePoster ?? null },
      update: {},
    });
    movieId = movie.id;
  }

  // If random pick, select a movie using filters
  if (pickMethod === "random") {
    const selected = await pickRandomMovie(pickFilters);
    if (selected) {
      const movie = await prisma.movie.upsert({
        where: { tmdbId: selected.tmdbId },
        create: { tmdbId: selected.tmdbId, title: selected.title, posterPath: selected.posterPath },
        update: {},
      });
      movieId = movie.id;
      movieTmdbId; // already set from selected
    }
  }

  const week = await prisma.movieClubWeek.create({
    data: {
      weekNumber,
      startDate,
      endDate,
      pickMethod: pickMethod ?? "random",
      pickFilters: pickFilters ?? null,
      pickTeaser: pickTeaser ?? null,
      movieId,
      movieTmdbId: pickMethod === "admin" ? Number(movieTmdbId) : (pickMethod === "random" ? (movieId ? undefined : null) : null),
      movieTitle: pickMethod === "admin" ? movieTitle : undefined,
      moviePoster: pickMethod === "admin" ? moviePoster : undefined,
      voteCandidates: pickMethod === "community_vote" ? voteCandidates : null,
      status: "upcoming",
    },
  });

  return NextResponse.json({ week }, { status: 201 });
}

/** PATCH — update a week (change status, set movie, etc.) */
export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { weekId, status, movieTmdbId, movieTitle, moviePoster, pickTeaser } = await req.json();
  if (!weekId) return NextResponse.json({ error: "weekId required" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (status) data.status = status;
  if (pickTeaser !== undefined) data.pickTeaser = pickTeaser;

  if (movieTmdbId) {
    const movie = await prisma.movie.upsert({
      where: { tmdbId: Number(movieTmdbId) },
      create: { tmdbId: Number(movieTmdbId), title: movieTitle ?? "Unknown", posterPath: moviePoster ?? null },
      update: {},
    });
    data.movieId = movie.id;
    data.movieTmdbId = Number(movieTmdbId);
    data.movieTitle = movieTitle;
    data.moviePoster = moviePoster;
  }

  const week = await prisma.movieClubWeek.update({ where: { id: weekId }, data });
  return NextResponse.json({ week });
}

// ─── Random movie picker ─────────────────────────────────────────────────────

async function pickRandomMovie(filters?: { genre?: string; mpaRating?: string; provider?: string; yearFrom?: string; yearTo?: string }): Promise<{ tmdbId: number; title: string; posterPath: string | null } | null> {
  const API_KEY = process.env.TMDB_API_KEY;
  const params = new URLSearchParams({
    api_key: API_KEY!,
    sort_by: "popularity.desc",
    "vote_count.gte": "500",
    include_adult: "false",
    with_original_language: "en",
    page: String(Math.floor(Math.random() * 5) + 1),
  });

  if (filters?.genre) params.set("with_genres", filters.genre);
  if (filters?.provider) { params.set("with_watch_providers", filters.provider); params.set("watch_region", "US"); }
  if (filters?.yearFrom) params.set("primary_release_date.gte", `${filters.yearFrom}-01-01`);
  if (filters?.yearTo) params.set("primary_release_date.lte", `${filters.yearTo}-12-31`);
  if (filters?.mpaRating) { params.set("certification_country", "US"); params.set("certification", filters.mpaRating); }

  try {
    const res = await fetch(`https://api.themoviedb.org/3/discover/movie?${params}`);
    const data = await res.json();
    const results = data.results ?? [];
    if (results.length === 0) return null;
    const pick = results[Math.floor(Math.random() * results.length)];
    return { tmdbId: pick.id, title: pick.title, posterPath: pick.poster_path };
  } catch {
    return null;
  }
}
