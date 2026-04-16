import type { Metadata } from "next";
export const metadata: Metadata = { title: "Search" };
import Image from "next/image";
import Link from "next/link";
import { Search, Film, User, Tv, Tag } from "lucide-react";
import { type TMDBMovie as LibTMDBMovie, searchKeywords, discoverMovies, discoverShows, getGenres } from "@/lib/tmdb";
import SearchFilters from "./SearchFilters";
import MovieListItem from "@/components/MovieListItem";
import MovieCard from "@/components/MovieCard";
import ShowListItem from "@/components/ShowListItem";
import ShowCard from "@/components/ShowCard";
import { Suspense } from "react";

const API_KEY = process.env.TMDB_API_KEY;
const BASE = "https://api.themoviedb.org/3";

type TMDBMovie = LibTMDBMovie & { media_type: "movie"; original_language?: string };
interface TMDBShow {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  vote_average: number;
  vote_count: number;
  popularity: number;
  original_language?: string;
  media_type: "tv";
}
interface TMDBPerson {
  id: number;
  name: string;
  profile_path: string | null;
  known_for_department: string;
  popularity: number;
  media_type: "person";
}

async function searchAll(
  query: string,
  perPage: number
): Promise<{ movies: TMDBMovie[]; shows: TMDBShow[]; people: TMDBPerson[] }> {
  if (!query.trim()) return { movies: [], shows: [], people: [] };

  const tmdbMoviePages = Math.ceil(perPage / 20);
  const tmdbShowPages = Math.ceil(perPage / 2 / 20);
  const tmdbPeoplePages = Math.ceil(perPage / 2 / 20);

  const [moviePages, showPages, peoplePages] = await Promise.all([
    Promise.all(Array.from({ length: tmdbMoviePages }, (_, i) =>
      fetch(`${BASE}/search/movie?api_key=${API_KEY}&query=${encodeURIComponent(query)}&include_adult=false&page=${i + 1}`, { next: { revalidate: 60 } })
        .then((r) => r.json())
    )),
    Promise.all(Array.from({ length: tmdbShowPages }, (_, i) =>
      fetch(`${BASE}/search/tv?api_key=${API_KEY}&query=${encodeURIComponent(query)}&include_adult=false&page=${i + 1}`, { next: { revalidate: 60 } })
        .then((r) => r.json())
    )),
    Promise.all(Array.from({ length: tmdbPeoplePages }, (_, i) =>
      fetch(`${BASE}/search/person?api_key=${API_KEY}&query=${encodeURIComponent(query)}&include_adult=false&page=${i + 1}`, { next: { revalidate: 60 } })
        .then((r) => r.json())
    )),
  ]);

  return {
    movies: moviePages.flatMap((p) => p.results ?? []).slice(0, perPage) as TMDBMovie[],
    shows: showPages.flatMap((p) => p.results ?? []).slice(0, Math.ceil(perPage / 2)) as TMDBShow[],
    people: peoplePages.flatMap((p) => p.results ?? []).slice(0, Math.ceil(perPage / 2)) as TMDBPerson[],
  };
}

type TypeFilter = "all" | "movies" | "shows" | "people";
type SortMode = "relevance" | "popular" | "rating" | "newest" | "oldest" | "az" | "za";

interface Props {
  searchParams: Promise<{ q?: string; type?: string; sort?: string; perPage?: string; language?: string; genre?: string; yearFrom?: string; yearTo?: string; view?: string }>;
}

