import type { Metadata } from "next";
export const metadata: Metadata = { title: "Search" };
import Image from "next/image";
import Link from "next/link";
import { Search, Film, User, Tv } from "lucide-react";
import { type TMDBMovie as LibTMDBMovie } from "@/lib/tmdb";
import SearchFilters from "./SearchFilters";
import MovieListItem from "@/components/MovieListItem";
import ShowListItem from "@/components/ShowListItem";
import { Suspense } from "react";

const API_KEY = process.env.TMDB_API_KEY;
const BASE = "https://api.themoviedb.org/3";

type TMDBMovie = LibTMDBMovie & { media_type: "movie" };
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
type SortMode = "relevance" | "rating" | "az";

interface Props {
  searchParams: Promise<{ q?: string; type?: string; sort?: string; perPage?: string }>;
}

export default async function SearchPage({ searchParams }: Props) {
  const { q = "", type: typeParam = "all", sort: sortParam = "relevance", perPage: perPageParam } = await searchParams;

  const typeFilter = (["all", "movies", "shows", "people"].includes(typeParam) ? typeParam : "all") as TypeFilter;
  const sortMode = (["relevance", "rating", "az"].includes(sortParam) ? sortParam : "relevance") as SortMode;
  const perPage = [20, 50, 100].includes(Number(perPageParam)) ? Number(perPageParam) : 20;

  const { movies: rawMovies, shows: rawShows, people: rawPeople } = await searchAll(q, perPage);

  let movies = [...rawMovies];
  if (sortMode === "rating") movies = movies.sort((a, b) => b.vote_average - a.vote_average);
  else if (sortMode === "az") movies = movies.sort((a, b) => a.title.localeCompare(b.title));

  let shows = [...rawShows];
  if (sortMode === "rating") shows = shows.sort((a, b) => b.vote_average - a.vote_average);
  else if (sortMode === "az") shows = shows.sort((a, b) => a.name.localeCompare(b.name));

  let people = [...rawPeople];
  if (sortMode === "az") people = people.sort((a, b) => a.name.localeCompare(b.name));

  const showMovies = typeFilter === "all" || typeFilter === "movies";
  const showShows = typeFilter === "all" || typeFilter === "shows";
  const showPeople = typeFilter === "all" || typeFilter === "people";

  const total = (showMovies ? movies.length : 0) + (showShows ? shows.length : 0) + (showPeople ? people.length : 0);

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
        <SearchFilters currentType={typeFilter} currentSort={sortMode} currentPerPage={String(perPage)} currentQuery={q} />
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

      {/* Movies */}
      {showMovies && movies.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Film className="w-5 h-5 text-[var(--ratist-red)]" /> Movies
          </h2>
          <div className="flex flex-col divide-y divide-[var(--border)]">
            {movies.map((movie) => (
              <MovieListItem key={movie.id} movie={movie} />
            ))}
          </div>
        </section>
      )}

      {/* TV Shows */}
      {showShows && shows.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Tv className="w-5 h-5 text-blue-400" /> TV Shows
          </h2>
          <div className="flex flex-col divide-y divide-[var(--border)]">
            {shows.map((show) => (
              <ShowListItem key={show.id} show={show} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
