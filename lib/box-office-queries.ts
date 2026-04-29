/**
 * Server-side query helpers for the Box Office feature. Centralizes
 * the SQL/Prisma filters so the leaderboard page, /box-office/all
 * filterable list, and any future drill-down pages share one source
 * of truth for what counts as a "real" box-office entry.
 *
 * All helpers return `BoxOfficeRow[]` (BigInt-stripped, JSON-safe) so
 * callers never have to think about BigInt serialization.
 */

import { prisma } from "@/lib/prisma";
import {
  BOX_OFFICE_FLOOR,
  ROI_MIN_BUDGET,
  toBoxOfficeRow,
  type BoxOfficeRow,
} from "@/lib/box-office";

const BASE_SELECT = {
  tmdbId: true,
  title: true,
  posterPath: true,
  releaseDate: true,
  revenue: true,
  budget: true,
} as const;

/** Top grossing movies, optionally filtered to a release-year window.
 *  `yearFrom`/`yearTo` are inclusive YYYY strings. */
export async function getTopGrossing(
  limit: number = 10,
  yearFrom?: string,
  yearTo?: string,
): Promise<BoxOfficeRow[]> {
  const releaseDate =
    yearFrom || yearTo
      ? {
          ...(yearFrom ? { gte: `${yearFrom}-01-01` } : {}),
          ...(yearTo ? { lte: `${yearTo}-12-31` } : {}),
        }
      : undefined;

  const rows = await prisma.movie.findMany({
    where: {
      revenue: { gte: BOX_OFFICE_FLOOR },
      ...(releaseDate ? { releaseDate } : {}),
    },
    orderBy: { revenue: "desc" },
    take: limit,
    select: BASE_SELECT,
  });
  return rows.map(toBoxOfficeRow);
}

/** Highest production budgets. Useful purely as a curiosity leaderboard. */
export async function getHighestBudget(limit: number = 10): Promise<BoxOfficeRow[]> {
  const rows = await prisma.movie.findMany({
    where: { budget: { gte: BOX_OFFICE_FLOOR } },
    orderBy: { budget: "desc" },
    take: limit,
    select: BASE_SELECT,
  });
  return rows.map(toBoxOfficeRow);
}

/** ROI rankings — highest or lowest. Uses raw SQL because Prisma can't
 *  ORDER BY a computed expression. The CAST to float is required so
 *  Postgres divides numerically rather than truncating to integer.
 *
 *  ROI rankings exclude movies below the ROI_MIN_BUDGET floor — without
 *  it, a $5K student film that grossed $1M would dominate every list
 *  with a 200× return that isn't comparable to studio economics. */
export async function getROIRanking(
  direction: "best" | "worst",
  limit: number = 10,
): Promise<BoxOfficeRow[]> {
  const order = direction === "best" ? "DESC" : "ASC";
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      tmdb_id: number;
      title: string;
      poster_path: string | null;
      release_date: string | null;
      revenue: bigint;
      budget: bigint;
    }>
  >(
    `SELECT tmdb_id, title, poster_path, release_date, revenue, budget
     FROM movies
     WHERE revenue >= $1 AND budget >= $2
     ORDER BY (revenue::float / budget::float) ${order}
     LIMIT $3`,
    Number(BOX_OFFICE_FLOOR),
    Number(ROI_MIN_BUDGET),
    limit,
  );
  return rows.map((r) =>
    toBoxOfficeRow({
      tmdbId: r.tmdb_id,
      title: r.title,
      posterPath: r.poster_path,
      releaseDate: r.release_date,
      revenue: r.revenue,
      budget: r.budget,
    }),
  );
}

/** Biggest profit (revenue minus budget). Different from ROI: a movie
 *  with $500M profit on a $200M budget beats a 100× ROI student film. */
