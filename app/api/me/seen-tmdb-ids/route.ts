import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/me/seen-tmdb-ids
//
// Returns the signed-in user's seen list as two flat tmdbId arrays —
// one for movies (UserFavoriteMovie) and one for TV shows
// (UserFavoriteShow). Used by client-side filters that need to know
// "have I seen this?" for many titles at once without doing N per-card
// API calls. Returns empty arrays for unauthenticated requests so the
// caller doesn't have to special-case sign-out.

export async function GET(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ movieTmdbIds: [], showTmdbIds: [] });

  const [movieFavs, showFavs] = await Promise.all([
    prisma.userFavoriteMovie.findMany({
      where: { userId: user.id },
      select: { movie: { select: { tmdbId: true } } },
    }),
    prisma.userFavoriteShow.findMany({
      where: { userId: user.id },
      select: { tvShow: { select: { tmdbId: true } } },
    }),
  ]);

  return NextResponse.json({
    movieTmdbIds: movieFavs.map((f) => f.movie.tmdbId),
    showTmdbIds: showFavs.map((f) => f.tvShow.tmdbId),
  });
}
