// Server component that does the heavy 16-query Promise.all + CPU shaping
// that powers ProfileTabs. Lifted out of app/profile/[userId]/page.tsx so
// the page header can render immediately while this streams in behind a
// <Suspense>. Behavior is unchanged — same data, same render shape.

import { getRatingStatus } from "@/lib/rating-status";
import { prisma } from "@/lib/prisma";
import { findSimilarUsers } from "@/lib/profile";
import { isSubscriptionActive } from "@/lib/subscription";
import ProfileTabs from "@/components/ProfileTabs";

const COMPONENT_LABELS: Record<string, string> = {
  narrativeFocused: "Narrative-focused",
  characterFocused: "Character-focused",
  messageFocused: "Message-focused",
  cinematicFocused: "Cinematic-focused",
  performanceFocused: "Performance-focused",
  entertainmentFocused: "Entertainment-focused",
};

const GENRE_LABELS: Record<string, string> = {
  genreAction: "Action / Adventure", genreAnimation: "Animation", genreHorror: "Horror",
  genreDrama: "Drama", genreHistorical: "Historical", genreScifi: "Sci-Fi",
  genreThriller: "Thriller", genreComedy: "Comedy", genreBookAdapt: "Book Adaptation",
  genreFantasy: "Fantasy", genreRomance: "Romance", genreDocumentary: "Documentary",
  genreFamily: "Family", genreFilmNoir: "Film-Noir", genreMusical: "Musical",
  genreBiopic: "Biopic", genreCrime: "Crime", genreWestern: "Western",
  genreMystery: "Mystery",
};

const RANGES = [
  { label: "0–2", min: 0, max: 2 },
  { label: "2–4", min: 2, max: 4 },
  { label: "4–6", min: 4, max: 6 },
  { label: "6–7", min: 6, max: 7 },
  { label: "7–8", min: 7, max: 8 },
  { label: "8–9", min: 8, max: 9 },
  { label: "9–10", min: 9, max: 10.1 },
];

interface UserShape {
  id: string;
  firebaseUid: string;
  name: string;
  email: string;
  isPrivate: boolean;
  publicTabs: unknown;
  profile: Record<string, number> | null;
  subscriptionTier: string | null;
  subscriptionStatus: string | null;
  subscriptionExpiry: Date | null;
}

interface ProfileTabsLoaderProps {
  user: UserShape;
  /** Pre-computed in the parent so the header could render synchronously.
   *  Passed in to avoid duplicating these cheap-but-non-zero queries. */
  ratingCount: number;
  tvRatingCount: number;
  seenCount: number;
  tvSeenCount: number;
  watchlistCount: number;
  avgRatingValue: number | null;
}

