import type { Metadata } from "next";
export const metadata: Metadata = { title: "Movies & TV", description: "Find movies and TV shows to watch. Filter by genre, streaming service, year, and rating. Community reviews, personalized recommendations, and deep criteria-based ratings.", alternates: { canonical: "/movies" } };
import { getPopularMovies, getTopRatedMovies, searchMovies, discoverMovies, getGenres, getPopularShows, getTopRatedShows, searchShows, discoverShows, getShowGenres, getWatchProviders, getShowWatchProviders, englishFirst, type TMDBMovie, type TMDBShow, STREAMING_PROVIDERS } from "@/lib/tmdb";
import { safeguardTMDBMovies, safeguardTMDBShows } from "@/lib/safe-content";
import MovieCard from "@/components/MovieCard";
import ShowCard from "@/components/ShowCard";
import MovieListItem from "@/components/MovieListItem";
import ShowListItem from "@/components/ShowListItem";
import MoviesFilterBar from "@/components/MoviesFilterBar";
import MoviesAiSearch from "@/components/MoviesAiSearch";
import SeenFilterRunner from "@/components/SeenFilterRunner";
import SeenMoviesView from "@/components/SeenMoviesView";
import NavEntryRegister from "@/components/NavEntryRegister";
import AdUnit from "@/components/AdUnit";
import SpotlightCards from "@/components/SpotlightCards";
import TapHoldHint from "@/components/TapHoldHint";
import { prisma } from "@/lib/prisma";

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

  // Seen-filter mode. When `seenStatus=seen`, querying TMDB Discover
  // doesn't make sense (it has no concept of the user's seen list), so
  // we render <SeenMoviesView /> which queries our DB instead. The
  // legacy DOM-walking SeenFilterRunner only handled the post-fetch
  // hide pass; on a "Seen + Horror" query the page would still surface
  // 13k unrelated results because TMDB had returned the global horror
  // catalog and we just hid the unseen tiles.
  const seenStatus = params.seenStatus;
  const seenOnlyMode = seenStatus === "seen";

  // New multi-value filters
  const genres = params.genres?.split(",").filter(Boolean);
  const castIds = params.cast?.split(",").filter(Boolean);
  const mpaaRatings = params.mpaa?.split(",").filter(Boolean) ?? [];
  // Split the rating filter into movie + TV halves. Movie certs flow
  // into TMDB's /discover/movie `certification` param; TV certs have
  // no /discover/tv equivalent and are post-filtered against our
  // contentRating cache after the fetch.
  const TV_RATING_SET = new Set(["TV-Y", "TV-Y7", "TV-G", "TV-PG", "TV-14", "TV-MA"]);
  const movieMpaaRatings = mpaaRatings.filter((r) => !TV_RATING_SET.has(r));
  const tvMpaaRatings = mpaaRatings.filter((r) => TV_RATING_SET.has(r));

  const releaseStatus = params.releaseStatus; // "now_playing" | "upcoming" | undefined
  const providers = params.providers?.split(",").filter(Boolean);
  const showProviders = params.showProviders === "1";
  const language = params.language;
  const keywords = params.keywords;
  const excludeKeywords = params.excludeKeywords;
  const companies = params.companies?.split(",").filter(Boolean);

  // AI-powered hidden filters (applied as post-filters after TMDB fetch).
  // Surfaced to the user as a single removable "AI filter" pill; the specific
  // dimensions aren't shown on the filter bar.
  const excludeGenres = params.excludeGenres?.split(",").filter(Boolean) ?? [];
  const excludeLanguages = params.excludeLanguages?.split(",").filter(Boolean) ?? [];
  const excludeAnime = params.excludeAnime === "1";
  const SEVERITY_VALUES = ["none", "mild", "mild-moderate", "moderate", "moderate-severe", "severe"];
  const severityOf = (v: string | undefined) => (v && SEVERITY_VALUES.includes(v) ? v : null);
  const severityCaps = {
    maxViolence: severityOf(params.maxViolence),
    maxSexualContent: severityOf(params.maxSexualContent),
    maxLanguageSubstance: severityOf(params.maxLanguageSubstance),
    maxScaryIntense: severityOf(params.maxScaryIntense),
    maxSensitiveThemes: severityOf(params.maxSensitiveThemes),
    minViolence: severityOf(params.minViolence),
    minSexualContent: severityOf(params.minSexualContent),
    minLanguageSubstance: severityOf(params.minLanguageSubstance),
    minScaryIntense: severityOf(params.minScaryIntense),
    minSensitiveThemes: severityOf(params.minSensitiveThemes),
  };
  const hasHiddenAiFilters = excludeGenres.length > 0
    || excludeLanguages.length > 0
    || excludeAnime
    || !!excludeKeywords
    || Object.values(severityCaps).some((v) => v !== null);
  const hasMaxCap = severityCaps.maxViolence || severityCaps.maxSexualContent || severityCaps.maxLanguageSubstance || severityCaps.maxScaryIntense || severityCaps.maxSensitiveThemes;
  const hasMinCap = severityCaps.minViolence || severityCaps.minSexualContent || severityCaps.minLanguageSubstance || severityCaps.minScaryIntense || severityCaps.minSensitiveThemes;

  const hasFilters = !!(
    genres?.length ||
    castIds?.length ||
    params.yearFrom || params.yearTo ||
    mpaaRatings.length ||
    params.ratingVal ||
    providers?.length ||
    companies?.length ||
    language ||
    keywords ||
    releaseStatus ||
    hasHiddenAiFilters ||
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

  // Initial parallel fetch covers what perPage needs plus a fixed buffer
  // so the dedupe pass (TMDB occasionally repeats titles across consecutive
  // popularity-sorted pages) and the downstream pruning passes
  // (NC-17/adult hide, AI severity caps, TV cert post-filter, blocked
  // posters) have headroom to absorb losses before we'd dip under perPage.
  //
  // After the parallel batch, a short serial top-up loop keeps fetching
  // additional pages until we have at least `perPage * 1.5` distinct
  // items, or hit the safety cap. This handles the rare heavy-duplication
  // case (e.g., the tail of a sort) without unbounded latency.
  const INITIAL_BUFFER_PAGES = 2;
  const TOPUP_MIN_TARGET = Math.ceil(perPage * 1.5);
  const TOPUP_MAX_PAGES = 5;
  // TMDB caps discover/search at page 500. Past that, every request 422s.
  const TMDB_PAGE_CAP = 500;

  async function fetchMoviePages(fetcher: (p: number) => Promise<MovieResult>): Promise<MovieResult> {
    const seen = new Set<number>();
    const results: MovieResult["results"] = [];

    function addUnique(data: MovieResult) {
      for (const m of data.results) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        results.push(m);
      }
    }

    const responses: MovieResult[] = await Promise.all(
      Array.from(
        { length: tmdbPagesNeeded + INITIAL_BUFFER_PAGES },
        (_, i) => fetcher(tmdbStartPage + i),
      ),
    );
    for (const r of responses) addUnique(r);
    const firstTotal = responses[0]?.total_results ?? 0;

    let nextPage = tmdbStartPage + tmdbPagesNeeded + INITIAL_BUFFER_PAGES;
    let topupAttempts = 0;
    while (
      results.length < TOPUP_MIN_TARGET
      && topupAttempts < TOPUP_MAX_PAGES
      && nextPage <= TMDB_PAGE_CAP
    ) {
      let data: MovieResult;
      try { data = await fetcher(nextPage); } catch { break; }
      if (data.results.length === 0) break;
      addUnique(data);
      nextPage++;
      topupAttempts++;
    }

    return {
      results,
      total_results: firstTotal,
      total_pages: Math.min(
        Math.ceil(firstTotal / perPage),
        Math.floor(TMDB_PAGE_CAP / tmdbPagesNeeded),
      ),
    };
  }

  async function fetchShowPages(fetcher: (p: number) => Promise<ShowResult>): Promise<ShowResult> {
    const seen = new Set<number>();
    const results: ShowResult["results"] = [];

    function addUnique(data: ShowResult) {
      for (const s of data.results) {
        if (seen.has(s.id)) continue;
        seen.add(s.id);
        results.push(s);
      }
    }

    const responses: ShowResult[] = await Promise.all(
      Array.from(
        { length: tmdbPagesNeeded + INITIAL_BUFFER_PAGES },
        (_, i) => fetcher(tmdbStartPage + i),
      ),
    );
    for (const r of responses) addUnique(r);
    const firstTotal = responses[0]?.total_results ?? 0;

    let nextPage = tmdbStartPage + tmdbPagesNeeded + INITIAL_BUFFER_PAGES;
    let topupAttempts = 0;
    while (
      results.length < TOPUP_MIN_TARGET
      && topupAttempts < TOPUP_MAX_PAGES
      && nextPage <= TMDB_PAGE_CAP
    ) {
      let data: ShowResult;
      try { data = await fetcher(nextPage); } catch { break; }
      if (data.results.length === 0) break;
      addUnique(data);
      nextPage++;
      topupAttempts++;
    }

    return {
      results,
      total_results: firstTotal,
      total_pages: Math.min(
        Math.ceil(firstTotal / perPage),
        Math.floor(TMDB_PAGE_CAP / tmdbPagesNeeded),
      ),
    };
  }

  // Relevance sort: use popularity ordering from TMDB, and when the user
  // hasn't explicitly forced "all" mode, broaden to "any" so the client-side
  // match-count sort below can tier 4/4 > 3/4 > 2/4 > 1/4. When the user
  // explicitly picks genreMode=all, we respect that (strict AND, no fallback).
  const isRelevance = sort === "relevance";
  const userSetStrictMode = params.genreMode === "all";
  const effectiveGenreMode = userSetStrictMode
    ? "all"
    : (isRelevance && genres && genres.length >= 2 ? "any" : (params.genreMode as "any" | "all" | undefined));
  const effectiveSort = isRelevance ? "popular" : sort;

  const discoverOptions = {
    genres,
    excludeGenres: excludeGenres.length > 0 ? excludeGenres : undefined,
    genreMode: effectiveGenreMode,
    castIds,
    sort: effectiveSort,
    yearFrom: params.yearFrom ?? legacyDecade?.from,
    yearTo: params.yearTo ?? legacyDecade?.to,
    certifications: movieMpaaRatings.length > 0 ? movieMpaaRatings : undefined,
    ratingGte: params.ratingOp !== "lte" ? params.ratingVal : undefined,
    ratingLte: params.ratingOp === "lte" ? params.ratingVal : undefined,
    providers,
    companies,
    language,
    keywords,
    excludeKeywords,
    releaseStatus,
    genre: params.genre,
    minRating: params.rating,
  };

  let movieResult: MovieResult | null = null;
  let showResult: ShowResult | null = null;
  let pageTitle = "Movies & TV";

  const showMovies = contentType === "all" || contentType === "movie";
  const showShows = contentType === "all" || contentType === "tv";

  // When the user picks TV-only certs (e.g., TV-MA) in "all" mode, we
  // suppress the movie fetch so the listing doesn't pad with unfiltered
  // films alongside the cert-filtered TV results. Mirror of the
  // movie-only-cert → suppress-TV branch in shouldFetchShows below.
  const shouldFetchMovies = contentType === "movie" || (
    contentType === "all" && !(tvMpaaRatings.length > 0 && movieMpaaRatings.length === 0)
  );

  // Fetch movies — skipped entirely in seen-only mode (the SeenMoviesView
  // client component queries our DB and renders below in place of these
  // TMDB-backed results).
  if (showMovies && shouldFetchMovies && !seenOnlyMode) {
    if (params.search) {
      // Any sort + any filter set: still use /search/movie. TMDB's
      // /discover/movie silently drops `with_text_query`, so falling
      // back to discover when sort != "popular" was throwing away
      // the search term and returning the global top-N by sort
      // instead. Sort gets applied in-memory below (search has no
      // sort_by param).
      movieResult = await fetchMoviePages((p) => searchMovies(params.search!, p));
      pageTitle = `Search: "${params.search}"`;
    } else if (hasFilters) {
      movieResult = await fetchMoviePages((p) =>
        discoverMovies({ ...discoverOptions, page: p })
      );
      if (releaseStatus === "now_playing") pageTitle = "Now Playing in Theaters";
      else if (releaseStatus === "upcoming") pageTitle = "Coming Soon";
    } else if (sort === "popular") {
      movieResult = await fetchMoviePages((p) => getPopularMovies(p));
      // English-first reorder: TMDB's /movie/popular surfaces a lot
      // of regional hits ahead of films our English-language audience
      // cares about. Stable partition keeps non-English titles in
      // the list, just below the English tier.
      movieResult.results = englishFirst(movieResult.results);
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

  // Fetch shows — for "tv" mode OR for "all" mode when searching/filtering.
  // Skip shows in "all" mode when the active filters can't apply to TV
  // and would otherwise leak through unfiltered:
  //   - cast filter (TMDB TV discover doesn't support with_cast)
  //   - any movie-only genre (Romance / Horror / etc. — no TV equivalent)
  //   - MPAA cert filter (TMDB TV discover doesn't support certification;
  //     TV uses content_ratings as a separate field)
  //   - parents'-guide severity caps (only tracked for movies in our DB)
  const hasMovieOnlyGenre = contentType === "all" && genres && genres.some((g) => MOVIE_ONLY_GENRES.has(g));
  const shouldFetchShows = contentType === "tv" || (
    contentType === "all"
      && !castIds?.length
      && !hasMovieOnlyGenre
      // Movie-only cert filter means the user has signaled a movie-
      // shape intent; suppress TV. TV-only certs (or no cert filter)
      // still fetch shows, since we can post-filter shows against
      // their contentRating cache.
      && movieMpaaRatings.length === 0
      && !hasMaxCap
      && !hasMinCap
  );
  if (showShows && shouldFetchShows && !seenOnlyMode) {
    const isSearchOrFilter = !!(params.search || hasFilters);
    const tvGenres = genres?.length ? translateGenresForTV(genres) : undefined;
    const tvExcludeGenres = excludeGenres.length > 0 ? translateGenresForTV(excludeGenres) : undefined;
    const tvDiscoverOptions = {
      genres: tvGenres,
      excludeGenres: tvExcludeGenres && tvExcludeGenres.length > 0 ? tvExcludeGenres : undefined,
      genreMode: discoverOptions.genreMode,
      sort,
      yearFrom: discoverOptions.yearFrom,
      yearTo: discoverOptions.yearTo,
      ratingGte: discoverOptions.ratingGte,
      ratingLte: discoverOptions.ratingLte,
      providers: discoverOptions.providers,
      companies: discoverOptions.companies,
      language: discoverOptions.language,
      keywords: discoverOptions.keywords,
      excludeKeywords: discoverOptions.excludeKeywords,
      releaseStatus,
    };

    if (params.search) {
      // Same fix as movies above — always use /search/tv when there's
      // a search term, then in-memory sort. /discover/tv's
      // with_text_query is unreliable and we'd otherwise lose the
      // search filter on non-popular sorts.
      showResult = await fetchShowPages((p) => searchShows(params.search!, p));
    } else if (hasFilters) {
      showResult = await fetchShowPages((p) =>
        discoverShows({ ...tvDiscoverOptions, page: p })
      );
    } else if (!isSearchOrFilter) {
      if (sort === "popular") {
        showResult = await fetchShowPages((p) => getPopularShows(p));
        showResult.results = englishFirst(showResult.results);
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
  if (seenOnlyMode) {
    pageTitle = contentType === "movie" ? "Seen Movies" : contentType === "tv" ? "Seen TV Shows" : "Seen";
  }

  // In-memory sort for search-driven results. TMDB's /search/movie and
  // /search/tv have no sort_by parameter — their default order is
  // popularity-derived. When the viewer pairs a search term with a
  // non-popular sort selection, we apply the sort here so the
  // selection isn't silently ignored.
  if (params.search && sort !== "popular") {
    if (movieResult) {
      const arr = [...movieResult.results];
      if (sort === "top_rated") arr.sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0));
      else if (sort === "newest") arr.sort((a, b) => (b.release_date ?? "").localeCompare(a.release_date ?? ""));
      else if (sort === "oldest") arr.sort((a, b) => (a.release_date ?? "").localeCompare(b.release_date ?? ""));
      else if (sort === "title_az") arr.sort((a, b) => a.title.localeCompare(b.title));
      else if (sort === "title_za") arr.sort((a, b) => b.title.localeCompare(a.title));
      movieResult = { ...movieResult, results: arr };
    }
    if (showResult) {
      const arr = [...showResult.results];
      if (sort === "top_rated") arr.sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0));
      else if (sort === "newest") arr.sort((a, b) => (b.first_air_date ?? "").localeCompare(a.first_air_date ?? ""));
      else if (sort === "oldest") arr.sort((a, b) => (a.first_air_date ?? "").localeCompare(b.first_air_date ?? ""));
      else if (sort === "title_az") arr.sort((a, b) => a.name.localeCompare(b.name));
      else if (sort === "title_za") arr.sort((a, b) => b.name.localeCompare(a.name));
      showResult = { ...showResult, results: arr };
    }
  }

  // ── AI-driven post-filters ──
  // Language exclusion, anime compound filter (Japanese + Animation), and
  // parents'-guide severity caps. Severity is movie-only (TV isn't tracked).
  if (hasHiddenAiFilters) {
    const ANIMATION_GENRE_ID = 16;
    const langExclude = new Set(excludeLanguages);
    const passesLang = (lang: string, genreIdsArr: number[]) => {
      if (langExclude.has(lang)) return false;
      if (excludeAnime && lang === "ja" && genreIdsArr.includes(ANIMATION_GENRE_ID)) return false;
      return true;
    };
    if (movieResult) {
      movieResult = {
        ...movieResult,
        results: movieResult.results.filter((m) => passesLang(
          (m as { original_language?: string }).original_language ?? "",
          (m as { genre_ids?: number[] }).genre_ids ?? [],
        )),
      };
    }
    if (showResult) {
      showResult = {
        ...showResult,
        results: showResult.results.filter((s) => passesLang(
          (s as { original_language?: string }).original_language ?? "",
          (s as { genre_ids?: number[] }).genre_ids ?? [],
        )),
      };
    }
    // Severity caps via MovieParentsGuide cache (movies only).
    if (movieResult && (hasMaxCap || hasMinCap)) {
      try {
        const ids = movieResult.results.map((m) => m.id);
        const cached = ids.length > 0
          ? await prisma.movieParentsGuide.findMany({ where: { tmdbId: { in: ids } } })
          : [];
        const cacheByTmdbId = new Map(cached.map((c) => [c.tmdbId, c]));
        const rank = (s: string) => SEVERITY_VALUES.indexOf(s);
        movieResult = {
          ...movieResult,
          results: movieResult.results.filter((m) => {
            const entry = cacheByTmdbId.get(m.id);
            // Max caps: uncached pass through. Min floors: uncached excluded.
            if (!entry) return !hasMinCap;
            const maxChecks: [string, string | null][] = [
              [entry.violenceSeverity, severityCaps.maxViolence],
              [entry.sexualSeverity, severityCaps.maxSexualContent],
              [entry.languageSubstanceSeverity, severityCaps.maxLanguageSubstance],
              [entry.scaryIntenseSeverity, severityCaps.maxScaryIntense],
              [entry.sensitiveThemesSeverity, severityCaps.maxSensitiveThemes],
            ];
            for (const [actual, cap] of maxChecks) {
              if (cap == null) continue;
              if (rank(actual) > rank(cap)) return false;
            }
            const minChecks: [string, string | null][] = [
              [entry.violenceSeverity, severityCaps.minViolence],
              [entry.sexualSeverity, severityCaps.minSexualContent],
              [entry.languageSubstanceSeverity, severityCaps.minLanguageSubstance],
              [entry.scaryIntenseSeverity, severityCaps.minScaryIntense],
              [entry.sensitiveThemesSeverity, severityCaps.minSensitiveThemes],
            ];
            for (const [actual, floor] of minChecks) {
              if (floor == null) continue;
              if (rank(actual) < rank(floor)) return false;
            }
            return true;
          }),
        };
      } catch { /* DB not ready — skip severity filtering */ }
    }
  }

  // Relevance sort: re-order each result list by how many of the selected
  // genres actually match (descending), preserving TMDB's popularity order
  // within each tier. Movies and TV get sorted against their own genre IDs.
  if (isRelevance && genres && genres.length >= 2) {
    const movieGenreSet = new Set(genres.map((g) => Number(g)));
    const tvGenreSet = new Set(translateGenresForTV(genres).map((g) => Number(g)));
    const matchOf = (ids: number[] | undefined, set: Set<number>) =>
      (ids ?? []).filter((id) => set.has(id)).length;
    if (movieResult) {
      const sorted = [...movieResult.results].map((m, i) => ({ m, i, match: matchOf((m as { genre_ids?: number[] }).genre_ids, movieGenreSet) }));
      sorted.sort((a, b) => b.match - a.match || a.i - b.i);
      movieResult = { ...movieResult, results: sorted.map((x) => x.m) };
    }
    if (showResult) {
      const sorted = [...showResult.results].map((s, i) => ({ s, i, match: matchOf((s as { genre_ids?: number[] }).genre_ids, tvGenreSet) }));
      sorted.sort((a, b) => b.match - a.match || a.i - b.i);
      showResult = { ...showResult, results: sorted.map((x) => x.s) };
    }
  }

  // When searching/filtering in "all" mode, merge movies + shows by relevance (popularity)
  const isSearchMode = contentType === "all" && !!(params.search || hasFilters);
  let mixedResults: MixedItem[] = [];
  if (isSearchMode && (movieResult || showResult)) {
    const movies: MixedItem[] = (movieResult?.results ?? []).map((m) => ({ type: "movie" as const, data: m, popularity: m.popularity }));
    const shows: MixedItem[] = (showResult?.results ?? []).map((s) => ({ type: "show" as const, data: s, popularity: s.popularity }));
    // Cross-type accessors so a single sort closure can handle both
    // sides of the merged set.
    const dateOf = (item: MixedItem): string =>
      item.type === "movie"
        ? (item.data as TMDBMovie).release_date ?? ""
        : (item.data as TMDBShow).first_air_date ?? "";
    const titleOf = (item: MixedItem): string =>
      item.type === "movie" ? (item.data as TMDBMovie).title : (item.data as TMDBShow).name;
    const voteOf = (item: MixedItem): number =>
      (item.data as { vote_average?: number }).vote_average ?? 0;

    let merged = [...movies, ...shows];
    if (isRelevance && genres && genres.length >= 2) {
      // Relevance already placed best matches first — preserve that order
      // (don't re-sort by popularity which would undo the client match sort).
    } else if (sort === "top_rated") {
      merged.sort((a, b) => voteOf(b) - voteOf(a));
    } else if (sort === "newest") {
      merged.sort((a, b) => dateOf(b).localeCompare(dateOf(a)));
    } else if (sort === "oldest") {
      merged.sort((a, b) => dateOf(a).localeCompare(dateOf(b)));
    } else if (sort === "title_az") {
      merged.sort((a, b) => titleOf(a).localeCompare(titleOf(b)));
    } else if (sort === "title_za") {
      merged.sort((a, b) => titleOf(b).localeCompare(titleOf(a)));
    } else {
      // popular / default — popularity desc (existing behavior).
      merged.sort((a, b) => b.popularity - a.popularity);
    }
    mixedResults = merged.slice(0, perPage);
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

  // TV-rating supplement. TMDB's /discover/tv has no certification
  // parameter, and the default "popular" pool skews to TV-14 / TV-MA;
  // when a viewer selects TV-Y / TV-Y7 / TV-G / TV-PG, the post-filter
  // below would find nothing because those shows never made it into
  // the 20-row TMDB fetch. To make the filter actually surface
  // results, we supplement showResult with cached shows from our DB
  // whose contentRating matches the selection. Other filters (genre,
  // year, etc.) don't constrain the supplement — that's a knowing
  // trade so kid-rated browsing isn't dead-on-arrival.
  if (tvMpaaRatings.length > 0 && showShows && !seenOnlyMode) {
    try {
      const dbShows = await prisma.tVShow.findMany({
        where: { contentRating: { in: tvMpaaRatings } },
        select: {
          tmdbId: true, name: true, overview: true,
          posterPath: true, backdropPath: true,
          firstAirDate: true, voteAverage: true, voteCount: true,
          popularity: true,
        },
        orderBy: { popularity: "desc" },
        take: 60,
      });
      if (dbShows.length > 0) {
        const existingIds = new Set((showResult?.results ?? []).map((s) => s.id));
        const supplemented: TMDBShow[] = dbShows
          .filter((r) => !existingIds.has(r.tmdbId))
          .map((r) => ({
            id: r.tmdbId,
            name: r.name,
            overview: r.overview ?? "",
            poster_path: r.posterPath,
            backdrop_path: r.backdropPath,
            first_air_date: r.firstAirDate ?? "",
            vote_average: r.voteAverage ?? 0,
            vote_count: r.voteCount ?? 0,
            popularity: r.popularity ?? 0,
            genre_ids: [],
            origin_country: [],
            original_language: "",
            original_name: r.name,
          }));
        if (showResult) {
          showResult = {
            ...showResult,
            results: [...showResult.results, ...supplemented],
            total_results: showResult.total_results + supplemented.length,
          };
        } else {
          showResult = {
            results: supplemented,
            total_results: supplemented.length,
            total_pages: 1,
          };
        }
      }
    } catch { /* DB not ready */ }
  }

  // Fetch certifications: try DB cache first, then fill gaps from TMDB API
  const certMap = new Map<string, string>();
  try {
    const movieTmdbIds = (movieResult?.results ?? []).map((m) => m.id);
    const showTmdbIds = (showResult?.results ?? []).map((s) => s.id);

    // Check DB cache
    const [movieCerts, showCerts] = await Promise.all([
      movieTmdbIds.length > 0 ? prisma.movie.findMany({ where: { tmdbId: { in: movieTmdbIds }, mpaaRating: { not: null } }, select: { tmdbId: true, mpaaRating: true } }) : [],
      showTmdbIds.length > 0 ? prisma.tVShow.findMany({ where: { tmdbId: { in: showTmdbIds }, contentRating: { not: null } }, select: { tmdbId: true, contentRating: true } }) : [],
    ]);
    for (const m of movieCerts) if (m.mpaaRating) certMap.set(`m-${m.tmdbId}`, m.mpaaRating);
    for (const s of showCerts) if (s.contentRating) certMap.set(`s-${s.tmdbId}`, s.contentRating);

    // Fill gaps from TMDB API for movies not in DB
    const missingMovieIds = movieTmdbIds.filter((id) => !certMap.has(`m-${id}`));
    const missingShowIds = showTmdbIds.filter((id) => !certMap.has(`s-${id}`));

    const API_KEY = process.env.TMDB_API_KEY;
    if (API_KEY) {
      await Promise.all([
        ...missingMovieIds.map(async (id) => {
          try {
            const res = await fetch(`https://api.themoviedb.org/3/movie/${id}/release_dates?api_key=${API_KEY}`, { next: { revalidate: 86400 } });
            if (!res.ok) return;
            const data = await res.json();
            const us = data.results?.find((r: { iso_3166_1: string }) => r.iso_3166_1 === "US");
            const rated = us?.release_dates?.find((d: { certification: string; type: number }) => d.certification && d.type === 3)
              ?? us?.release_dates?.find((d: { certification: string }) => d.certification);
            if (rated?.certification) {
              certMap.set(`m-${id}`, rated.certification);
              // Cache to DB (fire and forget)
              prisma.movie.updateMany({ where: { tmdbId: id, mpaaRating: null }, data: { mpaaRating: rated.certification } }).catch(() => {});
            }
          } catch { /* ignore */ }
        }),
        ...missingShowIds.map(async (id) => {
          try {
            const res = await fetch(`https://api.themoviedb.org/3/tv/${id}/content_ratings?api_key=${API_KEY}`, { next: { revalidate: 86400 } });
            if (!res.ok) return;
            const data = await res.json();
            const us = data.results?.find((r: { iso_3166_1: string }) => r.iso_3166_1 === "US");
            if (us?.rating) {
              certMap.set(`s-${id}`, us.rating);
              prisma.tVShow.updateMany({ where: { tmdbId: id, contentRating: null }, data: { contentRating: us.rating } }).catch(() => {});
            }
          } catch { /* ignore */ }
        }),
      ]);
    }
  } catch { /* DB not ready */ }

  // TV content-rating post-filter. TMDB's /discover/tv doesn't accept
  // a certification parameter, so when the user selects TV-Y / TV-PG /
  // TV-MA / etc., we filter the fetched results against the
  // contentRating cache we just built above. Shows whose cert we
  // don't know (no US content_ratings entry on TMDB) are dropped
  // when a TV cert filter is active, matching the "exclude unknowns"
  // semantics admins expect for an explicit cert filter.
  if (tvMpaaRatings.length > 0 && showResult) {
    const wanted = new Set(tvMpaaRatings);
    const filtered = showResult.results.filter((s) => {
      const cert = certMap.get(`s-${s.id}`);
      return cert ? wanted.has(cert) : false;
    });
    showResult = {
      ...showResult,
      results: filtered,
      total_results: filtered.length,
    };
  }

  // Apply discovery-safety pass: filter NC-17 movies and mask admin-
  // blocked posters across whichever rails this page surfaced. Then
  // trim to perPage — fetchMoviePages/fetchShowPages pulled a one-
  // page buffer beyond what perPage needed so the filter has room to
  // remove items without dropping the visible count below the user's
  // selected perPage.
  if (movieResult) {
    // Opt into the adult-keyword auto-detect on popular / browse rails.
    // This catches softcore / erotic films TMDB never flagged
    // adult: true. Pays the keyword-fetch cost only the first time
    // each title surfaces; the verdict is cached on the Movie row.
    const safe = await safeguardTMDBMovies(movieResult.results, {
      filterNC17: true,
      stripBlockedPosters: true,
      adultKeywordCheck: true,
    });
    movieResult.results = safe.slice(0, perPage);
  }
  if (showResult) {
    const safe = await safeguardTMDBShows(showResult.results, {
      stripBlockedPosters: true,
    });
    showResult.results = safe.slice(0, perPage);
  }

  const totalResults = (movieResult?.total_results ?? 0) + (showResult?.total_results ?? 0);
  const totalPages = contentType === "tv"
    ? (showResult?.total_pages ?? 1)
    : contentType === "all"
      ? Math.max(movieResult?.total_pages ?? 1, showResult?.total_pages ?? 1)
      : (movieResult?.total_pages ?? 1);

  // JSON-LD ItemList for the current visible result set. Skipped in
  // seen-only mode (that branch renders a DB-backed client view, so
  // the SSR markup doesn't reflect what users see). Mixed-mode pulls
  // from the interleaved movies+shows list; otherwise we concatenate
  // the per-type rails. Cap at 30 items to keep markup reasonable.
  const itemListSchema = !seenOnlyMode
    ? {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: pageTitle,
        itemListElement: (
          isSearchMode
            ? mixedResults.map((it) =>
                it.type === "movie"
                  ? { url: `https://www.theratist.com/movies/${it.data.id}`, name: it.data.title }
                  : { url: `https://www.theratist.com/shows/${it.data.id}`, name: it.data.name }
              )
            : [
                ...((movieResult?.results ?? []).map((m) => ({
                  url: `https://www.theratist.com/movies/${m.id}`,
                  name: m.title,
                }))),
                ...((showResult?.results ?? []).map((s) => ({
                  url: `https://www.theratist.com/shows/${s.id}`,
                  name: s.name,
                }))),
              ]
        )
          .slice(0, 30)
          .map((it, idx) => ({
            "@type": "ListItem",
            position: idx + 1,
            url: it.url,
            name: it.name,
          })),
      }
    : null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {itemListSchema && itemListSchema.itemListElement.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }} />
      )}
      <h1 className="text-2xl font-bold text-white mb-6">{pageTitle}</h1>

      <div className="mb-4">
        <SpotlightCards placement="movies" />
      </div>

      {/* Register the list page in the breadcrumb so detail pages
         navigated to from here render "Back to {pageTitle}" rather
         than falling back to the static "All movies" label. */}
      <NavEntryRegister title={pageTitle} />

      <MoviesAiSearch />

      <MoviesFilterBar
        genres={genreList.genres}
        totalResults={totalResults}
        hideTotalResults={seenOnlyMode}
      />

      <AdUnit slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_MOVIES ?? ""} format="auto" className="mb-4" />

      <TapHoldHint pageKey="movies" />

      {/* Seen-only mode: replace the TMDB grid with a DB-backed view.
         Pagination and "no results" rendering happen inside the component;
         the rest of the page (filter bar, ads, etc.) stays put so the
         filter UX is identical. */}
      {seenOnlyMode && (() => {
        // Surface filters that the seen-mode API can't honor so the user
        // doesn't see "all my seen movies" and wonder why their filter did
        // nothing. Keywords / AI severity / releaseStatus aren't applied.
        const unsupportedActive: string[] = [];
        if (keywords || excludeKeywords) unsupportedActive.push("Keywords");
        if (releaseStatus) unsupportedActive.push("Release status");
        const hasSeverity = Object.values(severityCaps).some((v) => v != null);
        if (hasSeverity || excludeGenres.length > 0 || excludeLanguages.length > 0 || excludeAnime) {
          unsupportedActive.push("AI filters");
        }
        return (
          <>
            {unsupportedActive.length > 0 && (
              <div className="mb-4 rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-4 py-2.5 text-xs text-yellow-200/80">
                Showing your seen titles. These filters can't be applied to seen results and are being ignored:{" "}
                <span className="font-semibold text-yellow-200">{unsupportedActive.join(", ")}</span>.
              </div>
            )}
            <SeenMoviesView view={view as "grid" | "list"} pageTitle={pageTitle} />
          </>
        );
      })()}

      {/* Mixed results — when searching/filtering in "all" mode, interleave by relevance */}
      {!seenOnlyMode && isSearchMode && mixedResults.length > 0 && (
        view === "list" ? (
          <div className="flex flex-col divide-y divide-[var(--border)]">
            {mixedResults.map((item) =>
              item.type === "movie" ? (
                <MovieListItem key={`m-${item.data.id}`} movie={item.data} characterName={characterMap.get(item.data.id)} streaming={streamingMap.get(item.data.id)} rent={rentMap.get(item.data.id)} certification={certMap.get(`m-${item.data.id}`)} />
              ) : (
                <ShowListItem key={`s-${item.data.id}`} show={item.data} characterName={characterMap.get(item.data.id)} streaming={streamingMap.get(item.data.id)} rent={rentMap.get(item.data.id)} certification={certMap.get(`s-${item.data.id}`)} />
              )
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            {mixedResults.map((item) =>
              item.type === "movie" ? (
                <MovieCard key={`m-${item.data.id}`} movie={item.data} characterName={characterMap.get(item.data.id)} streaming={streamingMap.get(item.data.id)} rent={rentMap.get(item.data.id)} certification={certMap.get(`m-${item.data.id}`)} />
              ) : (
                <ShowCard key={`s-${item.data.id}`} show={item.data} characterName={characterMap.get(item.data.id)} streaming={streamingMap.get(item.data.id)} rent={rentMap.get(item.data.id)} certification={certMap.get(`s-${item.data.id}`)} />
              )
            )}
          </div>
        )
      )}

      {/* Separate sections — browsing mode (no search/filters in "all" mode) */}
      {!seenOnlyMode && !isSearchMode && movieResult && movieResult.results.length > 0 && (
        <>
          {contentType === "all" && showResult && showResult.results.length > 0 && <h2 className="text-lg font-semibold text-white mb-4">Movies</h2>}
          {view === "list" ? (
            <div className="flex flex-col divide-y divide-[var(--border)]">
              {movieResult.results.map((movie) => (
                <MovieListItem key={movie.id} movie={movie} characterName={characterMap.get(movie.id)} streaming={streamingMap.get(movie.id)} rent={rentMap.get(movie.id)} certification={certMap.get(`m-${movie.id}`)} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
              {movieResult.results.map((movie) => (
                <MovieCard key={movie.id} movie={movie} characterName={characterMap.get(movie.id)} streaming={streamingMap.get(movie.id)} rent={rentMap.get(movie.id)} certification={certMap.get(`m-${movie.id}`)} />
              ))}
            </div>
          )}
        </>
      )}

      {!seenOnlyMode && !isSearchMode && showResult && showResult.results.length > 0 && (
        <div className={!isSearchMode && movieResult && movieResult.results.length > 0 ? "mt-10" : ""}>
          {contentType === "all" && movieResult && movieResult.results.length > 0 && <h2 className="text-lg font-semibold text-white mb-4">TV Shows</h2>}
          {view === "list" ? (
            <div className="flex flex-col divide-y divide-[var(--border)]">
              {showResult.results.map((show) => (
                <ShowListItem key={show.id} show={show} characterName={characterMap.get(show.id)} streaming={streamingMap.get(show.id)} rent={rentMap.get(show.id)} certification={certMap.get(`s-${show.id}`)} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
              {showResult.results.map((show) => (
                <ShowCard key={show.id} show={show} characterName={characterMap.get(show.id)} streaming={streamingMap.get(show.id)} rent={rentMap.get(show.id)} certification={certMap.get(`s-${show.id}`)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* No results */}
      {!seenOnlyMode && (isSearchMode ? mixedResults.length === 0 : ((!movieResult || movieResult.results.length === 0) && (!showResult || showResult.results.length === 0))) && (
        <p className="text-[var(--foreground-muted)] text-center py-20">No results found.</p>
      )}

      {!seenOnlyMode && totalPages > 1 && (
        <Pagination current={page} total={totalPages} params={params} />
      )}
      {/* Seen-filter overlay — hides cards client-side based on
         ?seenStatus= and the user's seen list. Cheap when the filter
         is off, and keeps the SSR list intact for SEO. */}
      <SeenFilterRunner />
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