export async function getTopProfit(limit: number = 10): Promise<BoxOfficeRow[]> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      tmdb_id: number;
      title: string;
      poster_path: string | null;
      release_date: string | null;
      revenue: bigint;
      budget: bigint;
    }>
  >(
    `SELECT tmdb_id, title, poster_path, release_date, revenue, budget
     FROM movies
     WHERE revenue >= $1 AND budget >= $2
     ORDER BY (revenue - budget) DESC
     LIMIT $3`,
    Number(BOX_OFFICE_FLOOR),
    Number(ROI_MIN_BUDGET),
    limit,
  );
  return rows.map((r) =>
    toBoxOfficeRow({
      tmdbId: r.tmdb_id,
      title: r.title,
      posterPath: r.poster_path,
      releaseDate: r.release_date,
      revenue: r.revenue,
      budget: r.budget,
    }),
  );
}

/** "Last completed year" — drives the homepage "Top of YYYY" widget.
 *  Defaults to current calendar year minus one because the current
 *  year's grosses are still accumulating. */
export function getLastCompleteYear(now: Date = new Date()): string {
  return String(now.getUTCFullYear() - 1);
}

/** Top grossing within an arbitrary release-date window. Distinct from
 *  getTopGrossing's year-bound flavor because YTD and rolling-90-day
 *  ranges need exact YYYY-MM-DD bounds, not whole years. The releaseDate
 *  column is a string in TMDB-format (YYYY-MM-DD) so lexicographic
 *  comparison matches chronological order. */
export async function getTopGrossingByDateRange(
  dateFrom: string,
  dateTo: string,
  limit: number = 10,
): Promise<BoxOfficeRow[]> {
  const rows = await prisma.movie.findMany({
    where: {
      revenue: { gte: BOX_OFFICE_FLOOR },
      releaseDate: { gte: dateFrom, lte: dateTo },
    },
    orderBy: { revenue: "desc" },
    take: limit,
    select: BASE_SELECT,
  });
  return rows.map(toBoxOfficeRow);
}

/** Format Date as YYYY-MM-DD using UTC components, matching the
 *  TMDB releaseDate column format. UTC avoids edge cases around
 *  month boundaries when local time differs from UTC. */