export default async function SearchPage({ searchParams }: Props) {
  const params = await searchParams;
  const { q = "", type: typeParam = "all", sort: sortParam = "relevance", perPage: perPageParam, language: langParam, genre: genreParam, yearFrom: yearFromParam, yearTo: yearToParam, view: viewParam } = params;
  const languageFilter = langParam ?? "";
  const genreFilter = genreParam ?? "";
  const yearFrom = yearFromParam ?? "";
  const yearTo = yearToParam ?? "";
  const view = viewParam === "grid" ? "grid" : "list";

  const typeFilter = (["all", "movies", "shows", "people"].includes(typeParam) ? typeParam : "all") as TypeFilter;
  const sortMode = (["relevance", "popular", "rating", "newest", "oldest", "az", "za"].includes(sortParam) ? sortParam : "relevance") as SortMode;
  const perPage = [20, 50, 100].includes(Number(perPageParam)) ? Number(perPageParam) : 20;

  const showMovies = typeFilter === "all" || typeFilter === "movies";
  const showShows = typeFilter === "all" || typeFilter === "shows";
  const showPeople = typeFilter === "all" || typeFilter === "people";
  const showContent = showMovies || showShows;

  // Fetch genres for the filter dropdown
  const genreList = await getGenres().catch(() => ({ genres: [] }));

  const [{ movies: rawMovies, shows: rawShows, people: rawPeople }, keywordResults] = await Promise.all([
    searchAll(q, perPage),
    q.trim() && typeFilter !== "people"
      ? searchKeywords(q).then(async (kw) => {
          const top = kw.results.slice(0, 3);
          if (top.length === 0) return [];
          const keywordIds = top.map((k) => String(k.id)).join("|");
          const [kwMovies, kwShows] = await Promise.all([
            showMovies ? discoverMovies({ keywords: keywordIds, page: 1 }).catch(() => ({ results: [] as LibTMDBMovie[] })) : Promise.resolve({ results: [] as LibTMDBMovie[] }),
            showShows ? discoverShows({ keywords: keywordIds, page: 1 }).catch(() => ({ results: [] as TMDBShow[] })) : Promise.resolve({ results: [] as TMDBShow[] }),
          ]);
          return [
            ...kwMovies.results.slice(0, 10).map((m) => ({ type: "movie" as const, ...m })),
            ...kwShows.results.slice(0, 5).map((s) => ({ type: "tv" as const, ...s })),
          ];
        })
      : Promise.resolve([]),
  ]);

  // Filter movies
  let movies = [...rawMovies];
  if (languageFilter) movies = movies.filter((m) => m.original_language === languageFilter);
  if (genreFilter) movies = movies.filter((m) => (m as unknown as { genre_ids?: number[] }).genre_ids?.includes(Number(genreFilter)));
  if (yearFrom) movies = movies.filter((m) => { const y = parseInt((m.release_date ?? "").slice(0, 4)); return !isNaN(y) && y >= parseInt(yearFrom); });
  if (yearTo) movies = movies.filter((m) => { const y = parseInt((m.release_date ?? "").slice(0, 4)); return !isNaN(y) && y <= parseInt(yearTo); });

  // Filter shows
  let shows = [...rawShows];
  if (languageFilter) shows = shows.filter((s) => s.original_language === languageFilter);
  if (genreFilter) shows = shows.filter((s) => (s as unknown as { genre_ids?: number[] }).genre_ids?.includes(Number(genreFilter)));
  if (yearFrom) shows = shows.filter((s) => { const y = parseInt((s.first_air_date ?? "").slice(0, 4)); return !isNaN(y) && y >= parseInt(yearFrom); });
  if (yearTo) shows = shows.filter((s) => { const y = parseInt((s.first_air_date ?? "").slice(0, 4)); return !isNaN(y) && y <= parseInt(yearTo); });

  // Sort movies
  if (sortMode === "rating") movies.sort((a, b) => b.vote_average - a.vote_average);
  else if (sortMode === "popular") movies.sort((a, b) => b.popularity - a.popularity);
  else if (sortMode === "newest") movies.sort((a, b) => (b.release_date ?? "").localeCompare(a.release_date ?? ""));
  else if (sortMode === "oldest") movies.sort((a, b) => (a.release_date ?? "").localeCompare(b.release_date ?? ""));
  else if (sortMode === "az") movies.sort((a, b) => a.title.localeCompare(b.title));
  else if (sortMode === "za") movies.sort((a, b) => b.title.localeCompare(a.title));

  // Sort shows
  if (sortMode === "rating") shows.sort((a, b) => b.vote_average - a.vote_average);
  else if (sortMode === "popular") shows.sort((a, b) => b.popularity - a.popularity);
  else if (sortMode === "newest") shows.sort((a, b) => (b.first_air_date ?? "").localeCompare(a.first_air_date ?? ""));
  else if (sortMode === "oldest") shows.sort((a, b) => (a.first_air_date ?? "").localeCompare(b.first_air_date ?? ""));
  else if (sortMode === "az") shows.sort((a, b) => a.name.localeCompare(b.name));
  else if (sortMode === "za") shows.sort((a, b) => b.name.localeCompare(a.name));

  // Sort people
  if (sortMode === "az") rawPeople.sort((a, b) => a.name.localeCompare(b.name));
  else if (sortMode === "za") rawPeople.sort((a, b) => b.name.localeCompare(a.name));
  const people = rawPeople;

  // Deduplicate keyword results against title-search results
  const titleMovieIds = new Set(movies.map((m) => m.id));
  const titleShowIds = new Set(shows.map((s) => s.id));
  const uniqueKeywordResults = keywordResults.filter((item) =>
    item.type === "movie" ? !titleMovieIds.has(item.id) : !titleShowIds.has(item.id)
  );

  // Merge movies and shows into one list
  const contentItems: { type: "movie" | "tv"; id: number; title: string; popularity: number; releaseDate: string; data: TMDBMovie | TMDBShow }[] = [
    ...(showMovies ? movies.map((m) => ({ type: "movie" as const, id: m.id, title: m.title, popularity: m.popularity, releaseDate: m.release_date ?? "", data: m })) : []),
    ...(showShows ? shows.map((s) => ({ type: "tv" as const, id: s.id, title: s.name, popularity: s.popularity, releaseDate: s.first_air_date ?? "", data: s })) : []),
  ];
  if (sortMode === "rating") contentItems.sort((a, b) => (b.data.vote_average ?? 0) - (a.data.vote_average ?? 0));
  else if (sortMode === "popular") contentItems.sort((a, b) => b.popularity - a.popularity);
  else if (sortMode === "newest") contentItems.sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
  else if (sortMode === "oldest") contentItems.sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
  else if (sortMode === "az") contentItems.sort((a, b) => a.title.localeCompare(b.title));
  else if (sortMode === "za") contentItems.sort((a, b) => b.title.localeCompare(a.title));
  else contentItems.sort((a, b) => b.popularity - a.popularity); // relevance = popularity

  const total = contentItems.length + (showPeople ? people.length : 0) + uniqueKeywordResults.length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-4">
        <Search className="w-6 h-6 text-[var(--ratist-red)]" />
        <h1 className="text-2xl font-bold text-white">
          {q ? `Results for "${q}"` : "Search"}
        </h1>
        {q && total > 0 && (
          <span className="text-sm text-[var(--foreground-muted)]">&middot; {total} results</span>
        )}
      </div>

      <Suspense>
        <SearchFilters currentType={typeFilter} currentSort={sortMode} currentPerPage={String(perPage)} currentQuery={q} genres={genreList.genres} />
      </Suspense>

      {!q && (
        <p className="text-[var(--foreground-muted)]">Use the search bar above to find movies, shows, and people.</p>
      )}

      {q && total === 0 && (
        <p className="text-[var(--foreground-muted)] py-10 text-center">No results found for &ldquo;{q}&rdquo;.</p>
      )}

      {/* People */}
      {showPeople && people.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <User className="w-5 h-5 text-[var(--ratist-red)]" /> People
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-4">
            {people.map((person) => (
              <Link key={person.id} href={`/celebrities/${person.id}`} className="group flex flex-col items-center text-center gap-1.5">
                <div className="relative w-full aspect-square rounded-full overflow-hidden bg-[var(--surface-2)] border border-[var(--border)] group-hover:border-[var(--ratist-red)] transition-colors">
                  {person.profile_path ? (
                    <Image
                      src={`https://image.tmdb.org/t/p/w185${person.profile_path}`}
                      alt={person.name}
                      fill
                      sizes="100px"
                      className="object-cover object-top"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl">&#x1F464;</div>
                  )}
                </div>
                <p className="text-xs font-medium text-white group-hover:text-[var(--ratist-red)] transition-colors line-clamp-1">{person.name}</p>
                <p className="text-xs text-[var(--foreground-muted)]">{person.known_for_department}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Movies & Shows */}
      {showContent && contentItems.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Film className="w-5 h-5 text-[var(--ratist-red)]" /> Movies & Shows
          </h2>
          {view === "grid" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {contentItems.map((item) =>
                item.type === "movie" ? (
                  <MovieCard key={`m-${item.id}`} movie={item.data as TMDBMovie} />
                ) : (
                  <ShowCard key={`s-${item.id}`} show={item.data as TMDBShow} />
                )
              )}
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-[var(--border)]">
              {contentItems.map((item) =>
                item.type === "movie" ? (
                  <MovieListItem key={`m-${item.id}`} movie={item.data as TMDBMovie} />
                ) : (
                  <ShowListItem key={`s-${item.id}`} show={item.data as TMDBShow} />
                )
              )}
            </div>
          )}
        </section>
      )}

      {/* Keyword-based results */}
      {uniqueKeywordResults.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Tag className="w-5 h-5 text-[var(--ratist-red)]" /> Related by Keyword
          </h2>
          <div className="flex flex-col divide-y divide-[var(--border)]">
            {uniqueKeywordResults.map((item) =>
              item.type === "movie" ? (
                <MovieListItem key={`kw-m-${item.id}`} movie={item as unknown as TMDBMovie} />
              ) : (
                <ShowListItem key={`kw-s-${item.id}`} show={item as unknown as TMDBShow} />
              )
            )}
          </div>
        </section>
      )}
    </div>
  );
}
