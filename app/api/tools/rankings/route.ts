import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { maskBlockedInResponse } from "@/lib/safe-content";

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

    // Check for saved rankings first. Saved rows are filtered against
    // the user's current seen + rated sets so that an item that the
    // user has since unseen and unrated drops out of the list — the
    // toggle endpoints clean up on mutation, but pre-fix orphans
    // (e.g. an unmark-seen that happened before that cascade shipped)
    // would otherwise linger in the saved-order rows. Orphan rows are
    // also dropped opportunistically below so the DB self-heals.
    const [savedRankings, allUserMovieSeen, allUserMovieRated, allUserShowSeen, allUserShowRated] = await Promise.all([
      prisma.userMovieRanking.findMany({
        where: { userId: user.id, listKey },
        include: {
          movie: { select: { id: true, tmdbId: true, title: true, posterPath: true, releaseDate: true } },
          tvShow: { select: { id: true, tmdbId: true, name: true, posterPath: true, firstAirDate: true } },
        },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.userFavoriteMovie.findMany({ where: { userId: user.id }, select: { movieId: true } }),
      prisma.movieRating.findMany({ where: { userId: user.id }, select: { movieId: true } }),
      prisma.userFavoriteShow.findMany({ where: { userId: user.id }, select: { tvShowId: true } }),
      prisma.tVShowRating.findMany({ where: { userId: user.id }, select: { tvShowId: true } }),
    ]);

    const validMovieIds = new Set<string>([
      ...allUserMovieSeen.map((m) => m.movieId),
      ...allUserMovieRated.map((m) => m.movieId),
    ]);
    const validShowIds = new Set<string>([
      ...allUserShowSeen.map((s) => s.tvShowId),
      ...allUserShowRated.map((s) => s.tvShowId),
    ]);

    const orphanRankingIds: string[] = [];
    const liveSavedRankings = savedRankings.filter((r) => {
      if (r.movieId && !validMovieIds.has(r.movieId)) {
        orphanRankingIds.push(r.id);
        return false;
      }
      if (r.tvShowId && !validShowIds.has(r.tvShowId)) {
        orphanRankingIds.push(r.id);
        return false;
      }
      return true;
    });

    if (orphanRankingIds.length > 0) {
      // Fire-and-forget self-heal. Safe: the rows are already excluded
      // from the response, so a failed delete just means we re-filter
      // them on the next read.
      prisma.userMovieRanking.deleteMany({ where: { id: { in: orphanRankingIds } } }).catch(() => {});
    }

    if (liveSavedRankings.length > 0) {
      const movieIds = new Set(liveSavedRankings.filter((r) => r.movieId).map((r) => r.movieId!));

      // Fetch ratings for saved movies
      const ratings = await prisma.movieRating.findMany({
        where: { userId: user.id, movieId: { in: Array.from(movieIds) } },
        select: { movieId: true, ratistRating: true },
      });
      const ratingMap = new Map(ratings.map((r) => [r.movieId, r.ratistRating]));

      const movies = liveSavedRankings.map((r, idx) => {
        if (r.tvShow) {
          return {
            id: r.tvShowId!,
            tmdbId: r.tvShow.tmdbId,
            title: r.tvShow.name,
            posterPath: r.tvShow.posterPath,
            year: r.tvShow.firstAirDate?.slice(0, 4) ?? "",
            ratistRating: null as number | null,
            mediaType: "tv" as const,
            seen: true,
            rank: idx + 1,
          };
        }
        return {
          id: r.movieId!,
          tmdbId: r.movie!.tmdbId,
          title: r.movie!.title,
          posterPath: r.movie!.posterPath,
          year: r.movie!.releaseDate?.slice(0, 4) ?? "",
          ratistRating: ratingMap.get(r.movieId!) ?? null,
          mediaType: "movie" as const,
          seen: true,
          rank: idx + 1,
        };
      });

      // Find new movies not yet in the saved rankings (for non-custom lists)
      if (!listKey.startsWith("custom-")) {
        const yearFilter = listKey !== "all-time" ? listKey : null;

        // New rated movies not in saved rankings
        const newRated = await prisma.movieRating.findMany({
          where: { userId: user.id, movieId: { notIn: Array.from(movieIds) } },
          include: { movie: { select: { id: true, tmdbId: true, title: true, posterPath: true, releaseDate: true } } },
        });
        // New seen-only movies not in saved rankings
        const newSeen = await prisma.userFavoriteMovie.findMany({
          where: { userId: user.id, movieId: { notIn: Array.from(movieIds) } },
          include: { movie: { select: { id: true, tmdbId: true, title: true, posterPath: true, releaseDate: true } } },
        });
        const newRatedIds = new Set(newRated.map((r) => r.movieId));

        let newMovies = [
          ...newRated.map((r) => ({
            id: r.movieId, tmdbId: r.movie.tmdbId, title: r.movie.title,
            posterPath: r.movie.posterPath, year: r.movie.releaseDate?.slice(0, 4) ?? "",
            ratistRating: r.ratistRating, seen: true,
          })),
          ...newSeen.filter((s) => !newRatedIds.has(s.movieId)).map((s) => ({
            id: s.movieId, tmdbId: s.movie.tmdbId, title: s.movie.title,
            posterPath: s.movie.posterPath, year: s.movie.releaseDate?.slice(0, 4) ?? "",
            ratistRating: null as number | null, seen: true,
          })),
        ];

        if (yearFilter) newMovies = newMovies.filter((m) => m.year === yearFilter);

        // Append new movies at the end
        const allMovies = [
          ...movies,
          ...newMovies.map((m, idx) => ({ ...m, rank: movies.length + idx + 1 })),
        ];

        return NextResponse.json(await maskBlockedInResponse({ movies: allMovies, hasSavedOrder: true }));
      }

      return NextResponse.json(await maskBlockedInResponse({ movies, hasSavedOrder: true }));
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
    return NextResponse.json(await maskBlockedInResponse({ movies, hasSavedOrder: false }));
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

    const { listKey, movieIds, items } = await req.json();
    if (!listKey) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

    // Delete existing rankings for this list, then insert new ones
    await prisma.userMovieRanking.deleteMany({ where: { userId: user.id, listKey } });

    // New format: items with mediaType info
    if (Array.isArray(items) && items.length > 0) {
      await prisma.userMovieRanking.createMany({
        data: items.map((item: { id: string; mediaType?: string }, idx: number) => ({
          userId: user.id,
          movieId: item.mediaType === "tv" ? null : item.id,
          tvShowId: item.mediaType === "tv" ? item.id : null,
          listKey,
          sortOrder: idx,
        })),
        skipDuplicates: true,
      });
    } else if (Array.isArray(movieIds) && movieIds.length > 0) {
      // Legacy format: all movies
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