export function formatDateYMD(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ─── Franchises (TMDB collections) ──────────────────────────────────────

export interface FranchiseRow {
  collectionId: number;
  name: string;
  filmCount: number;
  totalRevenue: number;
  topPosterPath: string | null;
}

/** Top grossing franchises sorted by total lifetime gross across every
 *  movie in the franchise. The HAVING clause excludes one-film
 *  "franchises" — TMDB sometimes assigns a collection to a single
 *  film that was never sequelized, and those single-entry rows would
 *  otherwise crowd out real franchises with comparable solo grosses. */
export async function getTopFranchises(limit: number = 50): Promise<FranchiseRow[]> {
  const rows = await prisma.$queryRawUnsafe<Array<{
    collection_id: number;
    name: string;
    film_count: bigint;
    total_revenue: bigint;
    top_poster_path: string | null;
  }>>(
    `SELECT
       m.tmdb_collection_id   AS collection_id,
       MAX(m.tmdb_collection_name) AS name,
       COUNT(DISTINCT m.id)::bigint AS film_count,
       SUM(m.revenue)::bigint AS total_revenue,
       (SELECT m2.poster_path
          FROM movies m2
         WHERE m2.tmdb_collection_id = m.tmdb_collection_id
           AND m2.revenue IS NOT NULL
           AND m2.poster_path IS NOT NULL
         ORDER BY m2.revenue DESC
         LIMIT 1) AS top_poster_path
       FROM movies m
      WHERE m.tmdb_collection_id IS NOT NULL
        AND m.revenue >= $1
      GROUP BY m.tmdb_collection_id
     HAVING COUNT(DISTINCT m.id) >= 2
      ORDER BY total_revenue DESC
      LIMIT $2`,
    Number(BOX_OFFICE_FLOOR),
    limit,
  );

  return rows.map((r) => ({
    collectionId: r.collection_id,
    name: r.name,
    filmCount: Number(r.film_count),
    totalRevenue: Number(r.total_revenue),
    topPosterPath: r.top_poster_path,
  }));
}

// ─── Studios (TMDB production_companies) ───────────────────────────────

export interface StudioRow {
  studioId: number;
  name: string;
  logoPath: string | null;
  originCountry: string | null;
  filmCount: number;
  totalRevenue: number;
}

/** Top grossing studios by total lifetime gross across every movie
 *  the studio is credited on. Studios are many-per-movie, so a film
 *  with co-producers contributes its full gross to each studio's
 *  total — this matches Box Office Mojo's convention and is the most
 *  defensible aggregation given TMDB doesn't carry per-studio splits.
 *
 *  HAVING COUNT >= 3 cuts one-off shell companies that TMDB sometimes
 *  registers for a single film. */
export async function getTopStudios(limit: number = 50): Promise<StudioRow[]> {
  const rows = await prisma.$queryRawUnsafe<Array<{
    studio_id: number;
    name: string;
    logo_path: string | null;
    origin_country: string | null;
    film_count: bigint;
    total_revenue: bigint;
  }>>(
    `SELECT
       s.id            AS studio_id,
       s.name          AS name,
       s.logo_path     AS logo_path,
       s.origin_country AS origin_country,
       COUNT(DISTINCT m.id)::bigint AS film_count,
       SUM(m.revenue)::bigint AS total_revenue
       FROM studios s
       JOIN movie_studios ms ON ms.studio_id = s.id
       JOIN movies m ON m.id = ms.movie_id AND m.revenue >= $1
      GROUP BY s.id, s.name, s.logo_path, s.origin_country
     HAVING COUNT(DISTINCT m.id) >= 3
      ORDER BY total_revenue DESC
      LIMIT $2`,
    Number(BOX_OFFICE_FLOOR),
    limit,
  );

  return rows.map((r) => ({
    studioId: r.studio_id,
    name: r.name,
    logoPath: r.logo_path,
    originCountry: r.origin_country,
    filmCount: Number(r.film_count),
    totalRevenue: Number(r.total_revenue),
  }));
}

/** All movies a studio is credited on, ordered by revenue desc. Used
 *  by the /box-office/studios/[id] detail page. Returns the studio's
 *  metadata alongside the movie list. */
export async function getStudioMovies(studioId: number): Promise<{
  studio: { name: string; logoPath: string | null; originCountry: string | null } | null;
  movies: BoxOfficeRow[];
}> {
  const [studio, junctionRows] = await Promise.all([
    prisma.studio.findUnique({
      where: { id: studioId },
      select: { name: true, logoPath: true, originCountry: true },
    }),
    prisma.movieStudio.findMany({
      where: { studioId, movie: { revenue: { gte: BOX_OFFICE_FLOOR } } },
      orderBy: { movie: { revenue: "desc" } },
      select: { movie: { select: BASE_SELECT } },
    }),
  ]);
  return {
    studio,
    movies: junctionRows.map((r) => toBoxOfficeRow(r.movie)),
  };
}

// ─── Generic filtered top-N (used by OG and /all share) ───────────────

export interface BoxOfficeFilters {
  sort: "revenue-desc" | "revenue-asc" | "budget-desc" | "budget-asc" | "year-desc" | "year-asc" | "title-asc" | "profit-desc" | "profit-asc" | "roi-desc" | "roi-asc";
  genreIds?: number[];
  mpaCodes?: string[];
  languages?: string[];
  releaseFrom?: string;
  releaseTo?: string;
}

/**
 * Filter-aware top-N. Mirrors the query shape of /api/box-office/list
 * but exposed as a function so the OG generator can produce a top-5
 * preview that actually reflects the user's current filters when
 * sharing /box-office/all. Computed sorts (profit, ROI) require raw
 * SQL because Prisma orderBy can't reference (revenue/budget); the
 * standard sorts go through Prisma directly.
 */
export async function getTopFiltered(filters: BoxOfficeFilters, limit: number): Promise<BoxOfficeRow[]> {
  const { sort, genreIds = [], mpaCodes = [], languages = [], releaseFrom, releaseTo } = filters;

  if (sort === "profit-desc" || sort === "profit-asc" || sort === "roi-desc" || sort === "roi-asc") {
    const params: unknown[] = [];
    const wheres: string[] = [];
    const push = (v: unknown) => { params.push(v); return `$${params.length}`; };
    wheres.push(`m.revenue >= ${push(Number(BOX_OFFICE_FLOOR))}`);
    wheres.push(`m.budget >= ${push(sort.startsWith("roi") ? Number(ROI_MIN_BUDGET) : Number(BOX_OFFICE_FLOOR))}`);
    if (releaseFrom) wheres.push(`m.release_date >= ${push(releaseFrom)}`);
    if (releaseTo) wheres.push(`m.release_date <= ${push(releaseTo)}`);
    if (mpaCodes.length) wheres.push(`m.mpaa_rating IN (${mpaCodes.map((c) => push(c)).join(",")})`);
    if (languages.length) wheres.push(`m.original_language IN (${languages.map((l) => push(l)).join(",")})`);
    if (genreIds.length) {
      wheres.push(`EXISTS (SELECT 1 FROM movie_genres mg WHERE mg.movie_id = m.id AND mg.genre_id IN (${genreIds.map((g) => push(g)).join(",")}))`);
    }
    const order =
      sort === "profit-desc" ? "(m.revenue - m.budget) DESC"
      : sort === "profit-asc" ? "(m.revenue - m.budget) ASC"
      : sort === "roi-desc" ? "(m.revenue::float / m.budget::float) DESC"
      : "(m.revenue::float / m.budget::float) ASC";
    const sql = `
      SELECT m.tmdb_id, m.title, m.poster_path, m.release_date, m.revenue, m.budget
        FROM movies m
       WHERE ${wheres.join(" AND ")}
       ORDER BY ${order}
       LIMIT ${push(limit)}`;
    const rows = await prisma.$queryRawUnsafe<Array<{
      tmdb_id: number; title: string; poster_path: string | null;
      release_date: string | null; revenue: bigint; budget: bigint;
    }>>(sql, ...params);
    return rows.map((r) => toBoxOfficeRow({
      tmdbId: r.tmdb_id, title: r.title, posterPath: r.poster_path,
      releaseDate: r.release_date, revenue: r.revenue, budget: r.budget,
    }));
  }

  // Standard sort path — Prisma. Same field-presence guards as
  // /api/box-office/list so we don't surface null-revenue rows
  // when sorting by revenue.
  const where: Record<string, unknown> = {};
  if (sort.startsWith("revenue")) where.revenue = { gte: BOX_OFFICE_FLOOR };
  else if (sort.startsWith("budget")) where.budget = { gte: BOX_OFFICE_FLOOR };
  else if (sort.startsWith("year")) where.releaseDate = { not: null };
  else where.revenue = { gte: BOX_OFFICE_FLOOR };

  if (genreIds.length) where.genres = { some: { genreId: { in: genreIds } } };
  if (mpaCodes.length) where.mpaaRating = { in: mpaCodes };
  if (languages.length) where.originalLanguage = { in: languages };
  if (releaseFrom || releaseTo) {
    const rd: { gte?: string; lte?: string } = {};
    if (releaseFrom) rd.gte = releaseFrom;
    if (releaseTo) rd.lte = releaseTo;
    where.releaseDate = { ...((where.releaseDate as object) ?? {}), ...rd };
  }

  const orderByMap: Record<string, object> = {
    "revenue-desc": { revenue: "desc" }, "revenue-asc": { revenue: "asc" },
    "budget-desc": { budget: "desc" }, "budget-asc": { budget: "asc" },
    "year-desc": { releaseDate: "desc" }, "year-asc": { releaseDate: "asc" },
    "title-asc": { title: "asc" },
  };

  const rows = await prisma.movie.findMany({
    where,
    orderBy: orderByMap[sort],
    take: limit,
    select: BASE_SELECT,
  });
  return rows.map(toBoxOfficeRow);
}

// ─── Per-movie ranks (Stage 5) ──────────────────────────────────────────

/** A single rank entry for the Overview-tab badges. `total` is the
 *  size of the cohort the movie ranks within, e.g. 47 = 47 R-rated
 *  films with reportable revenue. `href` is the deep-link target
 *  for the badge. */
export interface RankBadge {
  rank: number;
  total: number;
  label: string;
  href: string;
}

export interface MovieRankBadges {
  allTime: RankBadge | null;
  year: RankBadge | null;
  decade: RankBadge | null;
  genre: RankBadge | null;
  mpa: RankBadge | null;
  franchise: RankBadge | null;
  language: RankBadge | null;
}

const RANK_CUTOFF = 100; // hide badges where rank > 100 (avoids clutter)

const LANGUAGE_LABELS: Record<string, string> = {
  en: "English-language", es: "Spanish-language", fr: "French-language",
  de: "German-language", it: "Italian-language", ja: "Japanese-language",
  ko: "Korean-language", zh: "Chinese-language", hi: "Hindi-language",
  ru: "Russian-language", pt: "Portuguese-language", ar: "Arabic-language",
};

/** Compute every applicable box-office rank for a single movie. Each
 *  rank query is a pair: (a) how many movies beat this one within the
 *  cohort, and (b) the cohort size. Both queries run in parallel.
 *  Ranks beyond `RANK_CUTOFF` return null so the Overview tab only
 *  surfaces meaningful badges. */
export async function getMovieBoxOfficeRanks(tmdbId: number): Promise<MovieRankBadges> {
  // Pull the DB row with everything we need to scope the rank queries.
  const movie = await prisma.movie.findUnique({
    where: { tmdbId },
    select: {
      id: true,
      revenue: true,
      releaseDate: true,
      mpaaRating: true,
      originalLanguage: true,
      tmdbCollectionId: true,
      tmdbCollectionName: true,
      genres: { include: { genre: { select: { id: true, name: true } } } },
    },
  });

  // No revenue → no useful ranks. Don't surface anything.
  const empty: MovieRankBadges = {
    allTime: null, year: null, decade: null, genre: null,
    mpa: null, franchise: null, language: null,
  };
  if (!movie || !movie.revenue || movie.revenue < BOX_OFFICE_FLOOR) return empty;

  const revenue = movie.revenue;
  const yearStr = movie.releaseDate?.slice(0, 4) ?? null;
  const year = yearStr && /^\d{4}$/.test(yearStr) ? yearStr : null;
  const decadeStart = year ? `${Math.floor(parseInt(year, 10) / 10) * 10}` : null;
  // First genre by Prisma's natural order — the most-credited genre
  // is first in TMDB's response, which is the most "primary" tag.
  const primaryGenre = movie.genres[0]?.genre ?? null;

  // Each `rank` query counts how many movies in the cohort have a
  // strictly greater revenue. `total` is the cohort size. We add 1
  // to higherCount to convert "movies above" → "this movie's rank".
  const rankQueries: Array<{
    key: keyof MovieRankBadges;
    higherWhere: Record<string, unknown>;
    totalWhere: Record<string, unknown>;
    label: string;
    href: string;
  }> = [];

  rankQueries.push({
    key: "allTime",
    higherWhere: { revenue: { gt: revenue } },
    totalWhere: { revenue: { gte: BOX_OFFICE_FLOOR } },
    label: "of all time",
    href: "/box-office/all?sort=revenue-desc",
  });

  if (year) {
    rankQueries.push({
      key: "year",
      higherWhere: {
        revenue: { gt: revenue },
        releaseDate: { gte: `${year}-01-01`, lte: `${year}-12-31` },
      },
      totalWhere: {
        revenue: { gte: BOX_OFFICE_FLOOR },
        releaseDate: { gte: `${year}-01-01`, lte: `${year}-12-31` },
      },
      label: `of ${year}`,
      href: `/box-office/year/${year}`,
    });
  }

  if (decadeStart) {
    const decadeEnd = String(parseInt(decadeStart, 10) + 9);
    rankQueries.push({
      key: "decade",
      higherWhere: {
        revenue: { gt: revenue },
        releaseDate: { gte: `${decadeStart}-01-01`, lte: `${decadeEnd}-12-31` },
      },
      totalWhere: {
        revenue: { gte: BOX_OFFICE_FLOOR },
        releaseDate: { gte: `${decadeStart}-01-01`, lte: `${decadeEnd}-12-31` },
      },
      label: `of the ${decadeStart}s`,
      href: `/box-office/all?sort=revenue-desc&releaseFrom=${decadeStart}-01-01&releaseTo=${decadeEnd}-12-31`,
    });
  }

  if (primaryGenre) {
    rankQueries.push({
      key: "genre",
      higherWhere: {
        revenue: { gt: revenue },
        genres: { some: { genreId: primaryGenre.id } },
      },
      totalWhere: {
        revenue: { gte: BOX_OFFICE_FLOOR },
        genres: { some: { genreId: primaryGenre.id } },
      },
      label: `${primaryGenre.name} film`,
      href: `/box-office/all?sort=revenue-desc&genres=${primaryGenre.id}`,
    });
  }

  if (movie.mpaaRating) {
    rankQueries.push({
      key: "mpa",
      higherWhere: { revenue: { gt: revenue }, mpaaRating: movie.mpaaRating },
      totalWhere: { revenue: { gte: BOX_OFFICE_FLOOR }, mpaaRating: movie.mpaaRating },
      label: `${movie.mpaaRating}-rated`,
      href: `/box-office/all?sort=revenue-desc&mpa=${encodeURIComponent(movie.mpaaRating)}`,
    });
  }

  if (movie.tmdbCollectionId && movie.tmdbCollectionName) {
    rankQueries.push({
      key: "franchise",
      higherWhere: {
        revenue: { gt: revenue },
        tmdbCollectionId: movie.tmdbCollectionId,
      },
      totalWhere: {
        revenue: { gte: BOX_OFFICE_FLOOR },
        tmdbCollectionId: movie.tmdbCollectionId,
      },
      label: `in ${movie.tmdbCollectionName}`,
      href: `/box-office/franchises/${movie.tmdbCollectionId}`,
    });
  }

  if (movie.originalLanguage) {
    const langLabel = LANGUAGE_LABELS[movie.originalLanguage] ?? `${movie.originalLanguage.toUpperCase()}-language`;
    rankQueries.push({
      key: "language",
      higherWhere: { revenue: { gt: revenue }, originalLanguage: movie.originalLanguage },
      totalWhere: { revenue: { gte: BOX_OFFICE_FLOOR }, originalLanguage: movie.originalLanguage },
      label: langLabel,
      href: `/box-office/all?sort=revenue-desc&languages=${movie.originalLanguage}`,
    });
  }

  // Fan all the count pairs out in parallel — they're independent.
  const results = await Promise.all(
    rankQueries.map(async (q) => {
      const [higherCount, totalCount] = await Promise.all([
        prisma.movie.count({ where: q.higherWhere }),
        prisma.movie.count({ where: q.totalWhere }),
      ]);
      return { key: q.key, higherCount, totalCount, label: q.label, href: q.href };
    }),
  );

  const out: MovieRankBadges = { ...empty };
  for (const r of results) {
    const rank = r.higherCount + 1;
    if (rank > RANK_CUTOFF) continue;
    out[r.key] = { rank, total: r.totalCount, label: r.label, href: r.href };
  }
  return out;
}

/** All movies in a single franchise, ordered by release date. Used by
 *  the /box-office/franchises/[id] detail page. */
export async function getFranchiseMovies(collectionId: number): Promise<{
  name: string | null;
  movies: BoxOfficeRow[];
}> {
  const rows = await prisma.movie.findMany({
    where: { tmdbCollectionId: collectionId },
    orderBy: { releaseDate: "asc" },
    select: { ...BASE_SELECT, tmdbCollectionName: true },
  });
  return {
    name: rows[0]?.tmdbCollectionName ?? null,
    movies: rows.map(toBoxOfficeRow),
  };
}

/** Top grossing within a single TMDB genre id. Used by /box-office/by-genre.
 *  We constrain via the MovieGenre junction so the index does most of
 *  the work; the genre filter comes first in the WHERE clause for the
 *  same reason. */
export async function getTopGrossingByGenre(genreId: number, limit: number = 10): Promise<BoxOfficeRow[]> {
  const rows = await prisma.movie.findMany({
    where: {
      genres: { some: { genreId } },
      revenue: { gte: BOX_OFFICE_FLOOR },
    },
    orderBy: { revenue: "desc" },
    take: limit,
    select: BASE_SELECT,
  });
  return rows.map(toBoxOfficeRow);
}

/** Top grossing for an MPA cert code. Used by /box-office/by-rating. */
export async function getTopGrossingByMpa(mpaaRating: string, limit: number = 10): Promise<BoxOfficeRow[]> {
  const rows = await prisma.movie.findMany({
    where: {
      mpaaRating,
      revenue: { gte: BOX_OFFICE_FLOOR },
    },
    orderBy: { revenue: "desc" },
    take: limit,
    select: BASE_SELECT,
  });
  return rows.map(toBoxOfficeRow);
}

/** Top grossing within a release-window window — same month/day range
 *  every year. The runtime filter walks every candidate row, so we cap
 *  the candidate pool by pre-filtering on revenue and ordering at the
 *  DB. The result is sliced to `limit` after filtering in JS. The
 *  window-style filter is hard to express purely in SQL because TMDB
 *  release_date is stored as a string, not a date. */
export async function getTopGrossingByReleaseWindow(
  windowStart: { month: number; day: number },
  windowEnd: { month: number; day: number },
  limit: number = 10,
): Promise<BoxOfficeRow[]> {
  // Pull a wide candidate set and filter in app. Empirically, a
  // ~14-day window like Christmas matches ~6% of all movies with
  // revenue ≥ $1k (smoke-tested 318 of 5000), so we'd need at least
  // a 150× over-fetch to comfortably hit 10 results. We just take
  // the top 5,000 by revenue across the board — the fetch is fast
  // (revenue index, single ORDER BY) and the filtering is in-memory.
  const overFetch = 5000;
  const candidates = await prisma.movie.findMany({
    where: {
      revenue: { gte: BOX_OFFICE_FLOOR },
      releaseDate: { not: null },
    },
    orderBy: { revenue: "desc" },
    take: overFetch,
    select: BASE_SELECT,
  });

  const startMd = windowStart.month * 100 + windowStart.day;
  const endMd = windowEnd.month * 100 + windowEnd.day;
  const filtered = candidates.filter((m) => {
    if (!m.releaseDate) return false;
    const parts = m.releaseDate.split("-");
    if (parts.length < 3) return false;
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    if (Number.isNaN(month) || Number.isNaN(day)) return false;
    const md = month * 100 + day;
    return md >= startMd && md <= endMd;
  });

  return filtered.slice(0, limit).map(toBoxOfficeRow);
}

// ─── Career box office (actors + directors) ─────────────────────────────

export interface CareerRow {
  tmdbId: number;
  name: string;
  profilePath: string | null;
  totalRevenue: number;
  filmCount: number;
}

/**
 * Top grossing actors / directors / arbitrary crew jobs by lifetime
 * revenue across all of their credited films. Each row is one
 * celebrity, totaled across every movie they're in.
 *
 * The HAVING clause caps the result at celebrities credited on at
 * least 3 films — without it, an actor whose only credit is a
 * billion-dollar blockbuster outranks lifetime stars who made dozens
 * of consistent films. 3 is the smallest cut that meaningfully
 * filters one-hit wonders without excluding directors with short
 * filmographies. The same threshold is applied per-celebrity in
 * `getCelebrityBoxOfficeStats` so detail pages and leaderboards stay
 * consistent.
 */
export async function getTopCelebrityCareers(
  role: "actor" | "director",
  limit: number = 50,
): Promise<CareerRow[]> {
  const filter = role === "actor"
    ? `mc.credit_type = 'cast'`
    : `mc.credit_type = 'crew' AND mc.job = 'Director'`;

  const rows = await prisma.$queryRawUnsafe<Array<{
    tmdb_id: number;
    name: string;
    profile_path: string | null;
    total_revenue: bigint;
    film_count: bigint;
  }>>(
    `SELECT c.tmdb_id, c.name, c.profile_path,
            SUM(m.revenue) AS total_revenue,
            COUNT(DISTINCT m.id) AS film_count
       FROM celebrities c
       JOIN movie_cast mc ON mc.celebrity_id = c.id AND ${filter}
       JOIN movies m ON m.id = mc.movie_id AND m.revenue >= $1
      GROUP BY c.id, c.tmdb_id, c.name, c.profile_path
      HAVING COUNT(DISTINCT m.id) >= 3
      ORDER BY total_revenue DESC
      LIMIT $2`,
    Number(BOX_OFFICE_FLOOR),
    limit,
  );

  return rows.map((r) => ({
    tmdbId: r.tmdb_id,
    name: r.name,
    profilePath: r.profile_path,
    totalRevenue: Number(r.total_revenue),
    filmCount: Number(r.film_count),
  }));
}

/** Career box office stats for a single celebrity — used by the
 *  celebrity detail page to surface "career box office" alongside the
 *  filmography. Returns null if the person has no qualifying credits. */
export async function getCelebrityBoxOfficeStats(
  celebrityId: string,
): Promise<{
  asActor: { totalRevenue: number; filmCount: number; topFilms: BoxOfficeRow[] } | null;
  asDirector: { totalRevenue: number; filmCount: number; topFilms: BoxOfficeRow[] } | null;
}> {
  // Pull all qualifying credits in one query, then split locally —
  // typically a person has < 200 credits so the in-app split is cheap.
  const rows = await prisma.movieCast.findMany({
    where: {
      celebrityId,
      OR: [
        { creditType: "cast" },
        { creditType: "crew", job: "Director" },
      ],
      movie: { revenue: { gte: BOX_OFFICE_FLOOR } },
    },
    select: {
      creditType: true,
      job: true,
      movie: {
        select: {
          tmdbId: true, title: true, posterPath: true, releaseDate: true,
          revenue: true, budget: true,
        },
      },
    },
  });

  const actorMovies = new Map<number, typeof rows[0]["movie"]>();
  const directorMovies = new Map<number, typeof rows[0]["movie"]>();
  for (const r of rows) {
    if (r.creditType === "cast") actorMovies.set(r.movie.tmdbId, r.movie);
    else if (r.creditType === "crew" && r.job === "Director") directorMovies.set(r.movie.tmdbId, r.movie);
  }

  function summarize(movies: Iterable<typeof rows[0]["movie"]>) {
    const sorted = [...movies].sort((a, b) => Number(b.revenue ?? BigInt(0)) - Number(a.revenue ?? BigInt(0)));
    if (sorted.length < 3) return null; // mirrors leaderboard floor
    const total = sorted.reduce((acc, m) => acc + Number(m.revenue ?? BigInt(0)), 0);
    return {
      totalRevenue: total,
      filmCount: sorted.length,
      topFilms: sorted.slice(0, 5).map(toBoxOfficeRow),
    };
  }

  return {
    asActor: summarize(actorMovies.values()),
    asDirector: summarize(directorMovies.values()),
  };
}
