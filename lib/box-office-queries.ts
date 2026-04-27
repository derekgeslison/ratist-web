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
