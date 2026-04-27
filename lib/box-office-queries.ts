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