export default async function ProfileTabsLoader({
  user,
  ratingCount,
  tvRatingCount,
  seenCount,
  tvSeenCount,
  watchlistCount,
  avgRatingValue,
}: ProfileTabsLoaderProps) {
  const currentYear = new Date().getFullYear().toString();

  // Heavy parallel fetch. Anything tab-specific lives here. The header
  // already rendered with its lightweight counts before this kicked off.
  const [
    allRatings,
    seenMovies,
    defaultWatchlistData,
    userWatchlists,
    savedRankings,
    seenShows,
    allTVRatings,
    episodesSeen,
    profileFieldAvgs,
  ] = await Promise.all([
    prisma.movieRating.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        movieId: true,
        ratistRating: true,
        overallRating: true,
        reviewText: true,
        reviewType: true,
        importSource: true,
        createdAt: true,
        plot: true, storytelling: true, pacingClimax: true,
        cinematography: true, artisticEffect: true,
        overallEmotion: true, relatability: true,
        casting: true, actingQuality: true,
        appeal: true,
        movie: {
          select: {
            tmdbId: true,
            title: true,
            posterPath: true,
            voteAverage: true,
            genres: { include: { genre: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.userFavoriteMovie.findMany({
      where: { userId: user.id },
      include: {
        movie: {
          select: {
            tmdbId: true,
            title: true,
            posterPath: true,
            releaseDate: true,
            ratings: { where: { userId: user.id }, select: { ratistRating: true }, take: 1 },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.watchlist.findFirst({ where: { userId: user.id, isDefault: true } }).then(async (wl) => {
      if (!wl) return { watchlist: null, movies: [] as Array<{ movie: { tmdbId: number; title: string; posterPath: string | null; releaseDate: string | null; voteAverage: number | null; ratings: { ratistRating: number | null }[] }; addedAt: Date }>, shows: [] as Array<{ tvShow: { tmdbId: number; name: string; posterPath: string | null; firstAirDate: string | null; voteAverage: number | null; ratings: { ratistRating: number | null }[] }; addedAt: Date }> };
      const [movies, shows] = await Promise.all([
        prisma.watchlistMovie.findMany({
          where: { watchlistId: wl.id },
          include: {
            movie: {
              select: {
                tmdbId: true, title: true, posterPath: true, releaseDate: true,
                voteAverage: true,
                ratings: { where: { userId: user.id }, select: { ratistRating: true }, take: 1 },
              },
            },
          },
          orderBy: { addedAt: "desc" },
        }),
        prisma.watchlistShow.findMany({
          where: { watchlistId: wl.id },
          include: {
            tvShow: {
              select: {
                tmdbId: true, name: true, posterPath: true, firstAirDate: true,
                voteAverage: true,
                ratings: { where: { userId: user.id, ratingScope: "series" }, select: { ratistRating: true }, take: 1 },
              },
            },
          },
          orderBy: { addedAt: "desc" },
        }),
      ]);
      return { watchlist: wl, movies, shows };
    }),
    prisma.watchlist.findMany({
      where: { userId: user.id, isDefault: false },
      include: {
        _count: { select: { movies: true, shows: true } },
        movies: {
          take: 20,
          orderBy: { addedAt: "desc" },
          include: { movie: { select: { tmdbId: true, title: true, posterPath: true } } },
        },
        shows: {
          take: 20,
          orderBy: { addedAt: "desc" },
          include: { tvShow: { select: { tmdbId: true, name: true, posterPath: true } } },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.userMovieRanking.findMany({
      where: { userId: user.id, listKey: currentYear },
      include: {
        movie: { select: { tmdbId: true, title: true, posterPath: true, releaseDate: true } },
      },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.userFavoriteShow.findMany({
      where: { userId: user.id },
      include: {
        tvShow: {
          select: {
            tmdbId: true,
            name: true,
            posterPath: true,
            firstAirDate: true,
            ratings: { where: { userId: user.id, ratingScope: "series" }, select: { ratistRating: true }, take: 1 },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.tVShowRating.findMany({
      where: { userId: user.id, ratingScope: "series" },
      select: {
        id: true,
        tvShowId: true,
        ratistRating: true,
        overallRating: true,
        reviewText: true,
        reviewType: true,
        createdAt: true,
        plot: true, storytelling: true, pacingClimax: true,
        cinematography: true, artisticEffect: true,
        overallEmotion: true, relatability: true,
        casting: true, actingQuality: true,
        appeal: true,
        tvShow: {
          select: {
            tmdbId: true,
            name: true,
            posterPath: true,
            voteAverage: true,
            genres: { include: { genre: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.episodeSeen.findMany({
      where: { userId: user.id },
      orderBy: [{ watchedDate: "desc" }, { createdAt: "desc" }],
    }),
    prisma.movieRating.aggregate({
      where: { userId: user.id, ratistRating: { not: null } },
      _avg: {
        plot: true, premiseOriginality: true, storytelling: true, characterDev: true, pacingClimax: true,
        cinematography: true, locationCost: true, artisticEffect: true, visualEffects: true, musicSound: true,
        overallEmotion: true, relatability: true, meaning: true, movingness: true,
        casting: true, actingQuality: true, dialogueScripting: true, blockingChoreo: true,
        appeal: true, superficialAllure: true, choreography: true,
      },
    }),
  ]);

  // Cine-Q stats
  const cineqAttempts = await prisma.cineQAttempt.findMany({
    where: { userId: user.id, mode: "daily" },
    select: { rawScore: true, difficulty: true },
  });
  const cineqStats = cineqAttempts.length > 0 ? (() => {
    const diffMult = (d: string) => d === "hard" ? 2.0 : d === "medium" ? 1.5 : 1.0;
    const weighted = cineqAttempts.map((a) => a.rawScore * diffMult(a.difficulty));
    return {
      totalQuizzes: cineqAttempts.length,
      weightedLifetime: Math.round(weighted.reduce((s, w) => s + w, 0) * 10) / 10,
      avgScore: Math.round(cineqAttempts.reduce((s, a) => s + a.rawScore, 0) / cineqAttempts.length * 10) / 10,
      avgWeightedScore: Math.round(weighted.reduce((s, w) => s + w, 0) / weighted.length * 10) / 10,
      bestScore: Math.round(Math.max(...cineqAttempts.map((a) => a.rawScore)) * 10) / 10,
      bestWeightedScore: Math.round(Math.max(...weighted) * 10) / 10,
    };
  })() : null;

  // Movie Club membership — active BSP required for the "member" badge.
  const movieClubMemberRow = await prisma.movieClubMember.findUnique({ where: { userId: user.id } });
  const movieClubMember = !!movieClubMemberRow && isSubscriptionActive(user);
  const movieClubWeeksParticipated = movieClubMemberRow
    ? await prisma.movieClubRating.count({ where: { userId: user.id } })
    : 0;

  // Episode groups for diary
  const showTmdbIds = [...new Set(episodesSeen.map((e) => e.showTmdbId))];
  const showMetaMap = new Map<number, { name: string; posterPath: string | null; year: string }>();
  if (showTmdbIds.length > 0) {
    const shows = await prisma.tVShow.findMany({
      where: { tmdbId: { in: showTmdbIds } },
      select: { tmdbId: true, name: true, posterPath: true, firstAirDate: true },
    });
    for (const s of shows) showMetaMap.set(s.tmdbId, { name: s.name, posterPath: s.posterPath, year: (s.firstAirDate ?? "").slice(0, 4) });
  }
  const epGroupMap = new Map<string, typeof episodesSeen>();
  for (const ep of episodesSeen) {
    const dateKey = ep.watchedDate ? ep.watchedDate.toISOString().slice(0, 10) : "undated";
    const key = `${ep.showTmdbId}::${dateKey}`;
    if (!epGroupMap.has(key)) epGroupMap.set(key, []);
    epGroupMap.get(key)!.push(ep);
  }
  const episodeGroups = [...epGroupMap.entries()].map(([, eps]) => {
    const first = eps[0];
    const meta = showMetaMap.get(first.showTmdbId);
    const seasonSet = new Set(eps.map((e) => e.seasonNumber));
    return {
      showTmdbId: first.showTmdbId,
      title: meta?.name ?? "Unknown Show",
      posterPath: meta?.posterPath ?? null,
      year: meta?.year ?? "",
      watchedDate: first.watchedDate?.toISOString().slice(0, 10) ?? null,
      seenAt: eps.reduce((min, e) => e.createdAt < min ? e.createdAt : min, eps[0].createdAt).toISOString(),
      seasonCount: seasonSet.size,
      episodeCount: eps.length,
      seasons: [...seasonSet].sort((a, b) => a - b).map((sn) => ({
        seasonNumber: sn,
        episodeCount: eps.filter((e) => e.seasonNumber === sn).length,
      })),
      episodes: eps.sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber)
        .map((e) => ({ seasonNumber: e.seasonNumber, episodeNumber: e.episodeNumber, name: null as string | null })),
      mediaType: "tv" as const,
      isEpisodeGroup: true as const,
    };
  });

  // Rating distribution
  const ratingDistribution = RANGES.map(({ label, min, max }) => ({
    range: label,
    count: allRatings.filter((r) => r.ratistRating !== null && r.ratistRating >= min && r.ratistRating < max).length,
  })).filter((r) => r.count > 0);

  // Genre breakdown
  const genreMap = new Map<string, { count: number; sum: number }>();
  for (const r of allRatings) {
    for (const mg of r.movie.genres) {
      const entry = genreMap.get(mg.genre.name) ?? { count: 0, sum: 0 };
      entry.count++;
      entry.sum += r.ratistRating ?? 0;
      genreMap.set(mg.genre.name, entry);
    }
  }
  const genreBreakdown = [...genreMap.entries()]
    .map(([name, { count, sum }]) => ({ name, count, avg: sum / count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Similar users + recommendations
  let similarUsers: Awaited<ReturnType<typeof findSimilarUsers>> = [];
  let recommendations: { tmdbId: number; title: string; posterPath: string | null; releaseDate: string | null; voteAverage: number | null; avgRating: number }[] = [];
  try {
    similarUsers = await findSimilarUsers(user.id, 5);
    if (similarUsers.length > 0) {
      const similarIds = similarUsers.map((s) => s.user.id);
      const ratedByUser = new Set(allRatings.map((r) => r.movieId));
      const seenByUser = new Set(seenMovies.map((s) => s.movieId));
      const excludeIds = new Set([...ratedByUser, ...seenByUser]);
      const topRatings = await prisma.movieRating.findMany({
        where: {
          userId: { in: similarIds },
          ratistRating: { gte: 8.0 },
        },
        include: { movie: { select: { id: true, tmdbId: true, title: true, posterPath: true, releaseDate: true, voteAverage: true } } },
        orderBy: { ratistRating: "desc" },
        take: 200,
      });
      const movieMap = new Map<string, { tmdbId: number; title: string; posterPath: string | null; releaseDate: string | null; voteAverage: number | null; sum: number; count: number }>();
      for (const r of topRatings) {
        if (excludeIds.has(r.movieId)) continue;
        const existing = movieMap.get(r.movieId);
        if (existing) { existing.sum += r.ratistRating ?? 0; existing.count++; }
        else movieMap.set(r.movieId, { tmdbId: r.movie.tmdbId, title: r.movie.title, posterPath: r.movie.posterPath, releaseDate: r.movie.releaseDate, voteAverage: r.movie.voteAverage ?? null, sum: r.ratistRating ?? 0, count: 1 });
      }
      recommendations = [...movieMap.values()]
        .map((m) => ({ ...m, avgRating: m.sum / m.count }))
        .sort((a, b) => b.avgRating - a.avgRating)
        .slice(0, 10);
    }
  } catch { /* DB not ready */ }

  // TV rating distribution
  const tvRatingDistribution = RANGES.map(({ label, min, max }) => ({
    range: label,
    count: allTVRatings.filter((r) => r.ratistRating !== null && r.ratistRating >= min && r.ratistRating < max).length,
  })).filter((r) => r.count > 0);

  // TV genre breakdown
  const tvGenreMap = new Map<string, { count: number; sum: number }>();
  for (const r of allTVRatings) {
    for (const sg of r.tvShow.genres) {
      const entry = tvGenreMap.get(sg.genre.name) ?? { count: 0, sum: 0 };
      entry.count++;
      entry.sum += r.ratistRating ?? 0;
      tvGenreMap.set(sg.genre.name, entry);
    }
  }
  const tvGenreBreakdown = [...tvGenreMap.entries()]
    .map(([name, { count, sum }]) => ({ name, count, avg: sum / count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // TV average rating
  const tvAvgRating = allTVRatings.length > 0
    ? allTVRatings.reduce((sum, r) => sum + (r.ratistRating ?? 0), 0) / allTVRatings.filter((r) => r.ratistRating != null).length
    : null;

  // Episode stats
  const totalEpisodesWatched = episodesSeen.length;

  // tmdbId → ratingStatus map for diary row state
  const ratingStatusByTmdbId = new Map(
    allRatings.map((r) => [r.movie.tmdbId, getRatingStatus(r)])
  );

  return (
    <ProfileTabs
      ratings={[
        ...allRatings.map((r) => ({
          id: r.id,
          tmdbId: r.movie.tmdbId,
          title: r.movie.title,
          posterPath: r.movie.posterPath,
          voteAverage: r.movie.voteAverage ?? null,
          ratistRating: r.ratistRating,
          reviewText: r.reviewText,
          createdAt: r.createdAt.toISOString(),
          ratingStatus: getRatingStatus(r),
        })),
        ...allTVRatings.map((r) => ({
          id: r.id,
          tmdbId: r.tvShow.tmdbId,
          title: r.tvShow.name,
          posterPath: r.tvShow.posterPath,
          voteAverage: r.tvShow.voteAverage ?? null,
          ratistRating: r.ratistRating,
          reviewText: r.reviewText,
          createdAt: r.createdAt.toISOString(),
          ratingStatus: getRatingStatus(r),
          mediaType: "tv" as const,
        })),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())}
      seenMovies={[
        ...seenMovies.map((s) => ({
          tmdbId: s.movie.tmdbId,
          title: s.movie.title,
          posterPath: s.movie.posterPath,
          releaseDate: s.movie.releaseDate,
          seenAt: s.createdAt.toISOString(),
          watchedDate: s.watchedDate?.toISOString() ?? null,
          ratistRating: s.movie.ratings[0]?.ratistRating ?? null,
          ratingStatus: ratingStatusByTmdbId.get(s.movie.tmdbId) ?? null,
        })),
        ...seenShows.map((s) => ({
          tmdbId: s.tvShow.tmdbId,
          title: s.tvShow.name,
          posterPath: s.tvShow.posterPath,
          releaseDate: s.tvShow.firstAirDate,
          seenAt: s.createdAt.toISOString(),
          watchedDate: null as string | null,
          ratistRating: s.tvShow.ratings[0]?.ratistRating ?? null,
          ratingStatus: null as "complete" | "incomplete" | "imported" | null,
          mediaType: "tv" as const,
        })),
      ].sort((a, b) => new Date(b.seenAt).getTime() - new Date(a.seenAt).getTime())}
      watchlistMovies={[
        ...defaultWatchlistData.movies.map((w) => ({
          tmdbId: w.movie.tmdbId,
          title: w.movie.title,
          posterPath: w.movie.posterPath,
          releaseDate: w.movie.releaseDate,
          voteAverage: w.movie.voteAverage ?? null,
          ratistRating: w.movie.ratings[0]?.ratistRating ?? null,
          mediaType: "movie" as const,
          addedAt: w.addedAt.toISOString(),
        })),
        ...defaultWatchlistData.shows.map((w) => ({
          tmdbId: w.tvShow.tmdbId,
          title: w.tvShow.name,
          posterPath: w.tvShow.posterPath,
          releaseDate: w.tvShow.firstAirDate,
          voteAverage: w.tvShow.voteAverage ?? null,
          ratistRating: w.tvShow.ratings[0]?.ratistRating ?? null,
          mediaType: "tv" as const,
          addedAt: w.addedAt.toISOString(),
        })),
      ]
        .sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime())
        .map(({ addedAt: _, ...rest }) => rest)}
      defaultWatchlistId={defaultWatchlistData.watchlist?.id ?? null}
      defaultWatchlistPrivate={defaultWatchlistData.watchlist?.isPrivate ?? false}
      userWatchlists={userWatchlists.map((wl) => ({
        id: wl.id,
        name: wl.name,
        description: wl.description,
        isPrivate: wl.isPrivate,
        movieCount: wl._count.movies + wl._count.shows,
        previewMovies: [
          ...wl.movies.map((m) => ({
            tmdbId: m.movie.tmdbId,
            title: m.movie.title,
            posterPath: m.movie.posterPath,
            mediaType: "movie" as const,
            addedAt: m.addedAt.toISOString(),
          })),
          ...wl.shows.map((s) => ({
            tmdbId: s.tvShow.tmdbId,
            title: s.tvShow.name,
            posterPath: s.tvShow.posterPath,
            mediaType: "tv" as const,
            addedAt: s.addedAt.toISOString(),
          })),
        ]
          .sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime())
          .slice(0, 20)
          .map(({ addedAt: _, ...rest }) => rest),
      }))}
      recommendations={recommendations}
      similarUsers={similarUsers}
      episodeGroups={episodeGroups}
      profile={user.profile}
      profileFieldAvgs={profileFieldAvgs._avg as Record<string, number | null>}
      stats={{
        ratingCount: ratingCount + tvRatingCount,
        movieRatingCount: ratingCount,
        tvRatingCount,
        avgRating: avgRatingValue,
        tvAvgRating: tvAvgRating,
        seenCount: seenCount + tvSeenCount,
        movieSeenCount: seenCount,
        tvSeenCount,
        watchlistCount,
        ratingDistribution,
        tvRatingDistribution,
        genreBreakdown,
        tvGenreBreakdown,
        totalEpisodesWatched,
      }}
      componentLabels={COMPONENT_LABELS}
      genreLabels={GENRE_LABELS}
      profileFirebaseUid={user.firebaseUid}
      profileUserId={user.id}
      profileUserName={user.name}
      isPrivate={user.isPrivate}
      publicTabs={user.publicTabs as Record<string, boolean> ?? {}}
      siteUrl={process.env.NEXT_PUBLIC_SITE_URL ?? "https://theratist.com"}
      savedRankings={(() => {
        // Filter saved-order rows against the user's current seen +
        // rated state — items unmarked seen shouldn't show in the tab.
        const validMovieIds = new Set<string>([
          ...seenMovies.map((s) => s.movieId),
          ...allRatings.map((r) => r.movieId),
        ]);
        return savedRankings
          .filter((r) => r.movie && r.movieId && validMovieIds.has(r.movieId))
          .map((r) => {
            const rating = allRatings.find((ar) => ar.movieId === r.movieId);
            return {
              tmdbId: r.movie!.tmdbId,
              title: r.movie!.title,
              posterPath: r.movie!.posterPath,
              year: r.movie!.releaseDate?.slice(0, 4) ?? "",
              ratistRating: rating?.ratistRating ?? null,
            };
          });
      })()}
      rankingsYear={currentYear}
      cineqStats={cineqStats}
      movieClubMember={movieClubMember}
      movieClubWeeksParticipated={movieClubWeeksParticipated}
    />
  );
}
