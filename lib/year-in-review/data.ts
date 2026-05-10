/**
 * Year-in-Review data fetcher. Single entry point — page calls
 * getYearInReview(userId, year) and renders from the returned shape.
 *
 * Covers movies + shows. Shows count when the user has any episode
 * seen in the year; show ratings are pulled at series scope regardless
 * of when the rating was made (a 2024 rating on a show binged in 2026
 * still counts toward the 2026 ranking).
 *
 * Returns null if the user has fewer than MIN_TITLES rated titles —
 * page treats that as a 404 / "not enough data yet" state.
 */

import { prisma } from "@/lib/prisma";
import { cinephileType, type CinephileType } from "./classify";

export const MIN_TITLES_FOR_YIR = 5;

// Movie crew jobs we treat as "director" for the most-watched-person slot.
const MOVIE_DIRECTOR_JOBS = new Set(["Director"]);
// Show crew jobs we treat as "showrunner" / "creator" equivalents.
const SHOW_CREATOR_JOBS = new Set(["Creator", "Showrunner", "Executive Producer"]);

export interface YearInReviewData {
  /** User-display fields. */
  user: { id: string; firebaseUid: string; name: string; avatarUrl: string | null };
  year: number;

  /** Headline counts. */
  movieCount: number;
  showCount: number;
  episodeCount: number;
  ratedCount: number;
  totalHours: number;

  /** Rating aggregates. */
  avgRating: number | null;
  ratingStdDev: number | null;
  categoryAvgs: { label: string; avg: number }[];
  bestCategory: { label: string; avg: number } | null;
  worstCategory: { label: string; avg: number } | null;

  /** Identity. */
  cinephile: CinephileType;

  /** Taste-profile metrics. */
  genreDiversity: number;                    // 0-100 (Shannon entropy normalized)
  avgMovieAge: number | null;                // years between release and now
  guiltyPleasure: { name: string; count: number; avg: number } | null;
  avgPerMonth: number | null;                // watches/month across the year's dated span

  /** Top picks (movies + shows blended, ranked by user's ratistRating). */
  topPicks: RatedItem[];

  /** Most controversial — biggest absolute delta vs community avg. */
  controversial: ControversialTake | null;

  /**
   * Per-category bars for the controversial take. Pulled from the
   * user's full Ratist rating when they did one; falls back to the
   * community averages on that title when the user only submitted a
   * quick (basic) rating without category scores.
   */
  controversialCategories: {
    scores: { label: string; avg: number }[];
    isUserScored: boolean;
  } | null;

  /** Closest agreement with the community. */
  mostShared: ControversialTake | null;

  /** Highest user rating on an item with the fewest community ratings. */
  hiddenGem: ControversialTake | null;

  /** Lowest user rating in the year. */
  disappointed: RatedItem | null;

  /** Year-over-year comparison (null if no prior year data). */
  vsLastYear: VsLastYear | null;

  /** Genre breakdown (top 8). */
  topGenres: { name: string; count: number }[];

  /** Decade distribution from release/first-air dates. */
  decades: { decade: string; count: number }[];

  /** Top directors/showrunners by count of titles. */
  topPeople: { name: string; tmdbId: number; count: number; role: "director" | "creator" }[];

  /** Top actors by appearance count across movies + shows. */
  topActors: { name: string; tmdbId: number; count: number }[];

  /** Followed user with the closest taste profile. Null if no qualifying match. */
  tasteTwin: { firebaseUid: string; name: string; avatarUrl: string | null; similarity: number } | null;

  /** Busiest month label + count. */
  busiestMonth: { name: string; count: number } | null;

  /** Top 3 most-watched months — for the chapter 4 bar chart. */
  topMonths: { name: string; count: number }[];

  /** Longest run of consecutive days with at least one watch. */
  longestStreak: { days: number; startDate: string; endDate: string } | null;

  /** Movies only: first-watches vs rewatches. */
  discoveryRate: { firstWatches: number; rewatches: number } | null;

  /** Full poster wall — everything watched this year (movies + shows). */
  posterWall: { tmdbId: number; title: string; posterPath: string | null; mediaType: "movie" | "tv" }[];

  /** Last update timestamp — most recent watchedDate or rating updatedAt. */
  updatedAt: Date;
}

export interface RatedItem {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  releaseYear: string | null;
  rating: number;
  mediaType: "movie" | "tv";
}

export interface ControversialTake {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  mediaType: "movie" | "tv";
  userRating: number;
  communityAvg: number;
  communityCount: number;
  diff: number;
}

