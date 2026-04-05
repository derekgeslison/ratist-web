import type { Metadata } from "next";
export const metadata: Metadata = { title: "Movies & TV" };
import { getPopularMovies, getTopRatedMovies, getNowPlayingMovies, getUpcomingMovies, searchMovies, discoverMovies, getGenres, MPAA_ORDER, getPopularShows, getTopRatedShows, searchShows, discoverShows, getShowGenres, getWatchProviders, getShowWatchProviders, type TMDBShow, STREAMING_PROVIDERS } from "@/lib/tmdb";
import MovieCard from "@/components/MovieCard";
import ShowCard from "@/components/ShowCard";
import MovieListItem from "@/components/MovieListItem";
import ShowListItem from "@/components/ShowListItem";
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

interface ShowResult {
  results: TMDBShow[];
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

  // Content type: "all" | "movie" | "tv"
  const contentType = params.type ?? "all";

  // New multi-value filters
  const genres = params.genres?.split(",").filter(Boolean);
  const castIds = params.cast?.split(",").filter(Boolean);
  const mpaaRatings = params.mpaa?.split(",").filter(Boolean) ?? [];
  const certMin = mpaaRatings.length > 0 ? MPAA_ORDER.find((r) => mpaaRatings.includes(r)) : undefined;
  const certMax = mpaaRatings.length > 0 ? [...MPAA_ORDER].reverse().find((r) => mpaaRatings.includes(r)) : undefined;

  const theaterStatus = params.theaterStatus; // "now_playing" | "upcoming" | undefined
  const providers = params.providers?.split(",").filter(Boolean);
  const showProviders = params.showProviders === "1";

