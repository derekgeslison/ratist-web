import type { Metadata } from "next";
export const metadata: Metadata = { title: "Movies & TV", description: "Browse and discover movies and TV shows. Filter by genre, streaming service, year, and more. Read community reviews and get personalized ratings." };
import { getPopularMovies, getTopRatedMovies, searchMovies, discoverMovies, getGenres, getPopularShows, getTopRatedShows, searchShows, discoverShows, getShowGenres, getWatchProviders, getShowWatchProviders, type TMDBMovie, type TMDBShow, STREAMING_PROVIDERS } from "@/lib/tmdb";
import MovieCard from "@/components/MovieCard";
import ShowCard from "@/components/ShowCard";
import MovieListItem from "@/components/MovieListItem";
import ShowListItem from "@/components/ShowListItem";
import MoviesFilterBar from "@/components/MoviesFilterBar";
import AdUnit from "@/components/AdUnit";

// Genre ID mappings between movie and TV (TMDB uses different IDs for equivalent genres)
const GENRE_MOVIE_TO_TV: Record<string, string[]> = {
  "28": ["10759"],   // Action → Action & Adventure
  "12": ["10759"],   // Adventure → Action & Adventure
  "878": ["10765"],  // Science Fiction → Sci-Fi & Fantasy
  "14": ["10765"],   // Fantasy → Sci-Fi & Fantasy
  "10752": ["10768"], // War → War & Politics
};
const MOVIE_ONLY_GENRES = new Set(["36", "27", "10402", "10749", "53", "10770"]);

function translateGenresForTV(genres: string[]): string[] {
  const result = new Set<string>();
  for (const gid of genres) {
    if (GENRE_MOVIE_TO_TV[gid]) {
      for (const mapped of GENRE_MOVIE_TO_TV[gid]) result.add(mapped);
    } else if (!MOVIE_ONLY_GENRES.has(gid)) {
      result.add(gid);
    }
  }
  return [...result];
}

