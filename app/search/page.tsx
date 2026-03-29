import type { Metadata } from "next";
export const metadata: Metadata = { title: "Search" };
import Image from "next/image";
import Link from "next/link";
import { Search, Film, User } from "lucide-react";
import { posterUrl } from "@/lib/tmdb";
import SearchFilters from "./SearchFilters";
import { Suspense } from "react";

const API_KEY = process.env.TMDB_API_KEY;
const BASE = "https://api.themoviedb.org/3";

interface TMDBMovie {
  id: number;
  title: string;
  poster_path: string | null;
  release_date: string;
  vote_average: number;
  overview: string;
  media_type: "movie";
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
): Promise<{ movies: TMDBMovie[]; people: TMDBPerson[] }> {
  if (!query.trim()) return { movies: [], people: [] };

  const tmdbMoviePages = Math.ceil(perPage / 20);
  const tmdbPeoplePages = Math.ceil(perPage / 2 / 20); // show ~half as many people

  const movieFetches = Array.from({ length: tmdbMoviePages }, (_, i) =>
    fetch(`${BASE}/search/movie?api_key=${API_KEY}&query=${encodeURIComponent(query)}&include_adult=false&page=${i + 1}`, { next: { revalidate: 60 } })
      .then((r) => r.json())
  );
  const peopleFetches = Array.from({ length: tmdbPeoplePages }, (_, i) =>
    fetch(`${BASE}/search/person?api_key=${API_KEY}&query=${encodeURIComponent(query)}&include_adult=false&page=${i + 1}`, { next: { revalidate: 60 } })
      .then((r) => r.json())
  );

  const [moviePages, peoplePages] = await Promise.all([
    Promise.all(movieFetches),
    Promise.all(peopleFetches),
  ]);

  return {
    movies: moviePages.flatMap((p) => p.results ?? []).slice(0, perPage) as TMDBMovie[],
    people: peoplePages.flatMap((p) => p.results ?? []).slice(0, Math.ceil(perPage / 2)) as TMDBPerson[],
  };
}

type TypeFilter = "all" | "movies" | "people";
type SortMode = "relevance" | "rating" | "az";

interface Props {
  searchParams: Promise<{ q?: string; type?: string; sort?: string; perPage?: string }>;
}

export default async function SearchPage({ searchParams }: Props) {
  const { q = "", type: typeParam = "all", sort: sortParam = "relevance", perPage: perPageParam } = await searchParams;

  const typeFilter = (["all", "movies", "people"].includes(typeParam) ? typeParam : "all") as TypeFilter;
  const sortMode = (["relevance", "rating", "az"].includes(sortParam) ? sortParam : "relevance") as SortMode;
  const perPage = [20, 50, 100].includes(Number(perPageParam)) ? Number(perPageParam) : 20;

  const { movies: rawMovies, people: rawPeople } = await searchAll(q, perPage);

  // Apply sort to movies
  let movies = [...rawMovies];
  if (sortMode === "rating") {
    movies = movies.sort((a, b) => b.vote_average - a.vote_average);
  } else if (sortMode === "az") {
    movies = movies.sort((a, b) => a.title.localeCompare(b.title));
  }

  // Apply sort to people
  let people = [...rawPeople];
  if (sortMode === "az") {
    people = people.sort((a, b) => a.name.localeCompare(b.name));
  }

  const showMovies = typeFilter === "all" || typeFilter === "movies";
  const showPeople = typeFilter === "all" || typeFilter === "people";

  const total = (showMovies ? movies.length : 0) + (showPeople ? people.length : 0);

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

      {q && (
        <Suspense>
          <SearchFilters currentType={typeFilter} currentSort={sortMode} currentPerPage={String(perPage)} />
        </Suspense>
      )}

      {!q && (
        <p className="text-[var(--foreground-muted)]">Enter a search term to find movies and people.</p>
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
        <section>
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Film className="w-5 h-5 text-[var(--ratist-red)]" /> Movies
          </h2>
          <div className="flex flex-col divide-y divide-[var(--border)]">
            {movies.map((movie) => (
              <Link
                key={movie.id}
                href={`/movies/${movie.id}`}
                className="flex items-center gap-4 py-3 hover:bg-[var(--surface)] px-3 -mx-3 rounded-lg transition-colors group"
              >
                <div className="relative w-10 h-14 shrink-0 rounded overflow-hidden bg-[var(--surface-2)]">
                  {movie.poster_path ? (
                    <Image src={posterUrl(movie.poster_path, "w92")} alt={movie.title} fill sizes="40px" className="object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-[var(--foreground-muted)]">?</div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white group-hover:text-[var(--ratist-red)] transition-colors line-clamp-1">{movie.title}</p>
                  <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
                    {movie.release_date?.slice(0, 4)}
                    {movie.vote_average > 0 && <span className="ml-2">&#x2B50; {movie.vote_average.toFixed(1)}</span>}
                  </p>
                  <p className="text-xs text-[var(--foreground-muted)] mt-0.5 line-clamp-1 hidden sm:block">{movie.overview}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