  const hasFilters = !!(
    genres?.length ||
    castIds?.length ||
    params.yearFrom || params.yearTo ||
    mpaaRatings.length ||
    params.ratingVal ||
    providers?.length ||
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

  async function fetchMoviePages(fetcher: (p: number) => Promise<MovieResult>): Promise<MovieResult> {
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

  async function fetchShowPages(fetcher: (p: number) => Promise<ShowResult>): Promise<ShowResult> {
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
    providers,
    genre: params.genre,
    minRating: params.rating,
  };

  let movieResult: MovieResult | null = null;
  let showResult: ShowResult | null = null;
  let pageTitle = "Movies & TV";

  const showMovies = contentType === "all" || contentType === "movie";
  const showShows = contentType === "all" || contentType === "tv";

  // Fetch movies
  if (showMovies) {
    if (theaterStatus === "now_playing" && !hasFilters && !params.search) {
      movieResult = await fetchMoviePages((p) => getNowPlayingMovies(p));
      pageTitle = "Now Playing in Theaters";
    } else if (theaterStatus === "upcoming" && !hasFilters && !params.search) {
      movieResult = await fetchMoviePages((p) => getUpcomingMovies(p));
      pageTitle = "Coming Soon";
    } else if (params.search && !hasFilters && !theaterStatus) {
      movieResult = await fetchMoviePages((p) => searchMovies(params.search!, p));
      pageTitle = `Search: "${params.search}"`;
    } else if (params.search || hasFilters || theaterStatus) {
      movieResult = await fetchMoviePages((p) =>
        discoverMovies({ ...discoverOptions, query: params.search, page: p })
      );
      if (params.search) pageTitle = `Search: "${params.search}"`;
      else if (theaterStatus === "now_playing") pageTitle = "Now Playing in Theaters";
      else if (theaterStatus === "upcoming") pageTitle = "Coming Soon";
    } else if (sort === "top_rated") {
      movieResult = await fetchMoviePages((p) => getTopRatedMovies(p));
      pageTitle = contentType === "movie" ? "Top Rated Movies" : "Top Rated";
    } else {
      movieResult = await fetchMoviePages((p) => getPopularMovies(p));
      pageTitle = contentType === "movie" ? "Popular Movies" : "Popular";
    }
  }

  // Fetch shows
  if (showShows && contentType === "tv") {
    if (params.search && !hasFilters) {
      showResult = await fetchShowPages((p) => searchShows(params.search!, p));
      pageTitle = `Search: "${params.search}"`;
    } else if (params.search || hasFilters) {
      showResult = await fetchShowPages((p) =>
        discoverShows({
          genres: discoverOptions.genres,
          genreMode: discoverOptions.genreMode,
          sort,
          yearFrom: discoverOptions.yearFrom,
          yearTo: discoverOptions.yearTo,
          ratingGte: discoverOptions.ratingGte,
          ratingLte: discoverOptions.ratingLte,
          providers: discoverOptions.providers,
          page: p,
          query: params.search,
        })
      );
      if (params.search) pageTitle = `Search: "${params.search}"`;
    } else if (sort === "top_rated") {
      showResult = await fetchShowPages((p) => getTopRatedShows(p));
      pageTitle = "Top Rated TV Shows";
    } else {
      showResult = await fetchShowPages((p) => getPopularShows(p));
      pageTitle = "Popular TV Shows";
    }
  }

  // For "all" mode with TV, also get popular shows to show after movies
  if (contentType === "all" && !params.search && !hasFilters && !theaterStatus) {
    showResult = await fetchShowPages((p) => getPopularShows(p));
    pageTitle = "Movies & TV";
  }

  const genreList = await (contentType === "tv" ? getShowGenres() : getGenres());

  // When filtering by a single actor, fetch their credits to show character names
  let characterMap: Map<number, string> = new Map();
  if (castIds?.length === 1) {
    try {
      const API_KEY = process.env.TMDB_API_KEY;
      const creditsRes = await fetch(
        `https://api.themoviedb.org/3/person/${castIds[0]}?api_key=${API_KEY}&append_to_response=movie_credits,tv_credits`,
        { next: { revalidate: 3600 } }
      );
      if (creditsRes.ok) {
        const creditsData = await creditsRes.json();
        for (const c of creditsData.movie_credits?.cast ?? []) {
          if (c.character) characterMap.set(c.id, c.character);
        }
        for (const c of creditsData.tv_credits?.cast ?? []) {
          if (c.character) characterMap.set(c.id, c.character);
        }
      }
    } catch { /* ignore */ }
  }

  // Fetch streaming provider data when showProviders is on
  type ProviderInfo = { name: string; logo: string };
  const streamingMap = new Map<number, ProviderInfo[]>();
  const rentMap = new Map<number, ProviderInfo[]>();
  if (showProviders) {
    const movieIds = movieResult?.results.map((m) => m.id) ?? [];
    const showIds = showResult?.results.map((s) => s.id) ?? [];

    const [movieProviders, showProvidersList] = await Promise.all([
      Promise.all(movieIds.map((id) => getWatchProviders(id).catch(() => null))),
      Promise.all(showIds.map((id) => getShowWatchProviders(id).catch(() => null))),
    ]);

    function extractProviders(data: { flatrate?: { provider_name: string; logo_path: string }[]; rent?: { provider_name: string; logo_path: string }[] } | null, id: number) {
      if (!data) return;
      const stream = (data.flatrate ?? []).map((s) => ({ name: s.provider_name, logo: s.logo_path })).slice(0, 5);
      const rent = (data.rent ?? []).map((s) => ({ name: s.provider_name, logo: s.logo_path })).slice(0, 3);
      if (stream.length > 0) streamingMap.set(id, stream);
      if (rent.length > 0) rentMap.set(id, rent);
    }

    for (let i = 0; i < movieIds.length; i++) extractProviders(movieProviders[i] as never, movieIds[i]);
    for (let i = 0; i < showIds.length; i++) extractProviders(showProvidersList[i] as never, showIds[i]);
  }

  const totalResults = (movieResult?.total_results ?? 0) + (showResult?.total_results ?? 0);
  const totalPages = contentType === "tv"
    ? (showResult?.total_pages ?? 1)
    : (movieResult?.total_pages ?? 1);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-white mb-6">{pageTitle}</h1>

      <MoviesFilterBar
        genres={genreList.genres}
        totalResults={totalResults}
      />

      <AdUnit slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_MOVIES ?? ""} format="auto" className="mb-4" />

      {/* Movie results */}
      {movieResult && movieResult.results.length > 0 && (
        <>
          {contentType === "all" && <h2 className="text-lg font-semibold text-white mb-4">Movies</h2>}
          {view === "list" ? (
            <div className="flex flex-col divide-y divide-[var(--border)]">
              {movieResult.results.map((movie) => (
                <MovieListItem key={movie.id} movie={movie} characterName={characterMap.get(movie.id)} streaming={streamingMap.get(movie.id)} rent={rentMap.get(movie.id)} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
              {movieResult.results.map((movie) => (
                <MovieCard key={movie.id} movie={movie} characterName={characterMap.get(movie.id)} streaming={streamingMap.get(movie.id)} rent={rentMap.get(movie.id)} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Show results */}
      {showResult && showResult.results.length > 0 && (
        <div className={movieResult && movieResult.results.length > 0 ? "mt-10" : ""}>
          {contentType === "all" && <h2 className="text-lg font-semibold text-white mb-4">TV Shows</h2>}
          {view === "list" ? (
            <div className="flex flex-col divide-y divide-[var(--border)]">
              {showResult.results.map((show) => (
                <ShowListItem key={show.id} show={show} characterName={characterMap.get(show.id)} streaming={streamingMap.get(show.id)} rent={rentMap.get(show.id)} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
              {showResult.results.map((show) => (
                <ShowCard key={show.id} show={show} characterName={characterMap.get(show.id)} streaming={streamingMap.get(show.id)} rent={rentMap.get(show.id)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* No results */}
      {(!movieResult || movieResult.results.length === 0) && (!showResult || showResult.results.length === 0) && (
        <p className="text-[var(--foreground-muted)] text-center py-20">No results found.</p>
      )}

      {totalPages > 1 && (
        <Pagination current={page} total={totalPages} params={params} />
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
