import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { getRatingStatus } from "@/lib/rating-status";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

export async function GET(req: NextRequest) {
  try {
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ ratings: [], unrated: [] });

    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) return NextResponse.json({ ratings: [], unrated: [] });

    const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;
    const loadAll = req.nextUrl.searchParams.get("all") === "1";

    // Fetch movie ratings with pagination (or all if requested)
    const allMovieRatings = await prisma.movieRating.findMany({
      where: { userId: user.id },
      include: {
        movie: {
          select: {
            id: true, tmdbId: true, title: true, posterPath: true, releaseDate: true, voteAverage: true,
            genres: { include: { genre: { select: { name: true } } } },
            cast: {
              where: { OR: [{ creditType: "cast" }, { creditType: "crew", job: "Director" }] },
              select: { creditType: true, job: true, castOrder: true, celebrity: { select: { name: true } } },
              orderBy: { castOrder: "asc" },
              take: 15,
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      ...(loadAll ? {} : {
        take: PAGE_SIZE + 1,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      }),
    });

    // Fetch TV show ratings (series-level only) with pagination
    const allTVRatings = await prisma.tVShowRating.findMany({
      where: { userId: user.id, ratingScope: "series" },
      include: {
        tvShow: {
          select: {
            id: true, tmdbId: true, name: true, posterPath: true, firstAirDate: true, voteAverage: true,
            genres: { include: { genre: { select: { name: true } } } },
            cast: {
              where: { OR: [{ creditType: "cast" }, { creditType: "crew", job: "Director" }] },
              select: { creditType: true, job: true, castOrder: true, celebrity: { select: { name: true } } },
              orderBy: { castOrder: "asc" },
              take: 15,
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      ...(loadAll ? {} : { take: PAGE_SIZE }),
    });

    const hasMore = !loadAll && allMovieRatings.length > PAGE_SIZE;
    const pageMovieRatings = hasMore ? allMovieRatings.slice(0, PAGE_SIZE) : allMovieRatings;
    const nextCursor = hasMore ? pageMovieRatings[pageMovieRatings.length - 1].id : null;

    // Get watched dates
    const favorites = await prisma.userFavoriteMovie.findMany({
      where: { userId: user.id },
      select: { movieId: true, watchedDate: true, createdAt: true, movie: {
        select: { id: true, tmdbId: true, title: true, posterPath: true, releaseDate: true, voteAverage: true,
          genres: { include: { genre: { select: { name: true } } } },
        },
      }},
    });
    const watchedDateMap = new Map(favorites.map((f) => [f.movieId, f.watchedDate]));

    const movieRatings = pageMovieRatings.map((r) => {
      const directors = r.movie.cast
        .filter((c) => c.creditType === "crew" && c.job === "Director")
        .map((c) => c.celebrity.name);
      const actors = r.movie.cast
        .filter((c) => c.creditType === "cast")
        .sort((a, b) => a.castOrder - b.castOrder)
        .slice(0, 5)
        .map((c) => c.celebrity.name);
      return {
        id: r.id,
        tmdbId: r.movie.tmdbId,
        title: r.movie.title,
        posterPath: r.movie.posterPath,
        year: r.movie.releaseDate?.slice(0, 4) ?? "",
        genres: r.movie.genres.map((g) => g.genre.name),
        directors,
        actors,
        voteAverage: r.movie.voteAverage ?? null,
        ratistRating: r.ratistRating,
        overallRating: r.overallRating,
        reviewText: r.reviewText,
        reviewType: r.reviewType,
        ratingStatus: getRatingStatus(r as unknown as Record<string, unknown>),
        watchedDate: watchedDateMap.get(r.movieId)?.toISOString() ?? null,
        ratedAt: r.createdAt.toISOString(),
        mediaType: "movie" as const,
      };
    });

    const tvRatings = allTVRatings.map((r) => {
      const directors = r.tvShow.cast
        .filter((c) => c.creditType === "crew" && c.job === "Director")
        .map((c) => c.celebrity.name);
      const actors = r.tvShow.cast
        .filter((c) => c.creditType === "cast")
        .sort((a, b) => a.castOrder - b.castOrder)
        .slice(0, 5)
        .map((c) => c.celebrity.name);
      return {
        id: r.id,
        tmdbId: r.tvShow.tmdbId,
        title: r.tvShow.name,
        posterPath: r.tvShow.posterPath,
        year: r.tvShow.firstAirDate?.slice(0, 4) ?? "",
        genres: r.tvShow.genres.map((g) => g.genre.name),
        directors,
        actors,
        voteAverage: r.tvShow.voteAverage ?? null,
        ratistRating: r.ratistRating,
        overallRating: r.overallRating,
        reviewText: r.reviewText,
        reviewType: r.reviewType,
        ratingStatus: getRatingStatus(r as unknown as Record<string, unknown>),
        watchedDate: null,
        ratedAt: r.createdAt.toISOString(),
        mediaType: "tv" as const,
      };
    });

    // Combine and sort by ratedAt descending
    const ratings = [...movieRatings, ...tvRatings].sort(
      (a, b) => new Date(b.ratedAt).getTime() - new Date(a.ratedAt).getTime()
    );

    // Unrated seen movies + shows (only on first page load, not paginated loads)
    let unrated: unknown[] = [];
    if (!cursor) {
      const ratedMovieIds = new Set(
        await prisma.movieRating.findMany({
          where: { userId: user.id },
          select: { movieId: true },
        }).then((rows) => rows.map((r) => r.movieId))
      );

      const unratedMovies = favorites
        .filter((f) => !ratedMovieIds.has(f.movieId))
        .map((f) => ({
          tmdbId: f.movie.tmdbId,
          title: f.movie.title,
          posterPath: f.movie.posterPath,
          year: f.movie.releaseDate?.slice(0, 4) ?? "",
          genres: f.movie.genres.map((g) => g.genre.name),
          voteAverage: f.movie.voteAverage ?? null,
          watchedDate: f.watchedDate?.toISOString() ?? null,
          seenAt: f.createdAt.toISOString(),
          mediaType: "movie" as const,
        }));

      // Unrated seen TV shows
      const ratedShowIds = new Set(
        await prisma.tVShowRating.findMany({
          where: { userId: user.id, ratingScope: "series" },
          select: { tvShowId: true },
        }).then((rows) => rows.map((r) => r.tvShowId))
      );

      const favoriteShows = await prisma.userFavoriteShow.findMany({
        where: { userId: user.id },
        select: {
          tvShowId: true, createdAt: true,
          tvShow: {
            select: {
              id: true, tmdbId: true, name: true, posterPath: true, firstAirDate: true, voteAverage: true,
              genres: { include: { genre: { select: { name: true } } } },
            },
          },
        },
      });

      const unratedShows = favoriteShows
        .filter((f) => !ratedShowIds.has(f.tvShowId))
        .map((f) => ({
          tmdbId: f.tvShow.tmdbId,
          title: f.tvShow.name,
          posterPath: f.tvShow.posterPath,
          year: f.tvShow.firstAirDate?.slice(0, 4) ?? "",
          genres: f.tvShow.genres.map((g) => g.genre.name),
          voteAverage: f.tvShow.voteAverage ?? null,
          watchedDate: null,
          seenAt: f.createdAt.toISOString(),
          mediaType: "tv" as const,
        }));

      unrated = [...unratedMovies, ...unratedShows].sort(
        (a, b) => new Date(b.seenAt).getTime() - new Date(a.seenAt).getTime()
      );
    }

    // Total count for stats (always return this)
    const movieCount = await prisma.movieRating.count({ where: { userId: user.id } });
    const tvCount = await prisma.tVShowRating.count({ where: { userId: user.id, ratingScope: "series" } });
    const totalCount = movieCount + tvCount;
    const movieAvg = await prisma.movieRating.aggregate({
      where: { userId: user.id, ratistRating: { not: null } },
      _avg: { ratistRating: true },
      _count: { ratistRating: true },
    });
    const tvAvg = await prisma.tVShowRating.aggregate({
      where: { userId: user.id, ratingScope: "series", ratistRating: { not: null } },
      _avg: { ratistRating: true },
      _count: { ratistRating: true },
    });
    const totalScored = (movieAvg._count.ratistRating ?? 0) + (tvAvg._count.ratistRating ?? 0);
    const avgAgg = {
      _avg: {
        ratistRating: totalScored > 0
          ? ((movieAvg._avg.ratistRating ?? 0) * (movieAvg._count.ratistRating ?? 0) + (tvAvg._avg.ratistRating ?? 0) * (tvAvg._count.ratistRating ?? 0)) / totalScored
          : null,
      },
    };

    return NextResponse.json({
      ratings,
      unrated,
      nextCursor,
      hasMore,
      totalCount,
      avgRating: avgAgg._avg.ratistRating ?? null,
    });
  } catch (err) {
    console.error("Ratings list error:", err);
    return NextResponse.json({ ratings: [], unrated: [] });
  }
}
