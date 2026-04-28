/**
 * Shared helpers for the Box Office feature.
 *
 * The Movie table stores `revenue` and `budget` as BigInt for safe
 * persistence of values that may exceed Number.MAX_SAFE_INTEGER once
 * inflation-adjusted aggregates are added. Most call sites convert to
 * Number at the formatting boundary; the helpers here centralize that
 * boundary so we never accidentally serialize a BigInt to JSON (which
 * throws) and never apply Number arithmetic to raw BigInts (which
 * truncates).
 */

/** Values below this threshold are treated as TMDB placeholder noise
 *  (e.g. literal `24` entries) and excluded from the UI. Matches the
 *  display-time floor in MovieDetailTabs.
 *  Written via BigInt() because the project's tsconfig targets ES2017,
 *  which doesn't support `1000n` literals. */
export const BOX_OFFICE_FLOOR: bigint = BigInt(1000);

/** ROI calculations require a non-trivial budget. A movie with a
 *  $5,000 budget that grossed $100M would otherwise show as a 20,000×
 *  return and dominate every leaderboard. The floor keeps the chart
 *  honest by excluding micro-budget outliers from ROI rankings. */
export const ROI_MIN_BUDGET: bigint = BigInt(100000);

/**
 * Format a box-office number to a compact human-readable string:
 *   $1.45B, $850M, $3.4M, $250K. Strips trailing zeroes and the dot
 *   on whole-unit values so we don't show "$1.0B".
 *
 * Returns null for missing or sub-floor values so callers can skip
 * rendering rather than show "$0" or "$24" type noise.
 */
export function formatBoxOffice(value: bigint | number | null | undefined): string | null {
  if (value == null) return null;
  const n = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isFinite(n) || n < Number(BOX_OFFICE_FLOOR)) return null;

  const abs = Math.abs(n);
  let str: string;
  if (abs >= 1_000_000_000) str = `${(n / 1_000_000_000).toFixed(2)}B`;
  else if (abs >= 1_000_000) str = `${(n / 1_000_000).toFixed(1)}M`;
  else if (abs >= 1_000) str = `${(n / 1_000).toFixed(0)}K`;
  else str = String(Math.round(n));

  // Strip trailing zeros in the decimal portion so "1.20B" → "1.2B"
  // and "1.00B" → "1B". Only applies when there's a decimal point.
  if (str.includes(".")) {
    str = str.replace(/\.?0+(?=[BMK]?$)/, "");
  }
  return `$${str}`;
}

/** Long-form formatter ($1,234,567,890) for tooltips, detail modals, etc. */
export function formatBoxOfficeLong(value: bigint | number | null | undefined): string | null {
  if (value == null) return null;
  const n = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isFinite(n) || n < Number(BOX_OFFICE_FLOOR)) return null;
  return `$${n.toLocaleString()}`;
}

/** Profit = revenue - budget. Returns null if either side is missing
 *  or below the floor. */
export function calculateProfit(
  revenue: bigint | null | undefined,
  budget: bigint | null | undefined,
): bigint | null {
  if (revenue == null || budget == null) return null;
  if (revenue < BOX_OFFICE_FLOOR || budget < BOX_OFFICE_FLOOR) return null;
  return revenue - budget;
}

/** ROI = revenue / budget. Returns null if budget is below the
 *  ROI-specific floor (avoids absurd multipliers from micro-budget
 *  films). 1.0 = break-even, 5.0 = 5× return. */
export function calculateROI(
  revenue: bigint | null | undefined,
  budget: bigint | null | undefined,
): number | null {
  if (revenue == null || budget == null) return null;
  if (revenue < BOX_OFFICE_FLOOR || budget < ROI_MIN_BUDGET) return null;
  return Number(revenue) / Number(budget);
}

/** Format an ROI multiplier as "5.2×" or "520%". The multiplier form
 *  reads better at scale (12.4× vs 1240%) and matches industry usage. */
export function formatROI(roi: number | null | undefined): string | null {
  if (roi == null || !Number.isFinite(roi)) return null;
  // Two decimals under 10×, one above — keeps the column readable.
  const decimals = roi < 10 ? 2 : 1;
  return `${roi.toFixed(decimals)}×`;
}

export type BoxOfficeConfidence = "high" | "medium" | "low" | "missing";

/**
 * Classify how confident we are in a movie's box-office numbers.
 * Drives the disclaimer copy on each row/page.
 *
 *   - high:    both revenue and budget present and ≥ floor.
 *   - medium:  one of revenue/budget present and ≥ floor.
 *   - low:     a value is present but below the floor (likely TMDB
 *              placeholder noise).
 *   - missing: nothing usable.
 */
export function getDataConfidence(
  movie: { revenue?: bigint | null; budget?: bigint | null },
): BoxOfficeConfidence {
  const rev = movie.revenue ?? null;
  const bud = movie.budget ?? null;
  const revOk = rev != null && rev >= BOX_OFFICE_FLOOR;
  const budOk = bud != null && bud >= BOX_OFFICE_FLOOR;
  if (revOk && budOk) return "high";
  if (revOk || budOk) return "medium";
  const ZERO = BigInt(0);
  if ((rev != null && rev > ZERO) || (bud != null && bud > ZERO)) return "low";
  return "missing";
}

