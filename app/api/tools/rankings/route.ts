import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function getUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7));
  return prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
}

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ movies: [] });

    const filter = req.nextUrl.searchParams.get("filter") ?? "all";
    const listKey = filter === "all" ? "all-time" : filter;

    // Check for saved rankings first
    const savedRankings = await prisma.userMovieRanking.findMany({
      where: { userId: user.id, listKey },
      include: { movie: { select: { id: true, tmdbId: true, title: true, posterPath: true, releaseDate: true } } },
      orderBy: { sortOrder: "asc" },
    });

    if (savedRankings.length > 0) {
      // Also fetch ratings for each movie to show the score
      const movieIds = savedRankings.map((r) => r.movieId);
      const ratings = await prisma.movieRating.findMany({
        where: { userId: user.id, movieId: { in: movieIds } },
        select: { movieId: true, ratistRating: true },
      });
      const ratingMap = new Map(ratings.map((r) => [r.movieId, r.ratistRating]));

      const movies = savedRankings.map((r, idx) => ({
        id: r.movieId,
        tmdbId: r.movie.tmdbId,
        title: r.movie.title,
        posterPath: r.movie.posterPath,
        year: r.movie.releaseDate?.slice(0, 4) ?? "",
        ratistRating: ratingMap.get(r.movieId) ?? null,
        seen: true,
        rank: idx + 1,
      }));

      return NextResponse.json({ movies, hasSavedOrder: true });
    }

    // No saved rankings — generate default order from ratings
    const ratings = await prisma.movieRating.findMany({
      where: { userId: user.id },
      include: { movie: { select: { id: true, tmdbId: true, title: true, posterPath: true, releaseDate: true } } },
    });

    const ratedMovieIds = new Set(ratings.map((r) => r.movieId));
    const seenOnly = await prisma.userFavoriteMovie.findMany({
      where: { userId: user.id, movieId: { notIn: Array.from(ratedMovieIds) } },
      include: { movie: { select: { id: true, tmdbId: true, title: true, posterPath: true, releaseDate: true } } },
    });

    const ratedSorted = ratings.slice().sort((a, b) => (b.ratistRating ?? 0) - (a.ratistRating ?? 0));

    const allMovies = [
      ...ratedSorted.map((r) => ({
        id: r.movieId,
        tmdbId: r.movie.tmdbId,
        title: r.movie.title,
        posterPath: r.movie.posterPath,
        year: r.movie.releaseDate?.slice(0, 4) ?? "",
        ratistRating: r.ratistRating,
        seen: true,
      })),
      ...seenOnly.map((s) => ({
        id: s.movieId,
        tmdbId: s.movie.tmdbId,
        title: s.movie.title,
        posterPath: s.movie.posterPath,
        year: s.movie.releaseDate?.slice(0, 4) ?? "",
        ratistRating: null,
        seen: true,
      })),
    ];

    let filtered = allMovies;
    if (filter !== "all") {
      filtered = allMovies.filter((m) => m.year === filter);
    }

    const movies = filtered.map((m, idx) => ({ ...m, rank: idx + 1 }));
    return NextResponse.json({ movies, hasSavedOrder: false });
  } catch (err) {
    console.error("Rankings error:", err);
    return NextResponse.json({ movies: [] });
  }
}

/** POST — save ranking order */
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { listKey, movieIds } = await req.json();
    if (!listKey || !Array.isArray(movieIds)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    // Delete existing rankings for this list, then insert new ones
    await prisma.userMovieRanking.deleteMany({ where: { userId: user.id, listKey } });

    if (movieIds.length > 0) {
      await prisma.userMovieRanking.createMany({
        data: movieIds.map((movieId: string, idx: number) => ({
          userId: user.id,
          movieId,
          listKey,
          sortOrder: idx,
        })),
      });
    }

    return NextResponse.json({ saved: true });
  } catch (err) {
    console.error("Rankings save error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
