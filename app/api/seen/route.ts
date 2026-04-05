import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ movies: [], episodeGroups: [] });

    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) return NextResponse.json({ movies: [], episodeGroups: [] });

    const [favorites, watchLog, favoriteShows] = await Promise.all([
      prisma.userFavoriteMovie.findMany({
        where: { userId: user.id },
        include: {
          movie: {
            select: {
              id: true, tmdbId: true, title: true, posterPath: true, releaseDate: true, voteAverage: true,
              genres: { include: { genre: { select: { name: true } } } },
              ratings: { where: { userId: user.id }, select: { ratistRating: true }, take: 1 },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.userWatchLog.findMany({
        where: { userId: user.id, isRewatch: true },
        include: {
          movie: {
            select: {
              id: true, tmdbId: true, title: true, posterPath: true, releaseDate: true, voteAverage: true,
              genres: { include: { genre: { select: { name: true } } } },
              ratings: { where: { userId: user.id }, select: { ratistRating: true }, take: 1 },
            },
          },
        },
        orderBy: { watchedDate: "desc" },
      }),
      prisma.userFavoriteShow.findMany({
        where: { userId: user.id },
        include: {
          tvShow: {
            select: {
              id: true, tmdbId: true, name: true, posterPath: true, firstAirDate: true, voteAverage: true,
              genres: { include: { genre: { select: { name: true } } } },
              ratings: { where: { userId: user.id, ratingScope: "series" }, select: { ratistRating: true }, take: 1 },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    // First watches from UserFavoriteMovie
    const movies = favorites.map((f) => ({
      id: f.movie.id,
      logId: null as string | null,
      tmdbId: f.movie.tmdbId,
      title: f.movie.title,
      posterPath: f.movie.posterPath,
      year: f.movie.releaseDate?.slice(0, 4) ?? "",
      voteAverage: f.movie.voteAverage ?? null,
      genres: f.movie.genres.map((g) => g.genre.name),
      ratistRating: f.movie.ratings[0]?.ratistRating ?? null,
      seenAt: f.createdAt,
      watchedDate: f.watchedDate,
      isRewatch: false,
      notes: null as string | null,
      mediaType: "movie" as const,
    }));

    // Rewatches from UserWatchLog
    const rewatches = watchLog.map((w) => ({
      id: w.movie.id,
      logId: w.id,
      tmdbId: w.movie.tmdbId,
      title: w.movie.title,
      posterPath: w.movie.posterPath,
      year: w.movie.releaseDate?.slice(0, 4) ?? "",
      voteAverage: w.movie.voteAverage ?? null,
      genres: w.movie.genres.map((g) => g.genre.name),
      ratistRating: w.movie.ratings[0]?.ratistRating ?? null,
      seenAt: w.createdAt,
      watchedDate: w.watchedDate,
      isRewatch: true,
      notes: w.notes,
      mediaType: "movie" as const,
    }));

    // TV Shows from UserFavoriteShow
    const shows = favoriteShows.map((s) => ({
      id: s.tvShow.id,
      logId: null as string | null,
      tmdbId: s.tvShow.tmdbId,
      title: s.tvShow.name,
      posterPath: s.tvShow.posterPath,
      year: s.tvShow.firstAirDate?.slice(0, 4) ?? "",
      voteAverage: s.tvShow.voteAverage ?? null,
      genres: s.tvShow.genres.map((g) => g.genre.name),
      ratistRating: s.tvShow.ratings[0]?.ratistRating ?? null,
      seenAt: s.createdAt,
      watchedDate: null as Date | null,
      isRewatch: false,
      notes: null as string | null,
      mediaType: "tv" as const,
    }));

    // Episode-level seen data for diary grouping
    const episodesSeen = await prisma.episodeSeen.findMany({
      where: { userId: user.id },
      orderBy: [{ watchedDate: "desc" }, { createdAt: "desc" }],
    });

    // Build episode groups: group by (showTmdbId, watchedDate)
    const uniqueShowTmdbIds = [...new Set(episodesSeen.map((e) => e.showTmdbId))];

    const [showMeta, episodeMeta] = await Promise.all([
      uniqueShowTmdbIds.length > 0
        ? prisma.tVShow.findMany({
            where: { tmdbId: { in: uniqueShowTmdbIds } },
            select: { tmdbId: true, name: true, posterPath: true, firstAirDate: true },
          })
        : Promise.resolve([]),
      uniqueShowTmdbIds.length > 0
        ? prisma.tVEpisode.findMany({
            where: {
              season: { tvShow: { tmdbId: { in: uniqueShowTmdbIds } } },
            },
            select: {
              episodeNumber: true,
              name: true,
              season: {
                select: { seasonNumber: true, tvShow: { select: { tmdbId: true } } },
              },
            },
          })
        : Promise.resolve([]),
    ]);

    const showMap = new Map(showMeta.map((s) => [s.tmdbId, s]));

    // Build a lookup: showTmdbId -> seasonNumber -> episodeNumber -> name
    const epNameMap = new Map<number, Map<number, Map<number, string | null>>>();
    for (const ep of episodeMeta) {
      const showId = ep.season.tvShow.tmdbId;
      if (!epNameMap.has(showId)) epNameMap.set(showId, new Map());
      const seasonMap = epNameMap.get(showId)!;
      if (!seasonMap.has(ep.season.seasonNumber)) seasonMap.set(ep.season.seasonNumber, new Map());
      seasonMap.get(ep.season.seasonNumber)!.set(ep.episodeNumber, ep.name);
    }

    // Group episodes by (showTmdbId, watchedDateString)
    const groupKey = (e: (typeof episodesSeen)[0]) => {
      const dateStr = e.watchedDate
        ? e.watchedDate.toISOString().slice(0, 10)
        : "undated";
      return `${e.showTmdbId}::${dateStr}`;
    };

    const groupMap = new Map<string, (typeof episodesSeen)[0][]>();
    for (const ep of episodesSeen) {
      const key = groupKey(ep);
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(ep);
    }

    const episodeGroups = [...groupMap.entries()].map(([, eps]) => {
      const first = eps[0];
      const show = showMap.get(first.showTmdbId);
      const dateStr = first.watchedDate
        ? first.watchedDate.toISOString().slice(0, 10)
        : null;

      // Seasons breakdown
      const seasonCounts = new Map<number, number>();
      for (const ep of eps) {
        seasonCounts.set(ep.seasonNumber, (seasonCounts.get(ep.seasonNumber) ?? 0) + 1);
      }
      const seasons = [...seasonCounts.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([seasonNumber, episodeCount]) => ({ seasonNumber, episodeCount }));

      // Earliest createdAt in the group
      const earliestCreatedAt = eps.reduce(
        (min, ep) => (ep.createdAt < min ? ep.createdAt : min),
        eps[0].createdAt,
      );

      return {
        showTmdbId: first.showTmdbId,
        title: show?.name ?? `Show #${first.showTmdbId}`,
        posterPath: show?.posterPath ?? null,
        year: show?.firstAirDate?.slice(0, 4) ?? "",
        watchedDate: dateStr,
        seenAt: earliestCreatedAt.toISOString(),
        seasonCount: seasonCounts.size,
        episodeCount: eps.length,
        seasons,
        episodes: eps
          .sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber)
          .map((ep) => ({
            seasonNumber: ep.seasonNumber,
            episodeNumber: ep.episodeNumber,
            name: epNameMap.get(ep.showTmdbId)?.get(ep.seasonNumber)?.get(ep.episodeNumber) ?? null,
          })),
        mediaType: "tv" as const,
        isEpisodeGroup: true as const,
      };
    });

    return NextResponse.json({ movies: [...movies, ...rewatches, ...shows], episodeGroups });
  } catch (err) {
    console.error("Seen list error:", err);
    return NextResponse.json({ movies: [], episodeGroups: [] });
  }
}
