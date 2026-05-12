import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { maskBlockedInResponse } from "@/lib/safe-content";
import {
  BOX_OFFICE_FLOOR,
  ROI_MIN_BUDGET,
  toBoxOfficeRow,
  type BoxOfficeRow,
} from "@/lib/box-office";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

type SortKey =
  | "revenue-desc"
  | "revenue-asc"
  | "budget-desc"
  | "budget-asc"
  | "profit-desc"
  | "profit-asc"
  | "roi-desc"
  | "roi-asc"
  | "year-desc"
  | "year-asc"
  | "title-asc";

const SORT_KEYS: ReadonlyArray<SortKey> = [
  "revenue-desc", "revenue-asc",
  "budget-desc", "budget-asc",
  "profit-desc", "profit-asc",
  "roi-desc", "roi-asc",
  "year-desc", "year-asc",
  "title-asc",
];

function parseSort(s: string | null): SortKey {
  return SORT_KEYS.includes(s as SortKey) ? (s as SortKey) : "revenue-desc";
}

function parseIntList(s: string | null): number[] {
  if (!s) return [];
  return s.split(",").map((x) => parseInt(x, 10)).filter((n) => !Number.isNaN(n));
}

/**
 * GET /api/box-office/list
 *
 * Filters:
 *   - sort:        SortKey (default revenue-desc)
 *   - genres:      comma-separated genre IDs
 *   - mpa:         comma-separated cert codes (G, PG, PG-13, R, NC-17, NR)
 *   - releaseFrom: YYYY-MM-DD (inclusive)
 *   - releaseTo:   YYYY-MM-DD (inclusive)
 *   - page:        1-indexed
 *   - limit:       page size, capped at MAX_PAGE_SIZE
 *
 * Profit and ROI sorts use raw SQL because Prisma's orderBy can't
 * target a computed expression. Other sorts use the typed query API.
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const sort = parseSort(sp.get("sort"));
    const genreIds = parseIntList(sp.get("genres"));
    const mpaCodes = (sp.get("mpa") ?? "").split(",").filter(Boolean);
    const languages = (sp.get("languages") ?? "").split(",").filter(Boolean);
    const releaseFrom = sp.get("releaseFrom");
    const releaseTo = sp.get("releaseTo");
    const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(sp.get("limit") ?? String(PAGE_SIZE), 10) || PAGE_SIZE));
    const offset = (page - 1) * limit;

    // Computed-sort path — raw SQL. The CTE pulls a candidate set with
    // the floor applied (and ROI floor applied for ROI sorts) so that
    // ORDER BY can reference (revenue - budget) and (revenue/budget)
    // without re-applying filters per-row.
    if (sort === "profit-desc" || sort === "profit-asc" || sort === "roi-desc" || sort === "roi-asc") {
      const metricParam = sp.get("metric");
      const metric: "est" | "gross" = metricParam === "gross" ? "gross" : "est";
      return await runComputedSort({
        sort,
        metric,
        genreIds,
        mpaCodes,
        languages,
        releaseFrom,
        releaseTo,
        limit,
        offset,
      });
    }

    // Standard sort path — Prisma. revenue/budget orderBy excludes
    // sub-floor entries automatically because we only return rows
    // with the corresponding field at or above the floor.
    const orderByMap: Record<Exclude<SortKey, "profit-desc" | "profit-asc" | "roi-desc" | "roi-asc">, object> = {
      "revenue-desc": { revenue: "desc" },
      "revenue-asc":  { revenue: "asc" },
      "budget-desc":  { budget: "desc" },
      "budget-asc":   { budget: "asc" },
      "year-desc":    { releaseDate: "desc" },
      "year-asc":     { releaseDate: "asc" },
      "title-asc":    { title: "asc" },
    };

    // Each sort has a "primary field" that must be present and ≥ floor —
    // sorting by revenue with rows that have null revenue would group
    // them all at one end of the result and crowd out real data.
    const where: Record<string, unknown> = {};
    if (sort.startsWith("revenue")) where.revenue = { gte: BOX_OFFICE_FLOOR };
    else if (sort.startsWith("budget")) where.budget = { gte: BOX_OFFICE_FLOOR };
    else if (sort.startsWith("year")) where.releaseDate = { not: null };
    else where.revenue = { gte: BOX_OFFICE_FLOOR }; // title-asc — still want real entries

    if (genreIds.length > 0) {
      where.genres = { some: { genreId: { in: genreIds } } };
    }
    if (mpaCodes.length > 0) {
      where.mpaaRating = { in: mpaCodes };
    }
    if (languages.length > 0) {
      where.originalLanguage = { in: languages };
    }
    if (releaseFrom || releaseTo) {
      const releaseDate: { gte?: string; lte?: string } = {};
      if (releaseFrom) releaseDate.gte = releaseFrom;
      if (releaseTo) releaseDate.lte = releaseTo;
      // Merge with any existing releaseDate filter (e.g. the year-sort
      // not-null filter above).
      const existing = (where.releaseDate as Record<string, unknown> | undefined) ?? {};
      where.releaseDate = { ...existing, ...releaseDate };
    }

    const [total, rows] = await Promise.all([
      prisma.movie.count({ where }),
      prisma.movie.findMany({
        where,
        orderBy: orderByMap[sort as keyof typeof orderByMap],
        take: limit,
        skip: offset,
        select: {
          tmdbId: true, title: true, posterPath: true, releaseDate: true,
          revenue: true, budget: true,
        },
      }),
    ]);

    const results: BoxOfficeRow[] = rows.map(toBoxOfficeRow);
    return NextResponse.json(await maskBlockedInResponse({ results, total, page, limit, hasMore: offset + rows.length < total }));
  } catch (err) {
    console.error("Box office list error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** Raw-SQL path for profit/ROI sorts. Builds the WHERE clause inline
 *  with parameter placeholders to keep the query injection-safe. */