type MixedItem =
  | { type: "movie"; data: TMDBMovie; popularity: number }
  | { type: "show"; data: TMDBShow; popularity: number };

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

  const releaseStatus = params.releaseStatus; // "now_playing" | "upcoming" | undefined
  const providers = params.providers?.split(",").filter(Boolean);
  const showProviders = params.showProviders === "1";
  const language = params.language;
  const keywords = params.keywords;

  const hasFilters = !!(
    genres?.length ||
    castIds?.length ||
    params.yearFrom || params.yearTo ||
    mpaaRatings.length ||
    params.ratingVal ||
    providers?.length ||
    language ||
    keywords ||
    releaseStatus ||
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
    certifications: mpaaRatings.length > 0 ? mpaaRatings : undefined,
    ratingGte: params.ratingOp !== "lte" ? params.ratingVal : undefined,
    ratingLte: params.ratingOp === "lte" ? params.ratingVal : undefined,
    providers,
    language,
    keywords,
    releaseStatus,
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
    if (params.search && !hasFilters) {
      movieResult = await fetchMoviePages((p) => searchMovies(params.search!, p));
      pageTitle = `Search: "${params.search}"`;
    } else if (params.search || hasFilters) {
      movieResult = await fetchMoviePages((p) =>
        discoverMovies({ ...discoverOptions, query: params.search, page: p })
      );
      if (params.search) pageTitle = `Search: "${params.search}"`;
      else if (releaseStatus === "now_playing") pageTitle = "Now Playing in Theaters";
      else if (releaseStatus === "upcoming") pageTitle = "Coming Soon";
    } else if (sort === "popular") {
      movieResult = await fetchMoviePages((p) => getPopularMovies(p));
      pageTitle = contentType === "movie" ? "Popular Movies" : "Popular";
    } else if (sort === "top_rated") {
      movieResult = await fetchMoviePages((p) => getTopRatedMovies(p));
      pageTitle = contentType === "movie" ? "Top Rated Movies" : "Top Rated";
    } else {
      // newest, oldest, title_az, title_za — use discover endpoint which handles all sort values
      movieResult = await fetchMoviePages((p) =>
        discoverMovies({ ...discoverOptions, page: p })
      );
      const SORT_TITLES: Record<string, string> = { newest: "Newest", oldest: "Oldest", title_az: "Title A–Z", title_za: "Title Z–A" };
      pageTitle = contentType === "movie" ? `${SORT_TITLES[sort] ?? "Movies"} Movies` : SORT_TITLES[sort] ?? "Movies & TV";
    }
  }

  // Fetch shows — for "tv" mode OR for "all" mode when searching/filtering
  const shouldFetchShows = contentType === "tv" || (contentType === "all");
  if (showShows && shouldFetchShows) {
    const isSearchOrFilter = !!(params.search || hasFilters);
    const tvGenres = genres?.length ? translateGenresForTV(genres) : undefined;
    const tvDiscoverOptions = {
      genres: tvGenres,
      genreMode: discoverOptions.genreMode,
      sort,
      yearFrom: discoverOptions.yearFrom,
      yearTo: discoverOptions.yearTo,
      ratingGte: discoverOptions.ratingGte,
      ratingLte: discoverOptions.ratingLte,
      providers: discoverOptions.providers,
      language: discoverOptions.language,
      keywords: discoverOptions.keywords,
      releaseStatus,
    };

    if (params.search && !hasFilters) {
      showResult = await fetchShowPages((p) => searchShows(params.search!, p));
    } else if (isSearchOrFilter) {
      showResult = await fetchShowPages((p) =>
        discoverShows({ ...tvDiscoverOptions, page: p, query: params.search })
      );
    } else if (!isSearchOrFilter) {
      if (sort === "popular") {
        showResult = await fetchShowPages((p) => getPopularShows(p));
        if (contentType === "tv") pageTitle = "Popular TV Shows";
      } else if (sort === "top_rated") {
        showResult = await fetchShowPages((p) => getTopRatedShows(p));
        if (contentType === "tv") pageTitle = "Top Rated TV Shows";
      } else {
        showResult = await fetchShowPages((p) =>
          discoverShows({ ...tvDiscoverOptions, page: p })
        );
        if (contentType === "tv") {
          const SORT_TITLES: Record<string, string> = { newest: "Newest", oldest: "Oldest", title_az: "Title A–Z", title_za: "Title Z–A" };
          pageTitle = `${SORT_TITLES[sort] ?? ""} TV Shows`;
        }
      }
    }
    if (contentType === "tv") {
      if (params.search) pageTitle = `Search: "${params.search}"`;
      else if (releaseStatus === "now_playing") pageTitle = "Currently Airing";
      else if (releaseStatus === "upcoming") pageTitle = "Coming Soon";
    }
  }

  if (!params.search && !hasFilters && contentType === "all") {
    pageTitle = "Movies & TV";
  }

  // When searching/filtering in "all" mode, merge movies + shows by relevance (popularity)
  const isSearchMode = contentType === "all" && !!(params.search || hasFilters);
  let mixedResults: MixedItem[] = [];
  if (isSearchMode && (movieResult || showResult)) {
    const movies: MixedItem[] = (movieResult?.results ?? []).map((m) => ({ type: "movie" as const, data: m, popularity: m.popularity }));
    const shows: MixedItem[] = (showResult?.results ?? []).map((s) => ({ type: "show" as const, data: s, popularity: s.popularity }));
    mixedResults = [...movies, ...shows].sort((a, b) => b.popularity - a.popularity).slice(0, perPage);
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
  type ProviderInfo = { name: string; logo: string; providerId?: number };
  const streamingMap = new Map<number, ProviderInfo[]>();
  const rentMap = new Map<number, ProviderInfo[]>();
  if (showProviders) {
    const movieIds = movieResult?.results.map((m) => m.id) ?? [];
    const showIds = showResult?.results.map((s) => s.id) ?? [];

    const [movieProviders, showProvidersList] = await Promise.all([
      Promise.all(movieIds.map((id) => getWatchProviders(id).catch(() => null))),
      Promise.all(showIds.map((id) => getShowWatchProviders(id).catch(() => null))),
    ]);

    function extractProviders(data: { flatrate?: { provider_id: number; provider_name: string; logo_path: string }[]; rent?: { provider_id: number; provider_name: string; logo_path: string }[] } | null, id: number) {
      if (!data) return;
      const stream = (data.flatrate ?? []).map((s) => ({ name: s.provider_name, logo: s.logo_path, providerId: s.provider_id })).slice(0, 5);
      const rent = (data.rent ?? []).map((s) => ({ name: s.provider_name, logo: s.logo_path, providerId: s.provider_id })).slice(0, 3);
      if (stream.length > 0) streamingMap.set(id, stream);
      if (rent.length > 0) rentMap.set(id, rent);
    }

    for (let i = 0; i < movieIds.length; i++) extractProviders(movieProviders[i] as never, movieIds[i]);
    for (let i = 0; i < showIds.length; i++) extractProviders(showProvidersList[i] as never, showIds[i]);
  }

  const totalResults = (movieResult?.total_results ?? 0) + (showResult?.total_results ?? 0);
  const totalPages = contentType === "tv"
    ? (showResult?.total_pages ?? 1)
    : contentType === "all"
      ? Math.max(movieResult?.total_pages ?? 1, showResult?.total_pages ?? 1)
      : (movieResult?.total_pages ?? 1);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-white mb-6">{pageTitle}</h1>

      <MoviesFilterBar
        genres={genreList.genres}
        totalResults={totalResults}
      />

      <AdUnit slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_MOVIES ?? ""} format="auto" className="mb-4" />

      {/* Mixed results — when searching/filtering in "all" mode, interleave by relevance */}
      {isSearchMode && mixedResults.length > 0 && (
        view === "list" ? (
          <div className="flex flex-col divide-y divide-[var(--border)]">
            {mixedResults.map((item) =>
              item.type === "movie" ? (
                <MovieListItem key={`m-${item.data.id}`} movie={item.data} characterName={characterMap.get(item.data.id)} streaming={streamingMap.get(item.data.id)} rent={rentMap.get(item.data.id)} />
              ) : (
                <ShowListItem key={`s-${item.data.id}`} show={item.data} characterName={characterMap.get(item.data.id)} streaming={streamingMap.get(item.data.id)} rent={rentMap.get(item.data.id)} />
              )
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            {mixedResults.map((item) =>
              item.type === "movie" ? (
                <MovieCard key={`m-${item.data.id}`} movie={item.data} characterName={characterMap.get(item.data.id)} streaming={streamingMap.get(item.data.id)} rent={rentMap.get(item.data.id)} />
              ) : (
                <ShowCard key={`s-${item.data.id}`} show={item.data} characterName={characterMap.get(item.data.id)} streaming={streamingMap.get(item.data.id)} rent={rentMap.get(item.data.id)} />
              )
            )}
          </div>
        )
      )}

      {/* Separate sections — browsing mode (no search/filters in "all" mode) */}
      {!isSearchMode && movieResult && movieResult.results.length > 0 && (
        <>
          {contentType === "all" && showResult && showResult.results.length > 0 && <h2 className="text-lg font-semibold text-white mb-4">Movies</h2>}
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

      {!isSearchMode && showResult && showResult.results.length > 0 && (
        <div className={!isSearchMode && movieResult && movieResult.results.length > 0 ? "mt-10" : ""}>
          {contentType === "all" && movieResult && movieResult.results.length > 0 && <h2 className="text-lg font-semibold text-white mb-4">TV Shows</h2>}
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
      {(isSearchMode ? mixedResults.length === 0 : ((!movieResult || movieResult.results.length === 0) && (!showResult || showResult.results.length === 0))) && (
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

  // Build page numbers: always show at least 5, with first/last + ellipsis when needed
  const VISIBLE = 5;
  const pages: (number | "...")[] = [];

  if (total <= VISIBLE + 2) {
    // Small total — show all pages
    for (let i = 1; i <= total; i++) pages.push(i);
  } else {
    // Always show page 1
    pages.push(1);

    // Calculate window center
    let start = Math.max(2, current - Math.floor(VISIBLE / 2));
    let end = start + VISIBLE - 1;
    if (end >= total) {
      end = total - 1;
      start = Math.max(2, end - VISIBLE + 1);
    }

    if (start > 2) pages.push("...");
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < total - 1) pages.push("...");

    // Always show last page
    pages.push(total);
  }

  const linkClass = "px-3 py-1.5 text-sm rounded border transition-colors";
  const inactiveClass = `${linkClass} border-[var(--border)] text-[var(--foreground-muted)] hover:border-[var(--ratist-red)] hover:text-white`;
  const activeClass = `${linkClass} border-[var(--ratist-red)] text-white bg-[var(--ratist-red)]/10`;

  return (
    <div className="flex flex-col items-center gap-3 mt-10">
      <div className="flex items-center gap-1.5 flex-wrap justify-center">
        {current > 1 && (
          <a href={buildUrl(current - 1)} className={inactiveClass}>
            ← Prev
          </a>
        )}
        {pages.map((p, i) =>
          p === "..." ? (
            <span key={`ellipsis-${i}`} className="px-2 py-1.5 text-sm text-[var(--foreground-muted)]">...</span>
          ) : (
            <a key={p} href={buildUrl(p)} className={p === current ? activeClass : inactiveClass}>
              {p}
            </a>
          )
        )}
        {current < total && (
          <a href={buildUrl(current + 1)} className={inactiveClass}>
            Next →
          </a>
        )}
      </div>
      {total > VISIBLE && (
        <p className="text-xs text-[var(--foreground-muted)]">
          Page {current} of {total.toLocaleString()}
        </p>
      )}
    </div>
  );
}
