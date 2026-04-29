import { NextRequest, NextResponse } from "next/server";
import {
  getReleases,
  getReleasesMultiPage,
  getShowReleases,
  getShowReleasesMultiPage,
  movieToUnified,
  showToUnified,
  type UnifiedRelease,
} from "@/lib/releases";

export const dynamic = "force-dynamic";

const HORIZON_TO_DAYS: Record<string, number> = {
  "30": 30,
  "90": 90,
  "180": 180,
  "365": 365,
};

const RELEASE_TYPE_MAP: Record<string, number[]> = {
  all: [2, 3, 4],
  theatrical: [2, 3],
  digital: [4],
};

const DAY_MS = 24 * 60 * 60 * 1000;
function isoDaysFromNow(days: number): string {
  return new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * GET /api/releases
 *
 * Backs the /releases client-side filter UI. Same filter shape as
 * `getReleases` plus a few UX-friendly aliases:
 *   - horizon=30|90|180|365  → window size in days
 *   - windowOffset=N         → days to slide the window forward from
 *                              today; default 0. "Look further out"
 *                              uses this to advance to the next
 *                              window.
 *   - pages=N                → fetch & concat N pages in parallel
 *                              (default 1; client uses 8 for the
 *                              well-known release catalog).
 *   - type=all|theatrical|digital  → movie release_type ids; ignored
 *                              for TV (TMDB has no equivalent
 *                              for /discover/tv).
 *   - mediaType=movie|all|tv → which streams to fetch. `movie` is
 *                              the default to match /movies. `all`
 *                              merges by popularity. `tv` is
 *                              series-premiere only — season
 *                              premieres need the snapshot
 *                              workstream.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const horizon = sp.get("horizon") ?? "180";
  const days = HORIZON_TO_DAYS[horizon] ?? 180;
  const offset = Math.max(0, parseInt(sp.get("windowOffset") ?? "0", 10) || 0);
  const fromDate = isoDaysFromNow(offset);
  const toDate = isoDaysFromNow(offset + days);

  const region = sp.get("region") ?? "US";
  const releaseTypes = RELEASE_TYPE_MAP[sp.get("type") ?? "all"] ?? RELEASE_TYPE_MAP.all;
  const genres = (sp.get("genres") ?? "").split(",")
    .map((g) => parseInt(g, 10)).filter((n) => !Number.isNaN(n));
  const certifications = (sp.get("mpa") ?? "").split(",").filter(Boolean);
  const mediaType = (sp.get("mediaType") ?? "movie").toLowerCase();
  const fetchMovies = mediaType === "movie" || mediaType === "all";
  const fetchShows = mediaType === "tv" || mediaType === "all";

  const pages = Math.min(10, Math.max(1, parseInt(sp.get("pages") ?? "1", 10) || 1));
  const singlePageNumber = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);

  const movieFilters = {
    fromDate,
    toDate,
    region,
    releaseTypes,
    genres: genres.length > 0 ? genres : undefined,
    certifications: certifications.length > 0 ? certifications : undefined,
    sortBy: "popularity.desc" as const,
  };
  const showFilters = {
    fromDate,
    toDate,
    genres: genres.length > 0 ? genres : undefined,
    sortBy: "popularity.desc" as const,
  };

  try {
    const [movieData, showData] = await Promise.all([
      fetchMovies
        ? (pages > 1
            ? getReleasesMultiPage(movieFilters, pages)
            : getReleases({ ...movieFilters, page: singlePageNumber }))
        : Promise.resolve(null),
      fetchShows
        ? (pages > 1
            ? getShowReleasesMultiPage(showFilters, pages)
            : getShowReleases({ ...showFilters, page: singlePageNumber }))
        : Promise.resolve(null),
    ]);

    const movieResults: UnifiedRelease[] = movieData?.results.map(movieToUnified) ?? [];
    const showResults: UnifiedRelease[] = showData?.results.map(showToUnified) ?? [];

    // For "all" mode, sort the merged list by popularity desc so the
    // client's date-grouped view places the most-anticipated item
    // first within each date — regardless of media type.
    const results = mediaType === "all"
      ? [...movieResults, ...showResults].sort((a, b) => b.popularity - a.popularity)
      : (fetchMovies ? movieResults : showResults);

    // total_pages reflects the larger of the two streams; it's only
    // used as a hint and the new sliding-window pagination doesn't
    // rely on it.
    const totalPages = Math.max(
      movieData?.total_pages ?? 0,
      showData?.total_pages ?? 0,
    );
    const totalResults = (movieData?.total_results ?? 0) + (showData?.total_results ?? 0);

    return NextResponse.json({
      results,
      total_results: totalResults,
      total_pages: totalPages,
      page: 1,
      pagesLoaded: pages,
    });
  } catch (err) {
    console.error("Releases API error:", err);
    return NextResponse.json({ results: [], total_results: 0, total_pages: 0, page: 1, pagesLoaded: 0 });
  }
}
