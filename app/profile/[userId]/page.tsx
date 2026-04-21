import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
export const dynamic = "force-dynamic";
import Image from "next/image";
import ProfileHeader from "@/components/ProfileHeader";
import { getRatingStatus } from "@/lib/rating-status";
import { prisma } from "@/lib/prisma";
import { findSimilarUsers } from "@/lib/profile";
import ProfileTabs from "@/components/ProfileTabs";
import ProfileThemeWrapper from "@/components/ProfileThemeWrapper";
import ProfileThemeButton from "@/components/ProfileThemeButton";
import AdUnit from "@/components/AdUnit";
import type { ProfileTheme } from "@/lib/themes";

interface Props { params: Promise<{ userId: string }> }

const COMPONENT_LABELS: Record<string, string> = {
  narrativeFocused: "Narrative-focused",
  characterFocused: "Character-focused",
  messageFocused: "Message-focused",
  cinematicFocused: "Cinematic-focused",
  performanceFocused: "Performance-focused",
  entertainmentFocused: "Entertainment-focused",
};

const GENRE_LABELS: Record<string, string> = {
  genreAction: "Action / Adventure", genreHorror: "Horror", genreDrama: "Drama",
  genreHistorical: "Historical", genreScifi: "Sci-Fi", genreThriller: "Thriller",
  genreComedy: "Comedy", genreBookAdapt: "Book Adaptation", genreFantasy: "Fantasy",
  genreRomance: "Romance", genreDocumentary: "Documentary", genreFamily: "Family",
  genreFilmNoir: "Film-Noir", genreMusical: "Musical", genreBiopic: "Biopic",
  genreCrime: "Crime", genreWestern: "Western", genreMystery: "Mystery",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { userId } = await params;
  const user = await prisma.user.findFirst({
    where: { OR: [{ id: userId }, { firebaseUid: userId }] },
    select: { name: true, bio: true, firebaseUid: true, profileTheme: true },
  });
  if (!user) return { title: "Profile" };
  const description = user.bio ?? `${user.name}'s movie and TV ratings on The Ratist`;
  const ogImage = `https://www.theratist.com/api/og/profile?userId=${user.firebaseUid}`;
  return {
    title: user.name,
    description,
    alternates: { canonical: `/profile/${userId}` },
    openGraph: {
      title: `${user.name} — The Ratist`,
      description,
      images: [{ url: ogImage, width: 800, height: 420 }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${user.name} — The Ratist`,
      description,
      images: [ogImage],
    },
  };
}

export default async function ProfilePage({ params }: Props) {
  const { userId } = await params;

  const user = await prisma.user.findFirst({
    where: { OR: [{ id: userId }, { firebaseUid: userId }] },
    include: { profile: true },
  });

  if (!user || user.deletedAt) notFound();

  // Fetch all profile data in parallel
  const currentYear = new Date().getFullYear().toString();
  const [
    ratingCount,
    avgRating,
    seenCount,
    watchlistCount,
    tvRatingCount,
    tvSeenCount,
    allRatings,
    seenMovies,
    defaultWatchlistData,
    userWatchlists,
    savedRankings,
    seenShows,
    allTVRatings,
    episodesSeen,
    forumThreadCount,
  ] = await Promise.all([
    prisma.movieRating.count({ where: { userId: user.id } }),
    prisma.movieRating.aggregate({
      where: { userId: user.id, ratistRating: { not: null } },
      _avg: { ratistRating: true },
    }),
    prisma.userFavoriteMovie.count({ where: { userId: user.id } }),
    prisma.watchlistMovie.count({
      where: { watchlist: { userId: user.id, isDefault: true } },
    }),
    prisma.tVShowRating.count({ where: { userId: user.id, ratingScope: "series" } }),
    prisma.userFavoriteShow.count({ where: { userId: user.id } }),
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
        // Required fields for rating status check
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
      if (!wl) return { watchlist: null, movies: [] };
      const movies = await prisma.watchlistMovie.findMany({
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
      });
      return { watchlist: wl, movies };
    }),
    prisma.watchlist.findMany({
      where: { userId: user.id, isDefault: false },
      include: {
        _count: { select: { movies: true } },
        movies: {
          take: 20,
          orderBy: { addedAt: "desc" },
          include: { movie: { select: { tmdbId: true, title: true, posterPath: true } } },
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
    prisma.forumThread.count({ where: { authorId: user.id } }),
  ]);

  // Cine-Q stats
  const cineqAttempts = await prisma.cineQAttempt.findMany({
    where: { userId: user.id, mode: "daily" },
    select: { rawScore: true, difficulty: true },
  });
  const cineqStats = cineqAttempts.length > 0 ? {
    totalQuizzes: cineqAttempts.length,
    weightedLifetime: Math.round(cineqAttempts.reduce((s, a) => s + a.rawScore * (a.difficulty === "hard" ? 2.0 : a.difficulty === "medium" ? 1.5 : 1.0), 0) * 10) / 10,
    avgScore: Math.round(cineqAttempts.reduce((s, a) => s + a.rawScore, 0) / cineqAttempts.length * 10) / 10,
    bestScore: Math.round(Math.max(...cineqAttempts.map((a) => a.rawScore)) * 10) / 10,
  } : null;

  // Movie Club membership
  const movieClubMember = await prisma.movieClubMember.findUnique({ where: { userId: user.id } });
  const movieClubWeeksParticipated = movieClubMember
    ? await prisma.movieClubRating.count({ where: { userId: user.id } })
    : 0;

  // Build episode groups for diary
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

  // Build rating distribution (0-2, 2-4, 4-6, 6-8, 8-10)
  const RANGES = [
    { label: "0–2", min: 0, max: 2 },
    { label: "2–4", min: 2, max: 4 },
    { label: "4–6", min: 4, max: 6 },
    { label: "6–7", min: 6, max: 7 },
    { label: "7–8", min: 7, max: 8 },
    { label: "8–9", min: 8, max: 9 },
    { label: "9–10", min: 9, max: 10.1 },
  ];
  const ratingDistribution = RANGES.map(({ label, min, max }) => ({
    range: label,
    count: allRatings.filter((r) => r.ratistRating !== null && r.ratistRating >= min && r.ratistRating < max).length,
  })).filter((r) => r.count > 0);

  // Build genre breakdown
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

  // Find similar users + recommendations
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

  const avgRatingValue = avgRating._avg.ratistRating;

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

  // Build a tmdbId → ratingStatus map so diary rows can show incomplete status
  const ratingStatusByTmdbId = new Map(
    allRatings.map((r) => [r.movie.tmdbId, getRatingStatus(r)])
  );

  const theme = (user.profileTheme as ProfileTheme | null) ?? null;

  return (
    <ProfileThemeWrapper theme={theme}>
    <div>
      {/* Banner / Header area */}
      <div className="relative">
        {/* Banner image or gradient */}
        {theme?.headerImage ? (
          <div className="h-40 sm:h-52 w-full overflow-hidden relative">
            <Image src={theme.headerImage} alt="" fill className="object-cover" unoptimized style={{ objectPosition: `center ${theme.headerPosition ?? 50}%` }} />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--background)] via-[var(--background)]/60 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-[var(--background)]/80 via-transparent to-transparent" />
          </div>
        ) : (
          <div className="h-32 sm:h-40 w-full bg-gradient-to-br from-[var(--surface)] via-[var(--surface-2)] to-[var(--ratist-red)]" />
        )}

        {/* Profile info — sits below the banner */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-5">
          {/* Theme button row */}
          <div className="flex justify-end mb-3">
            <ProfileThemeButton profileFirebaseUid={user.firebaseUid} currentTheme={theme} />
          </div>
          <div className="flex items-start gap-5 mb-4">
            <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden bg-[var(--profile-surface-2,var(--surface-2))] border-2 border-[var(--border)] shrink-0">
              {user.avatarUrl ? (
                <Image src={user.avatarUrl} alt={user.name} fill sizes="96px" className="object-cover" unoptimized />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-white bg-[var(--profile-accent,var(--ratist-red))]">
                  {user.name[0]?.toUpperCase()}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0 pt-1">
              <ProfileHeader
                userName={user.name}
                bio={user.bio}
                isPrivate={user.isPrivate}
                profileFirebaseUid={user.firebaseUid}
                profileUserId={user.id}
                inviteCode={user.inviteCode}
                ratingCount={ratingCount + tvRatingCount}
                tvRatingCount={tvRatingCount}
                seenCount={seenCount + tvSeenCount}
                tvSeenCount={tvSeenCount}
                avgRating={avgRatingValue}
                memberSince={user.createdAt.getFullYear()}
                hasTheme={!!theme}
                forumThreadCount={forumThreadCount}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">

      <AdUnit slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_PROFILE ?? ""} format="auto" className="mb-4" />

      {/* Tabs */}
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
        watchlistMovies={defaultWatchlistData.movies.map((w) => ({
          tmdbId: w.movie.tmdbId,
          title: w.movie.title,
          posterPath: w.movie.posterPath,
          releaseDate: w.movie.releaseDate,
          voteAverage: w.movie.voteAverage ?? null,
          ratistRating: w.movie.ratings[0]?.ratistRating ?? null,
        }))}
        defaultWatchlistId={defaultWatchlistData.watchlist?.id ?? null}
        defaultWatchlistPrivate={defaultWatchlistData.watchlist?.isPrivate ?? false}
        userWatchlists={userWatchlists.map((wl) => ({
          id: wl.id,
          name: wl.name,
          description: wl.description,
          isPrivate: wl.isPrivate,
          movieCount: wl._count.movies,
          previewMovies: wl.movies.map((m) => ({ tmdbId: m.movie.tmdbId, title: m.movie.title, posterPath: m.movie.posterPath })),
        }))}
        recommendations={recommendations}
        similarUsers={similarUsers}
        episodeGroups={episodeGroups}
        profile={user.profile as Record<string, number> | null}
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
        savedRankings={savedRankings.filter((r) => r.movie).map((r) => {
          const rating = allRatings.find((ar) => ar.movieId === r.movieId);
          return {
            tmdbId: r.movie!.tmdbId,
            title: r.movie!.title,
            posterPath: r.movie!.posterPath,
            year: r.movie!.releaseDate?.slice(0, 4) ?? "",
            ratistRating: rating?.ratistRating ?? null,
          };
        })}
        rankingsYear={currentYear}
        cineqStats={cineqStats}
        movieClubMember={!!movieClubMember}
        movieClubWeeksParticipated={movieClubWeeksParticipated}
      />
      </div>
    </div>
    </ProfileThemeWrapper>
  );
}