/** Standard release-window buckets used in holiday/seasonal leaderboards.
 *  Each window is keyed off month + day-of-month (no year), so the
 *  buckets work across decades. Windows are inclusive on both ends. */
export interface ReleaseWindow {
  key: string;
  label: string;
  /** Month/day of window start. Month is 1-indexed. */
  start: { month: number; day: number };
  end: { month: number; day: number };
}

export const RELEASE_WINDOWS: ReleaseWindow[] = [
  { key: "memorial-day", label: "Memorial Day Weekend", start: { month: 5, day: 22 }, end: { month: 5, day: 31 } },
  { key: "july-4",       label: "July 4th Window",      start: { month: 6, day: 28 }, end: { month: 7, day: 7 } },
  { key: "labor-day",    label: "Labor Day Weekend",    start: { month: 8, day: 28 }, end: { month: 9, day: 7 } },
  { key: "halloween",    label: "Halloween Window",     start: { month: 10, day: 20 }, end: { month: 11, day: 1 } },
  { key: "thanksgiving", label: "Thanksgiving Window",  start: { month: 11, day: 18 }, end: { month: 11, day: 30 } },
  { key: "christmas",    label: "Christmas / NYE",      start: { month: 12, day: 18 }, end: { month: 12, day: 31 } },
  { key: "valentines",   label: "Valentine's Window",   start: { month: 2, day: 7 },  end: { month: 2, day: 17 } },
];

/** Most recently ended holiday window relative to `now`. Used by the
 *  /box-office landing page to pick a "freshest holiday" tile that
 *  rotates through the year — January through mid-February shows
 *  Christmas, late Feb through May shows Valentine's, etc.
 *
 *  Returns the window plus the year of its most recent end (so
 *  callers can label the tile with "ended Feb 17, 2026" rather than
 *  the static window definition). Each window's end is checked
 *  against both the current year and the prior year — windows that
 *  haven't ended yet this year (e.g. Christmas in February) are
 *  represented by their previous-year occurrence.
 */
export function getMostRecentlyEndedWindow(now: Date = new Date()): {
  window: ReleaseWindow;
  endDate: Date;
} | null {
  const candidates: Array<{ window: ReleaseWindow; endDate: Date }> = [];
  const year = now.getUTCFullYear();
  for (const w of RELEASE_WINDOWS) {
    for (const candidateYear of [year, year - 1]) {
      // 23:59:59 UTC on the last day so a window viewed on its end
      // date still reads as "active", not "ended".
      const endDate = new Date(Date.UTC(candidateYear, w.end.month - 1, w.end.day, 23, 59, 59));
      if (endDate < now) candidates.push({ window: w, endDate });
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.endDate.getTime() - a.endDate.getTime());
  return candidates[0];
}

/** Returns the matching ReleaseWindow for a release date string, or
 *  null if it doesn't fall in any tracked window. Accepts the YYYY-MM-DD
 *  string format Movie.releaseDate uses. */
export function classifyReleaseWindow(releaseDate: string | null | undefined): ReleaseWindow | null {
  if (!releaseDate) return null;
  const parts = releaseDate.split("-");
  if (parts.length < 3) return null;
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (Number.isNaN(month) || Number.isNaN(day)) return null;
  // Compare via month*100 + day — handles cross-month windows
  // (e.g. Jun 28 to Jul 7) without timezone considerations.
  const md = month * 100 + day;
  for (const w of RELEASE_WINDOWS) {
    const startMd = w.start.month * 100 + w.start.day;
    const endMd = w.end.month * 100 + w.end.day;
    if (md >= startMd && md <= endMd) return w;
  }
  return null;
}

/** A single row of leaderboard data — shared shape across all the
 *  ranking endpoints so the UI components only need one type. */
export interface BoxOfficeRow {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  releaseDate: string | null;
  revenue: number | null;
  budget: number | null;
  profit: number | null;
  roi: number | null;
  confidence: BoxOfficeConfidence;
}

/** Convert a Prisma Movie record into a BoxOfficeRow with all derived
 *  fields computed. BigInts are converted to Number at this boundary
 *  so the row is JSON-serializable (BigInt has no JSON representation
 *  by default and would crash NextResponse.json). Numbers up to
 *  ~9 quadrillion fit safely; box-office grosses do not exceed that. */
export function toBoxOfficeRow(
  movie: {
    tmdbId: number;
    title: string;
    posterPath?: string | null;
    releaseDate?: string | null;
    revenue?: bigint | null;
    budget?: bigint | null;
  },
): BoxOfficeRow {
  const revenue = movie.revenue != null ? Number(movie.revenue) : null;
  const budget = movie.budget != null ? Number(movie.budget) : null;
  const profit = calculateProfit(movie.revenue, movie.budget);
  const roi = calculateROI(movie.revenue, movie.budget);
  return {
    tmdbId: movie.tmdbId,
    title: movie.title,
    posterPath: movie.posterPath ?? null,
    releaseDate: movie.releaseDate ?? null,
    revenue,
    budget,
    profit: profit != null ? Number(profit) : null,
    roi,
    confidence: getDataConfidence(movie),
  };
}