export interface VsLastYear {
  year: number;
  movieDelta: number;
  showDelta: number;
  episodeDelta: number;
  hoursDelta: number;
  avgRatingDelta: number | null;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export async function getYearInReview(userId: string, year: number): Promise<YearInReviewData | null> {
  const yearStart = new Date(`${year}-01-01T00:00:00.000Z`);
  const yearEnd = new Date(`${year + 1}-01-01T00:00:00.000Z`);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, firebaseUid: true, name: true, avatarUrl: true },
  });
  if (!user) return null;

  // ── Fetch the year's raw data in parallel ────────────────────────
  const [moviesSeen, episodesSeen, watchLogs, lastYearMovies, lastYearEpisodes] = await Promise.all([
    prisma.userFavoriteMovie.findMany({
      where: { userId, watchedDate: { gte: yearStart, lt: yearEnd } },
      include: {
        movie: {
          select: {
            tmdbId: true, title: true, posterPath: true, releaseDate: true, runtime: true,
            genres: { include: { genre: true } },
            // Pull both director crew and top-billed actors in one batch.
            // Filtering happens client-side so we keep the join minimal.
            cast: {
              where: {
                OR: [
                  { job: { in: [...MOVIE_DIRECTOR_JOBS] } },
                  { creditType: "cast", castOrder: { lt: 5 } },
                ],
              },
              include: { celebrity: { select: { name: true, tmdbId: true } } },
            },
            ratings: {
              where: { userId },
              select: {
                ratistRating: true, storyScore: true, styleScore: true,
                emotiveScore: true, actingScore: true, entertainScore: true,
                updatedAt: true,
              },
              take: 1,
            },
          },
        },
      },
      orderBy: { watchedDate: "desc" },
    }),
    prisma.episodeSeen.findMany({
      where: { userId, watchedDate: { gte: yearStart, lt: yearEnd } },
      orderBy: { watchedDate: "asc" },
    }),
    prisma.userWatchLog.findMany({
      where: { userId, watchedDate: { gte: yearStart, lt: yearEnd } },
      select: { movieId: true, isRewatch: true },
    }),
    // Last-year slim totals for vs-last-year card.
    prisma.userFavoriteMovie.findMany({
      where: {
        userId,
        watchedDate: { gte: new Date(`${year - 1}-01-01T00:00:00.000Z`), lt: yearStart },
      },
      include: {
        movie: { select: { runtime: true, ratings: { where: { userId }, select: { ratistRating: true }, take: 1 } } },
      },
    }),
    prisma.episodeSeen.findMany({
      where: {
        userId,
        watchedDate: { gte: new Date(`${year - 1}-01-01T00:00:00.000Z`), lt: yearStart },
      },
      select: { showTmdbId: true, seasonNumber: true, episodeNumber: true },
    }),
  ]);

  // ── Show details for shows with episodes watched this year ───────
  const showTmdbIds = Array.from(new Set(episodesSeen.map((e) => e.showTmdbId)));
  const shows = showTmdbIds.length === 0 ? [] : await prisma.tVShow.findMany({
    where: { tmdbId: { in: showTmdbIds } },
    select: {
      id: true, tmdbId: true, name: true, posterPath: true, firstAirDate: true, episodeRunTime: true,
      genres: { include: { genre: true } },
      cast: {
        where: {
          OR: [
            { creditType: "crew", job: { in: [...SHOW_CREATOR_JOBS] } },
            { creditType: "cast", castOrder: { lt: 5 } },
          ],
        },
        include: { celebrity: { select: { name: true, tmdbId: true } } },
      },
    },
  });
  const showById = new Map(shows.map((s) => [s.tmdbId, s]));
  const showByDbId = new Map(shows.map((s) => [s.id, s]));

  // Series-level show ratings for these shows.
  const showDbIds = shows.map((s) => s.id);
  const showRatings = showDbIds.length === 0 ? [] : await prisma.tVShowRating.findMany({
    where: { userId, tvShowId: { in: showDbIds }, ratingScope: "series" },
    select: {
      tvShowId: true, ratistRating: true,
      storyScore: true, styleScore: true, emotiveScore: true, actingScore: true, entertainScore: true,
      updatedAt: true,
    },
  });
  const showRatingByDbId = new Map(showRatings.map((r) => [r.tvShowId, r]));

  // Per-episode runtime lookup for hours calculation.
  // Fall back to TVShow.episodeRunTime if a specific episode lacks runtime.
  // We don't want to fetch every TVEpisode row for hours — using the
  // show-level average is good enough and avoids an extra query.
  let episodeHours = 0;
  for (const ep of episodesSeen) {
    const show = showById.get(ep.showTmdbId);
    episodeHours += (show?.episodeRunTime ?? 30) / 60;
  }

  // ── Counts ───────────────────────────────────────────────────────
  const movieCount = moviesSeen.length;
  const showCount = showTmdbIds.length;
  const episodeCount = episodesSeen.length;
  const totalMovieMin = moviesSeen.reduce((s, m) => s + (m.movie.runtime ?? 0), 0);
  const totalHours = Math.round(totalMovieMin / 60 + episodeHours);

  // ── Rated items (movies with ratings + shows with series rating) ─
  const ratedMovies: RatedItem[] = moviesSeen
    .filter((m) => m.movie.ratings[0]?.ratistRating != null)
    .map((m) => ({
      tmdbId: m.movie.tmdbId,
      title: m.movie.title,
      posterPath: m.movie.posterPath,
      releaseYear: m.movie.releaseDate?.slice(0, 4) ?? null,
      rating: m.movie.ratings[0]!.ratistRating!,
      mediaType: "movie" as const,
    }));
  const ratedShows: RatedItem[] = shows
    .filter((s) => showRatingByDbId.get(s.id)?.ratistRating != null)
    .map((s) => ({
      tmdbId: s.tmdbId,
      title: s.name,
      posterPath: s.posterPath,
      releaseYear: s.firstAirDate?.slice(0, 4) ?? null,
      rating: showRatingByDbId.get(s.id)!.ratistRating!,
      mediaType: "tv" as const,
    }));
  const ratedItems = [...ratedMovies, ...ratedShows];
  const ratedCount = ratedItems.length;

  // Threshold check — too thin to render a meaningful YiR.
  if (movieCount + showCount < MIN_TITLES_FOR_YIR) return null;

  // ── Rating aggregates ────────────────────────────────────────────
  const ratings = ratedItems.map((r) => r.rating);
  const avgRating = ratings.length > 0
    ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
    : null;
  const ratingStdDev = ratings.length >= 2 && avgRating != null
    ? Math.sqrt(ratings.reduce((s, v) => s + (v - avgRating) ** 2, 0) / ratings.length)
    : null;

  // Category averages — blend movie + show category scores.
  const categoryFields: { key: "storyScore" | "styleScore" | "emotiveScore" | "actingScore" | "entertainScore"; label: string }[] = [
    { key: "storyScore", label: "Story & Writing" },
    { key: "styleScore", label: "Style & Craft" },
    { key: "emotiveScore", label: "Emotion & Meaning" },
    { key: "actingScore", label: "Performance" },
    { key: "entertainScore", label: "Entertainment" },
  ];
  const movieRatingRows = moviesSeen.map((m) => m.movie.ratings[0]).filter((r): r is NonNullable<typeof r> => r != null);
  const showRatingRows = showRatings;
  const categoryAvgs = categoryFields
    .map(({ key, label }) => {
      const vals: number[] = [];
      for (const r of movieRatingRows) if (r[key] != null) vals.push(r[key] as number);
      for (const r of showRatingRows) if (r[key] != null) vals.push(r[key] as number);
      const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      return avg != null ? { label, avg } : null;
    })
    .filter((c): c is { label: string; avg: number } => c != null);
  const bestCategory = categoryAvgs.length > 0
    ? categoryAvgs.reduce((a, b) => (a.avg > b.avg ? a : b))
    : null;
  const worstCategory = categoryAvgs.length >= 2
    ? categoryAvgs.reduce((a, b) => (a.avg < b.avg ? a : b))
    : null;

  // ── Top 5 picks ──────────────────────────────────────────────────
  const topPicks = [...ratedItems].sort((a, b) => b.rating - a.rating).slice(0, 5);

  // ── Worst pick (disappointed) ────────────────────────────────────
  const sortedAsc = [...ratedItems].sort((a, b) => a.rating - b.rating);
  const disappointed = sortedAsc.length > 0 && sortedAsc[0].rating < 6 && sortedAsc[0] !== topPicks[0]
    ? sortedAsc[0] : null;

  // ── Genre mix (blended movies + shows) ───────────────────────────
  const genreCount = new Map<string, number>();
  for (const m of moviesSeen) {
    for (const mg of m.movie.genres) {
      genreCount.set(mg.genre.name, (genreCount.get(mg.genre.name) ?? 0) + 1);
    }
  }
  for (const s of shows) {
    for (const sg of s.genres) {
      genreCount.set(sg.genre.name, (genreCount.get(sg.genre.name) ?? 0) + 1);
    }
  }
  const topGenres = [...genreCount.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // ── Decade distribution ──────────────────────────────────────────
  const decadeCount = new Map<string, number>();
  function addDecade(year: number | null) {
    if (year == null || isNaN(year)) return;
    const decade = `${Math.floor(year / 10) * 10}s`;
    decadeCount.set(decade, (decadeCount.get(decade) ?? 0) + 1);
  }
  for (const m of moviesSeen) addDecade(parseInt(m.movie.releaseDate?.slice(0, 4) ?? ""));
  for (const s of shows) addDecade(parseInt(s.firstAirDate?.slice(0, 4) ?? ""));
  const decades = [...decadeCount.entries()]
    .map(([decade, count]) => ({ decade, count }))
    .sort((a, b) => a.decade.localeCompare(b.decade));

  // ── Most-watched directors / showrunners ─────────────────────────
  // We now pull both crew (directors) and top-billed cast (actors) in
  // the same query; split them apart here.
  const personCount = new Map<string, { name: string; tmdbId: number; count: number; role: "director" | "creator" }>();
  const actorCount = new Map<number, { name: string; tmdbId: number; count: number }>();

  for (const m of moviesSeen) {
    for (const c of m.movie.cast) {
      if (c.creditType === "crew" && MOVIE_DIRECTOR_JOBS.has(c.job)) {
        const key = `dir:${c.celebrity.tmdbId}`;
        const e = personCount.get(key) ?? { name: c.celebrity.name, tmdbId: c.celebrity.tmdbId, count: 0, role: "director" as const };
        e.count++;
        personCount.set(key, e);
      } else if (c.creditType === "cast") {
        const e = actorCount.get(c.celebrity.tmdbId) ?? { name: c.celebrity.name, tmdbId: c.celebrity.tmdbId, count: 0 };
        e.count++;
        actorCount.set(c.celebrity.tmdbId, e);
      }
    }
  }
  for (const s of shows) {
    for (const c of s.cast) {
      if (c.creditType === "crew" && SHOW_CREATOR_JOBS.has(c.job)) {
        const key = `cre:${c.celebrity.tmdbId}`;
        const e = personCount.get(key) ?? { name: c.celebrity.name, tmdbId: c.celebrity.tmdbId, count: 0, role: "creator" as const };
        e.count++;
        personCount.set(key, e);
      } else if (c.creditType === "cast") {
        const e = actorCount.get(c.celebrity.tmdbId) ?? { name: c.celebrity.name, tmdbId: c.celebrity.tmdbId, count: 0 };
        e.count++;
        actorCount.set(c.celebrity.tmdbId, e);
      }
    }
  }
  const topPeople = [...personCount.values()]
    .filter((p) => p.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
  const topPersonCount = topPeople[0]?.count ?? 0;
  const topActors = [...actorCount.values()]
    .filter((a) => a.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // ── Community averages for controversy / hidden gem / agreement ──
  const ratedMovieDbIds = moviesSeen.filter((m) => m.movie.ratings[0]?.ratistRating != null).map((m) => m.movieId);
  const ratedShowDbIds = ratedShows.map((s) => showDbIds.find((id) => showByDbId.get(id)?.tmdbId === s.tmdbId)!).filter(Boolean);

  const [movieCommunity, showCommunity] = await Promise.all([
    ratedMovieDbIds.length === 0 ? Promise.resolve([]) : prisma.movieRating.groupBy({
      by: ["movieId"],
      where: { movieId: { in: ratedMovieDbIds }, ratistRating: { not: null } },
      _avg: { ratistRating: true },
      _count: { ratistRating: true },
    }),
    ratedShowDbIds.length === 0 ? Promise.resolve([]) : prisma.tVShowRating.groupBy({
      by: ["tvShowId"],
      where: { tvShowId: { in: ratedShowDbIds }, ratingScope: "series", ratistRating: { not: null } },
      _avg: { ratistRating: true },
      _count: { ratistRating: true },
    }),
  ]);

  type CommunityRow = { avg: number; count: number };
  const movieCommunityMap = new Map<string, CommunityRow>(
    movieCommunity.filter((c) => (c._count.ratistRating ?? 0) >= 2)
      .map((c) => [c.movieId, { avg: c._avg.ratistRating!, count: c._count.ratistRating! }])
  );
  const showCommunityMap = new Map<string, CommunityRow>(
    showCommunity.filter((c) => (c._count.ratistRating ?? 0) >= 2)
      .map((c) => [c.tvShowId, { avg: c._avg.ratistRating!, count: c._count.ratistRating! }])
  );

  // Build a unified list of {ratedItem, communityRow} for controversy/agreement/gem.
  type Entry = { item: RatedItem; comm: CommunityRow | null; dbId: string };
  const entries: Entry[] = [];
  for (const m of moviesSeen) {
    const userR = m.movie.ratings[0]?.ratistRating;
    if (userR == null) continue;
    entries.push({
      item: {
        tmdbId: m.movie.tmdbId, title: m.movie.title, posterPath: m.movie.posterPath,
        releaseYear: m.movie.releaseDate?.slice(0, 4) ?? null,
        rating: userR, mediaType: "movie",
      },
      comm: movieCommunityMap.get(m.movieId) ?? null,
      dbId: m.movieId,
    });
  }
  for (const s of shows) {
    const r = showRatingByDbId.get(s.id);
    if (r?.ratistRating == null) continue;
    entries.push({
      item: {
        tmdbId: s.tmdbId, title: s.name, posterPath: s.posterPath,
        releaseYear: s.firstAirDate?.slice(0, 4) ?? null,
        rating: r.ratistRating, mediaType: "tv",
      },
      comm: showCommunityMap.get(s.id) ?? null,
      dbId: s.id,
    });
  }

  function toTake(e: Entry): ControversialTake {
    return {
      tmdbId: e.item.tmdbId,
      title: e.item.title,
      posterPath: e.item.posterPath,
      mediaType: e.item.mediaType,
      userRating: e.item.rating,
      communityAvg: e.comm!.avg,
      communityCount: e.comm!.count,
      diff: Math.abs(e.item.rating - e.comm!.avg),
    };
  }

  const withComm = entries.filter((e) => e.comm != null);
  const controversialEntry = withComm.reduce<Entry | null>(
    (best, e) => (best == null || Math.abs(e.item.rating - e.comm!.avg) > Math.abs(best.item.rating - best.comm!.avg) ? e : best),
    null,
  );
  const mostSharedEntry = withComm.reduce<Entry | null>(
    (best, e) => (best == null || Math.abs(e.item.rating - e.comm!.avg) < Math.abs(best.item.rating - best.comm!.avg) ? e : best),
    null,
  );
  const hiddenGemEntry = withComm
    .filter((e) => e.comm!.count <= 10 && e.item.rating >= 8)
    .sort((a, b) => b.item.rating - a.item.rating)[0] ?? null;

  const controversial = controversialEntry && controversialEntry.comm != null && Math.abs(controversialEntry.item.rating - controversialEntry.comm.avg) >= 1.5
    ? toTake(controversialEntry) : null;
  const mostShared = mostSharedEntry && mostSharedEntry.comm != null && Math.abs(mostSharedEntry.item.rating - mostSharedEntry.comm.avg) <= 0.5
    ? toTake(mostSharedEntry) : null;
  const hiddenGem = hiddenGemEntry ? toTake(hiddenGemEntry) : null;

  // ── Per-category bars for the controversial take ─────────────────
  // First try the user's own scores on that specific title. If they
  // only did a quick (basic) rating, the 5 category fields will all be
  // null — fall back to community per-category averages so the chart
  // still has something to render.
  let controversialCategories: YearInReviewData["controversialCategories"] = null;
  if (controversial && controversialEntry) {
    const dbId = controversialEntry.dbId;
    const isMovie = controversialEntry.item.mediaType === "movie";
    // Direct lookup — previous version used find() with an index into
    // movieRatingRows but movieRatingRows is filtered (nulls removed)
    // so its indices no longer align with moviesSeen. That caused
    // full-Ratist ratings to be misdetected as quick ratings.
    const userRow = isMovie
      ? moviesSeen.find((m) => m.movieId === dbId)?.movie.ratings[0] ?? null
      : showRatings.find((r) => r.tvShowId === dbId) ?? null;

    const userScores = userRow
      ? {
          story: (userRow as { storyScore: number | null }).storyScore,
          style: (userRow as { styleScore: number | null }).styleScore,
          emotive: (userRow as { emotiveScore: number | null }).emotiveScore,
          acting: (userRow as { actingScore: number | null }).actingScore,
          entertain: (userRow as { entertainScore: number | null }).entertainScore,
        }
      : null;
    const userHasAny = userScores != null && (
      userScores.story != null || userScores.style != null ||
      userScores.emotive != null || userScores.acting != null ||
      userScores.entertain != null
    );

    function compact(pairs: Array<[string, number | null]>): { label: string; avg: number }[] {
      const out: { label: string; avg: number }[] = [];
      for (const [label, avg] of pairs) if (avg != null) out.push({ label, avg });
      return out;
    }

    if (userHasAny && userScores) {
      const scores = compact([
        ["Story & Writing", userScores.story],
        ["Style & Craft", userScores.style],
        ["Emotion & Meaning", userScores.emotive],
        ["Performance", userScores.acting],
        ["Entertainment", userScores.entertain],
      ]);
      controversialCategories = { scores, isUserScored: true };
    } else {
      // Fall back to community per-category averages for this title.
      const commAgg = isMovie
        ? await prisma.movieRating.aggregate({
            where: { movieId: dbId, ratistRating: { not: null } },
            _avg: { storyScore: true, styleScore: true, emotiveScore: true, actingScore: true, entertainScore: true },
          })
        : await prisma.tVShowRating.aggregate({
            where: { tvShowId: dbId, ratingScope: "series", ratistRating: { not: null } },
            _avg: { storyScore: true, styleScore: true, emotiveScore: true, actingScore: true, entertainScore: true },
          });
      const cs = commAgg._avg;
      const scores = compact([
        ["Story & Writing", cs.storyScore],
        ["Style & Craft", cs.styleScore],
        ["Emotion & Meaning", cs.emotiveScore],
        ["Performance", cs.actingScore],
        ["Entertainment", cs.entertainScore],
      ]);
      controversialCategories = scores.length > 0
        ? { scores, isUserScored: false }
        : null;
    }
  }

  // ── Vs last year ─────────────────────────────────────────────────
  let vsLastYear: VsLastYear | null = null;
  if (lastYearMovies.length > 0 || lastYearEpisodes.length > 0) {
    const lastShowIds = new Set(lastYearEpisodes.map((e) => e.showTmdbId));
    const lastShowEpisodeRuntimes = await (async () => {
      if (lastShowIds.size === 0) return new Map<number, number>();
      const rows = await prisma.tVShow.findMany({
        where: { tmdbId: { in: [...lastShowIds] } },
        select: { tmdbId: true, episodeRunTime: true },
      });
      return new Map(rows.map((r) => [r.tmdbId, r.episodeRunTime ?? 30]));
    })();
    const lastTotalHours = Math.round(
      lastYearMovies.reduce((s, m) => s + (m.movie.runtime ?? 0), 0) / 60 +
      lastYearEpisodes.reduce((s, e) => s + (lastShowEpisodeRuntimes.get(e.showTmdbId) ?? 30) / 60, 0)
    );
    const lastRatings = lastYearMovies
      .map((m) => m.movie.ratings[0]?.ratistRating)
      .filter((r): r is number => r != null);
    const lastAvg = lastRatings.length > 0
      ? lastRatings.reduce((a, b) => a + b, 0) / lastRatings.length
      : null;
    vsLastYear = {
      year: year - 1,
      movieDelta: movieCount - lastYearMovies.length,
      showDelta: showCount - lastShowIds.size,
      episodeDelta: episodeCount - lastYearEpisodes.length,
      hoursDelta: totalHours - lastTotalHours,
      avgRatingDelta: avgRating != null && lastAvg != null
        ? Math.round((avgRating - lastAvg) * 10) / 10
        : null,
    };
  }

  // ── Busiest month ────────────────────────────────────────────────
  const monthCounts = new Array(12).fill(0);
  for (const m of moviesSeen) {
    if (m.watchedDate) monthCounts[new Date(m.watchedDate).getMonth()]++;
  }
  for (const e of episodesSeen) {
    if (e.watchedDate) monthCounts[new Date(e.watchedDate).getMonth()]++;
  }
  const busiestIdx = monthCounts.indexOf(Math.max(...monthCounts));
  const busiestMonth = monthCounts[busiestIdx] > 0
    ? { name: MONTH_NAMES[busiestIdx], count: monthCounts[busiestIdx] }
    : null;

  // Top 3 months — for the chapter 4 horizontal bar chart.
  const topMonths = monthCounts
    .map((count, idx) => ({ name: MONTH_NAMES[idx], count }))
    .filter((m) => m.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  // ── Longest streak ───────────────────────────────────────────────
  const watchDates = new Set<string>();
  for (const m of moviesSeen) if (m.watchedDate) watchDates.add(new Date(m.watchedDate).toISOString().slice(0, 10));
  for (const e of episodesSeen) if (e.watchedDate) watchDates.add(new Date(e.watchedDate).toISOString().slice(0, 10));
  const sortedDates = [...watchDates].sort();
  let longestStreak: YearInReviewData["longestStreak"] = null;
  if (sortedDates.length > 0) {
    let bestLen = 1;
    let bestStart = sortedDates[0];
    let bestEnd = sortedDates[0];
    let curLen = 1;
    let curStart = sortedDates[0];
    for (let i = 1; i < sortedDates.length; i++) {
      const prev = new Date(sortedDates[i - 1]);
      const cur = new Date(sortedDates[i]);
      const diffDays = Math.round((cur.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        curLen++;
        if (curLen > bestLen) {
          bestLen = curLen;
          bestStart = curStart;
          bestEnd = sortedDates[i];
        }
      } else {
        curLen = 1;
        curStart = sortedDates[i];
      }
    }
    if (bestLen >= 3) {
      longestStreak = { days: bestLen, startDate: bestStart, endDate: bestEnd };
    }
  }

  // ── Discovery rate (movies only) ─────────────────────────────────
  let discoveryRate: YearInReviewData["discoveryRate"] = null;
  if (movieCount >= 5) {
    const rewatches = watchLogs.filter((w) => w.isRewatch).length;
    const firstWatches = Math.max(movieCount - rewatches, 0);
    discoveryRate = { firstWatches, rewatches };
  }

  // ── Poster wall (movies + shows) ─────────────────────────────────
  const posterWall: YearInReviewData["posterWall"] = [];
  for (const m of moviesSeen) {
    posterWall.push({ tmdbId: m.movie.tmdbId, title: m.movie.title, posterPath: m.movie.posterPath, mediaType: "movie" });
  }
  for (const s of shows) {
    posterWall.push({ tmdbId: s.tmdbId, title: s.name, posterPath: s.posterPath, mediaType: "tv" });
  }

  // ── Cinephile type ───────────────────────────────────────────────
  const avgMovieRuntimeMin = movieCount > 0
    ? totalMovieMin / movieCount
    : null;
  const cinephile = cinephileType({
    totalTitles: movieCount + showCount,
    movieCount,
    showCount,
    episodeCount,
    ratedCount,
    avgRating,
    ratingStdDev,
    genreMix: genreCount,
    decadeMix: decadeCount,
    topPersonCount,
    avgMovieRuntime: avgMovieRuntimeMin,
    categoryAvgs: {
      story: categoryAvgs.find((c) => c.label === "Story & Writing")?.avg ?? null,
      style: categoryAvgs.find((c) => c.label === "Style & Craft")?.avg ?? null,
      emotive: categoryAvgs.find((c) => c.label === "Emotion & Meaning")?.avg ?? null,
      acting: categoryAvgs.find((c) => c.label === "Performance")?.avg ?? null,
      entertain: categoryAvgs.find((c) => c.label === "Entertainment")?.avg ?? null,
    },
  });

  // ── Taste metrics (Shannon-entropy genre diversity, avg age, etc.) ──
  const genreTotalForDiv = [...genreCount.values()].reduce((s, v) => s + v, 0);
  let genreDiversity = 0;
  if (genreTotalForDiv > 0 && genreCount.size > 1) {
    let entropy = 0;
    for (const c of genreCount.values()) {
      const p = c / genreTotalForDiv;
      if (p > 0) entropy -= p * Math.log2(p);
    }
    const maxEntropy = Math.log2(genreCount.size);
    genreDiversity = maxEntropy > 0 ? Math.round((entropy / maxEntropy) * 100) : 0;
  }

  // Avg movie age (years between release and now). Uses movies only —
  // shows are continuously aired so the metric isn't comparable.
  const currentYear = new Date().getUTCFullYear();
  let ageSum = 0;
  let ageN = 0;
  for (const m of moviesSeen) {
    const yr = parseInt(m.movie.releaseDate?.slice(0, 4) ?? "");
    if (!isNaN(yr)) { ageSum += currentYear - yr; ageN++; }
  }
  const avgMovieAge = ageN > 0 ? Math.round(ageSum / ageN) : null;

  // Guilty pleasure: a genre you watch a lot but rate below your overall avg.
  // Requires ≥4 ratings in the genre and an overall avg to compare against.
  let guiltyPleasure: { name: string; count: number; avg: number } | null = null;
  if (avgRating != null) {
    const genreRatingMap = new Map<string, { sum: number; n: number; total: number }>();
    for (const m of moviesSeen) {
      const r = m.movie.ratings[0]?.ratistRating;
      for (const mg of m.movie.genres) {
        const e = genreRatingMap.get(mg.genre.name) ?? { sum: 0, n: 0, total: 0 };
        e.total++;
        if (r != null) { e.sum += r; e.n++; }
        genreRatingMap.set(mg.genre.name, e);
      }
    }
    for (const s of shows) {
      const r = showRatingByDbId.get(s.id)?.ratistRating;
      for (const sg of s.genres) {
        const e = genreRatingMap.get(sg.genre.name) ?? { sum: 0, n: 0, total: 0 };
        e.total++;
        if (r != null) { e.sum += r; e.n++; }
        genreRatingMap.set(sg.genre.name, e);
      }
    }
    const ranked = [...genreRatingMap.entries()]
      .map(([name, v]) => ({ name, count: v.total, avg: v.n > 0 ? v.sum / v.n : null }))
      .filter((g) => g.count >= 4 && g.avg != null && g.avg < avgRating)
      .sort((a, b) => b.count - a.count);
    if (ranked.length > 0) {
      guiltyPleasure = { name: ranked[0].name, count: ranked[0].count, avg: ranked[0].avg! };
    }
  }

  // Watching pace: avg watches per month across the dated span of the year.
  let avgPerMonth: number | null = null;
  if (sortedDates.length >= 2) {
    const first = new Date(sortedDates[0]);
    const last = new Date(sortedDates[sortedDates.length - 1]);
    const monthSpan = Math.max((last.getFullYear() - first.getFullYear()) * 12 + (last.getMonth() - first.getMonth()) + 1, 1);
    avgPerMonth = Math.round(((movieCount + episodeCount) / monthSpan) * 10) / 10;
  }

  // ── Taste twin (followed users only) ─────────────────────────────
  let tasteTwin: YearInReviewData["tasteTwin"] = null;
  const viewerProfile = await prisma.userProfile.findUnique({ where: { userId } });
  if (viewerProfile) {
    const follows = await prisma.userFollow.findMany({
      where: { followerId: userId, status: "accepted" },
      select: {
        following: {
          select: {
            firebaseUid: true, name: true, avatarUrl: true, isPrivate: true,
            profile: true,
          },
        },
      },
    });
    const dims = [
      "narrativeFocused", "characterFocused", "messageFocused",
      "cinematicFocused", "performanceFocused", "entertainmentFocused",
      "genreAction", "genreHorror", "genreDrama", "genreHistorical", "genreScifi",
      "genreThriller", "genreComedy", "genreBookAdapt", "genreFantasy", "genreRomance",
      "genreDocumentary", "genreFamily", "genreFilmNoir", "genreMusical", "genreBiopic",
      "genreCrime", "genreWestern", "genreMystery",
    ] as const;
    const vp = viewerProfile as unknown as Record<string, number>;
    let best: { firebaseUid: string; name: string; avatarUrl: string | null; similarity: number } | null = null;
    for (const f of follows) {
      if (!f.following.profile || f.following.isPrivate) continue;
      const fp = f.following.profile as unknown as Record<string, number>;
      let sum = 0;
      for (const d of dims) {
        sum += (10 - Math.abs((vp[d] ?? 0) - (fp[d] ?? 0))) / 10;
      }
      const similarity = Math.round((sum / dims.length) * 100);
      if (similarity >= 70 && (best == null || similarity > best.similarity)) {
        best = {
          firebaseUid: f.following.firebaseUid,
          name: f.following.name,
          avatarUrl: f.following.avatarUrl,
          similarity,
        };
      }
    }
    tasteTwin = best;
  }

  // ── Updated-as-of timestamp ──────────────────────────────────────
  const stamps: Date[] = [];
  for (const m of moviesSeen) if (m.watchedDate) stamps.push(new Date(m.watchedDate));
  for (const e of episodesSeen) if (e.watchedDate) stamps.push(new Date(e.watchedDate));
  for (const r of movieRatingRows) stamps.push(new Date(r.updatedAt));
  for (const r of showRatings) stamps.push(new Date(r.updatedAt));
  const updatedAt = stamps.length > 0
    ? new Date(Math.max(...stamps.map((d) => d.getTime())))
    : new Date();

  return {
    user, year,
    movieCount, showCount, episodeCount, ratedCount, totalHours,
    avgRating, ratingStdDev, categoryAvgs, bestCategory, worstCategory,
    cinephile,
    genreDiversity, avgMovieAge, guiltyPleasure, avgPerMonth,
    topPicks,
    controversial, controversialCategories, mostShared, hiddenGem, disappointed,
    vsLastYear,
    topGenres, decades, topPeople, topActors, tasteTwin,
    busiestMonth, topMonths, longestStreak, discoveryRate,
    posterWall,
    updatedAt,
  };
}
