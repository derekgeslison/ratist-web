import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthedUser } from "@/lib/auth-helpers";
import { ensureUpcomingWeeks, pickRandomMovie } from "@/lib/movie-club";

export const dynamic = "force-dynamic";

async function requireAdmin(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user?.isAdmin) return null;
  return user;
}

/** GET — list all weeks (admin view) + ensure weeks exist */
export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await ensureUpcomingWeeks().catch(() => {});

  const weeks = await prisma.movieClubWeek.findMany({
    orderBy: { weekNumber: "desc" },
    take: 20,
    include: {
      _count: { select: { ratings: true, nominations: true } },
    },
  });

  return NextResponse.json({ weeks });
}

/** POST — preview a random movie pick (doesn't save) */
export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { action, ...body } = await req.json();

  if (action === "preview_random") {
    const picked = await pickRandomMovie(body.filters);
    return NextResponse.json({ movie: picked });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

/** PATCH — update a week (edit details, change status, assign movie) */
export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { weekId, status, pickMethod, pickFilters, pickTeaser, movieTmdbId, movieTitle, moviePoster } = await req.json();
  if (!weekId) return NextResponse.json({ error: "weekId required" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (status !== undefined) data.status = status;
  if (pickMethod !== undefined) data.pickMethod = pickMethod;
  if (pickFilters !== undefined) data.pickFilters = pickFilters;
  if (pickTeaser !== undefined) data.pickTeaser = pickTeaser;

  // When switching to community_vote, clear any previously selected movie
  if (pickMethod === "community_vote") {
    data.movieId = null;
    data.movieTmdbId = null;
    data.movieTitle = null;
    data.moviePoster = null;
  }

  // Assign a specific movie
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

  // If switching to random and no movie yet, pick one
  if (pickMethod === "random" && !movieTmdbId) {
    const picked = await pickRandomMovie(pickFilters as Record<string, string> | null);
    if (picked) {
      const movie = await prisma.movie.upsert({
        where: { tmdbId: picked.tmdbId },
        create: { tmdbId: picked.tmdbId, title: picked.title, posterPath: picked.posterPath },
        update: {},
      });
      data.movieId = movie.id;
      data.movieTmdbId = picked.tmdbId;
      data.movieTitle = picked.title;
      data.moviePoster = picked.posterPath;
    }
  }

  const week = await prisma.movieClubWeek.update({ where: { id: weekId }, data });
  return NextResponse.json({ week });
}