async function runComputedSort(opts: {
  sort: "profit-desc" | "profit-asc" | "roi-desc" | "roi-asc";
  metric: "est" | "gross";
  genreIds: number[];
  mpaCodes: string[];
  languages: string[];
  releaseFrom: string | null;
  releaseTo: string | null;
  limit: number;
  offset: number;
}): Promise<NextResponse> {
  const { sort, metric, genreIds, mpaCodes, languages, releaseFrom, releaseTo, limit, offset } = opts;

  // Both profit and ROI need real revenue and a real budget. ROI
  // additionally needs the higher ROI_MIN_BUDGET floor so a $5K film
  // doesn't dominate the leaderboard.
  const params: unknown[] = [];
  const whereClauses: string[] = [];
  const push = (v: unknown) => { params.push(v); return `$${params.length}`; };

  whereClauses.push(`m.revenue >= ${push(Number(BOX_OFFICE_FLOOR))}`);
  whereClauses.push(`m.budget >= ${push(sort.startsWith("roi") ? Number(ROI_MIN_BUDGET) : Number(BOX_OFFICE_FLOOR))}`);

  if (releaseFrom) whereClauses.push(`m.release_date >= ${push(releaseFrom)}`);
  if (releaseTo) whereClauses.push(`m.release_date <= ${push(releaseTo)}`);
  if (mpaCodes.length > 0) {
    const placeholders = mpaCodes.map((c) => push(c)).join(",");
    whereClauses.push(`m.mpaa_rating IN (${placeholders})`);
  }
  if (languages.length > 0) {
    const placeholders = languages.map((l) => push(l)).join(",");
    whereClauses.push(`m.original_language IN (${placeholders})`);
  }
  if (genreIds.length > 0) {
    const placeholders = genreIds.map((g) => push(g)).join(",");
    whereClauses.push(
      `EXISTS (SELECT 1 FROM movie_genres mg WHERE mg.movie_id = m.id AND mg.genre_id IN (${placeholders}))`,
    );
  }

  const whereSql = whereClauses.join(" AND ");
  // Estimated formula must match lib/box-office.ts. Studio share 45%
  // of revenue minus production budget minus capped marketing
  // (min(budget × 50%, $150M)).
  const profitExpr = metric === "gross"
    ? "(m.revenue - m.budget)"
    : "(m.revenue::float * 0.45 - m.budget::float - LEAST(m.budget::float * 0.5, 150000000))";
  const roiExpr = metric === "gross"
    ? "(m.revenue::float / m.budget::float)"
    : "((m.revenue::float * 0.45) / (m.budget::float + LEAST(m.budget::float * 0.5, 150000000)))";
  const orderExpr =
    sort === "profit-desc" ? `${profitExpr} DESC`
    : sort === "profit-asc" ? `${profitExpr} ASC`
    : sort === "roi-desc" ? `${roiExpr} DESC`
    : `${roiExpr} ASC`;

  // Two queries: count + results. The count omits LIMIT/OFFSET.
  const countSql = `SELECT COUNT(*)::bigint AS count FROM movies m WHERE ${whereSql}`;
  const resultsSql = `
    SELECT m.tmdb_id, m.title, m.poster_path, m.release_date, m.revenue, m.budget
    FROM movies m
    WHERE ${whereSql}
    ORDER BY ${orderExpr}
    LIMIT ${push(limit)}
    OFFSET ${push(offset)}
  `;

  const [countRows, resultRows] = await Promise.all([
    prisma.$queryRawUnsafe<Array<{ count: bigint }>>(countSql, ...params.slice(0, params.length - 2)),
    prisma.$queryRawUnsafe<Array<{
      tmdb_id: number;
      title: string;
      poster_path: string | null;
      release_date: string | null;
      revenue: bigint;
      budget: bigint;
    }>>(resultsSql, ...params),
  ]);

  const total = Number(countRows[0]?.count ?? 0);
  const results: BoxOfficeRow[] = resultRows.map((r) =>
    toBoxOfficeRow({
      tmdbId: r.tmdb_id,
      title: r.title,
      posterPath: r.poster_path,
      releaseDate: r.release_date,
      revenue: r.revenue,
      budget: r.budget,
    }),
  );

  return NextResponse.json({
    results,
    total,
    page: Math.floor(offset / limit) + 1,
    limit,
    hasMore: offset + resultRows.length < total,
  });
}
