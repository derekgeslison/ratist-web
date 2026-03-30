import type { Metadata } from "next";
export const metadata: Metadata = { title: "Movies" };
import { getPopularMovies, getTopRatedMovies, getNowPlayingMovies, getUpcomingMovies, searchMovies, discoverMovies, getGenres, MPAA_ORDER } from "@/lib/tmdb";
import MovieCard from "@/components/MovieCard";
import MovieListItem from "@/components/MovieListItem";
import MoviesFilterBar from "@/components/MoviesFilterBar";
import AdUnit from "@/components/AdUnit";

interface Props {
  searchParams: Promise<Record<string, string | undefined>>;
}

interface MovieResult {
  results: Awaited<ReturnType<typeof getPopularMovies>>["results"];
  total_results: number;
  total_pages: number;
}

export default async function MoviesPage({ searchParams }: Props) {
  const params = await searchParams;
  const view = params.view ?? "grid";
  const page = Math.max(1, Number(params.page ?? 1));
  const sort = params.sort ?? "popular";
  const perPage = [20, 50, 100].includes(Number(params.perPage)) ? Number(params.perPage) : 20;
  const tmdbPagesNeeded = Math.ceil(perPage / 20);
  const tmdbStartPage = (page - 1) * tmdbPagesNeeded + 1;

  // New multi-value filters
  const genres = params.genres?.split(",").filter(Boolean);
  const castIds = params.cast?.split(",").filter(Boolean);
  const mpaaRatings = params.mpaa?.split(",").filter(Boolean) ?? [];
  const certMin = mpaaRatings.length > 0 ? MPAA_ORDER.find((r) => mpaaRatings.includes(r)) : undefined;
  const certMax = mpaaRatings.length > 0 ? [...MPAA_ORDER].reverse().find((r) => mpaaRatings.includes(r)) : undefined;

  const theaterStatus = params.theaterStatus; // "now_playing" | "upcoming" | undefined

  const hasFilters = !!(
    genres?.length ||
    castIds?.length ||
    params.yearFrom || params.yearTo ||
    mpaaRatings.length ||
    params.ratingVal ||
    // legacy
    params.genre || params.decade || params.rating
  );

  // Legacy decade → year range
  const DECADES: Record<string, { from: string; to: string }> = {
    "2020s": { from: "2020", to: "2029" },
    "2010s": { from: "2010", to: "2019" },
    "2000s": { from: "2000", to: "2009" },
    "1990s": { from: "1990", to: "1999" },
    "1980s": { from: "1980", to: "1989" },
    "Classic": { from: "1900", to: "1979" },
  };
  const legacyDecade = params.decade ? DECADES[params.decade] : undefined;

  async function fetchPages(fetcher: (p: number) => Promise<MovieResult>): Promise<MovieResult> {
    const responses = await Promise.all(
      Array.from({ length: tmdbPagesNeeded }, (_, i) => fetcher(tmdbStartPage + i))
    );
    return {
      results: responses.flatMap((r) => r.results).slice(0, perPage),
      total_results: responses[0]?.total_results ?? 0,
      total_pages: Math.min(
        Math.ceil((responses[0]?.total_results ?? 0) / perPage),
        Math.floor(500 / tmdbPagesNeeded)
      ),
    };
  }

  const discoverOptions = {
    genres,
    genreMode: params.genreMode as "any" | "all" | undefined,
    castIds,
    sort,
    yearFrom: params.yearFrom ?? legacyDecade?.from,
    yearTo: params.yearTo ?? legacyDecade?.to,
    certMin,
    certMax,
    ratingGte: params.ratingOp !== "lte" ? params.ratingVal : undefined,
    ratingLte: params.ratingOp === "lte" ? params.ratingVal : undefined,
    genre: params.genre,
    minRating: params.rating,
  };

  let result: MovieResult;
  let pageTitle = "Movies";

  if (theaterStatus === "now_playing" && !hasFilters && !params.search) {
    result = await fetchPages((p) => getNowPlayingMovies(p));
    pageTitle = "Now Playing in Theaters";
  } else if (theaterStatus === "upcoming" && !hasFilters && !params.search) {
    result = await fetchPages((p) => getUpcomingMovies(p));
    pageTitle = "Coming Soon";
  } else if (params.search && !hasFilters && !theaterStatus) {
    // Pure text search — use TMDB search API for better relevance ranking
    result = await fetchPages((p) => searchMovies(params.search!, p));
    pageTitle = `Search: "${params.search}"`;
  } else if (params.search || hasFilters || theaterStatus) {
    // Text search + filters combined, or filters only — use discover with optional text query
    result = await fetchPages((p) =>
      discoverMovies({ ...discoverOptions, query: params.search, page: p })
    );
    if (params.search) pageTitle = `Search: "${params.search}"`;
    else if (theaterStatus === "now_playing") pageTitle = "Now Playing in Theaters";
    else if (theaterStatus === "upcoming") pageTitle = "Coming Soon";
  } else if (sort === "top_rated") {
    result = await fetchPages((p) => getTopRatedMovies(p));
    pageTitle = "Top Rated Movies";
  } else {
    result = await fetchPages((p) => getPopularMovies(p));
    pageTitle = "Popular Movies";
  }

  const genreList = await getGenres();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-white mb-6">{pageTitle}</h1>

      <MoviesFilterBar
        genres={genreList.genres}
        totalResults={result.total_results}
      />

      <AdUnit slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_MOVIES ?? ""} format="auto" className="mb-4" />

      {result.results.length === 0 ? (
        <p className="text-[var(--foreground-muted)] text-center py-20">No movies found.</p>
      ) : view === "list" ? (
        <div className="flex flex-col divide-y divide-[var(--border)]">
          {result.results.map((movie) => (
            <MovieListItem key={movie.id} movie={movie} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
          {result.results.map((movie) => (
            <MovieCard key={movie.id} movie={movie} />
          ))}
        </div>
      )}

      {result.total_pages > 1 && (
        <Pagination current={page} total={result.total_pages} params={params} />
      )}
    </div>
  );
}

function Pagination({
  current,
  total,
  params,
}: {
  current: number;
  total: number;
  params: Record<string, string | undefined>;
}) {
  function buildUrl(p: number) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v && k !== "page") q.set(k, v);
    }
    q.set("page", String(p));
    return `/movies?${q.toString()}`;
  }

  const pages = [];
  const start = Math.max(1, current - 2);
  const end = Math.min(total, current + 2);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className="flex items-center justify-center gap-2 mt-10">
      {current > 1 && (
        <a href={buildUrl(current - 1)} className="px-3 py-1.5 text-sm rounded border border-[var(--border)] text-[var(--foreground-muted)] hover:border-[var(--ratist-red)] hover:text-white transition-colors">
          ← Prev
        </a>
      )}
      {pages.map((p) => (
        <a
          key={p}
          href={buildUrl(p)}
          className={`px-3 py-1.5 text-sm rounded border transition-colors ${
            p === current
              ? "border-[var(--ratist-red)] text-white bg-[var(--ratist-red)]/10"
              : "border-[var(--border)] text-[var(--foreground-muted)] hover:border-[var(--ratist-red)] hover:text-white"
          }`}
        >
          {p}
        </a>
      ))}
      {current < total && (
        <a href={buildUrl(current + 1)} className="px-3 py-1.5 text-sm rounded border border-[var(--border)] text-[var(--foreground-muted)] hover:border-[var(--ratist-red)] hover:text-white transition-colors">
          Next →
        </a>
      )}
    </div>
  );
}
