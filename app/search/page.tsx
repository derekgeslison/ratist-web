import type { Metadata } from "next";
export const metadata: Metadata = { title: "Search" };
import Image from "next/image";
import Link from "next/link";
import { Search, Film, User, Tv, Tag, Newspaper, BookOpen, MessageSquare, Map as MapIcon, ThumbsUp } from "lucide-react";
import { type TMDBMovie as LibTMDBMovie, searchKeywords, discoverMovies, discoverShows, getGenres } from "@/lib/tmdb";
import { generateFuzzyVariants } from "@/lib/fuzzy-search";
import { searchEditorial } from "@/lib/search-editorial";
import SearchFilters from "./SearchFilters";
import MovieListItem from "@/components/MovieListItem";
import MovieCard from "@/components/MovieCard";
import ShowListItem from "@/components/ShowListItem";
import ShowCard from "@/components/ShowCard";
import { Suspense } from "react";
import AdUnit from "@/components/AdUnit";
import SeenFilterRunner from "@/components/SeenFilterRunner";
import NavEntryRegister from "@/components/NavEntryRegister";
import { prisma } from "@/lib/prisma";

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

  // Each individual fetch catches independently — if /search/person
  // rate-limits but /search/movie + /search/tv succeed, we still
  // return what worked rather than zeroing the whole result set.
  // r.json() can throw on truncated / non-JSON responses, so the
  // .catch covers both transport and parse failures.
  const safeFetch = (url: string): Promise<{ results?: unknown[] }> =>
    fetch(url, { next: { revalidate: 60 } })
      .then((r) => r.ok ? r.json() : { results: [] })
      .catch(() => ({ results: [] }));

  const [moviePages, showPages, peoplePages] = await Promise.all([
    Promise.all(Array.from({ length: tmdbMoviePages }, (_, i) =>
      safeFetch(`${BASE}/search/movie?api_key=${API_KEY}&query=${encodeURIComponent(query)}&include_adult=false&page=${i + 1}`)
    )),
    Promise.all(Array.from({ length: tmdbShowPages }, (_, i) =>
      safeFetch(`${BASE}/search/tv?api_key=${API_KEY}&query=${encodeURIComponent(query)}&include_adult=false&page=${i + 1}`)
    )),
    Promise.all(Array.from({ length: tmdbPeoplePages }, (_, i) =>
      safeFetch(`${BASE}/search/person?api_key=${API_KEY}&query=${encodeURIComponent(query)}&include_adult=false&page=${i + 1}`)
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

  // Catch on EVERY external promise so a TMDB hiccup, JSON parse blip,
  // or rate limit on any one call falls back to empty results instead
  // of crashing the whole Server Component render. Without these, a
  // single fetch failure 500s the page with the generic "Something
  // went wrong" digest error users have been seeing.
  const [{ movies: rawMovies, shows: rawShows, people: rawPeople }, keywordResults] = await Promise.all([
    searchAll(q, perPage).catch(() => ({ movies: [], shows: [], people: [] })),
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
        }).catch(() => [])
      : Promise.resolve([]),
  ]);

  // Fuzzy retry: if results are sparse, try spelling variants
  let correctedQuery = "";
  let fuzzyMovies: TMDBMovie[] = [];
  let fuzzyShows: TMDBShow[] = [];
  let fuzzyPeople: TMDBPerson[] = [];
  if (q.trim() && rawMovies.length + rawShows.length + rawPeople.length < 3) {
    const variants = generateFuzzyVariants(q);
    for (const variant of variants) {
      // Same catch rationale as the primary searchAll above — a fuzzy
      // retry that throws shouldn't kill the page that already has
      // partial primary results to show.
      const retryResult = await searchAll(variant, perPage).catch(() => ({ movies: [], shows: [], people: [] }));
      const retryTotal = retryResult.movies.length + retryResult.shows.length + retryResult.people.length;
      if (retryTotal > rawMovies.length + rawShows.length + rawPeople.length) {
        correctedQuery = variant;
        fuzzyMovies = retryResult.movies;
        fuzzyShows = retryResult.shows;
        fuzzyPeople = retryResult.people;
        break;
      }
    }
  }

  // Use fuzzy results if they found more
  const useMovies = fuzzyMovies.length > rawMovies.length ? fuzzyMovies : rawMovies;
  const useShows = fuzzyShows.length > rawShows.length ? fuzzyShows : rawShows;
  const usePeople = fuzzyPeople.length > rawPeople.length ? fuzzyPeople : rawPeople;

  // Filter movies
  let movies = [...useMovies];
  if (languageFilter) movies = movies.filter((m) => m.original_language === languageFilter);
  if (genreFilter) movies = movies.filter((m) => (m as unknown as { genre_ids?: number[] }).genre_ids?.includes(Number(genreFilter)));
  if (yearFrom) movies = movies.filter((m) => { const y = parseInt((m.release_date ?? "").slice(0, 4)); return !isNaN(y) && y >= parseInt(yearFrom); });
  if (yearTo) movies = movies.filter((m) => { const y = parseInt((m.release_date ?? "").slice(0, 4)); return !isNaN(y) && y <= parseInt(yearTo); });

  // Filter shows
  let shows = [...useShows];
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
  const sortedPeople = [...usePeople];
  if (sortMode === "az") sortedPeople.sort((a, b) => a.name.localeCompare(b.name));
  else if (sortMode === "za") sortedPeople.sort((a, b) => b.name.localeCompare(a.name));
  const people = sortedPeople;

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

  // Editorial search: also pull blog posts, two thumbs, movie maps,
  // news, and forum threads that either match the query string or
  // are tagged with one of the top entity matches above. Top 5
  // movie + show + person ids form the tag-cohort for each.
  const taggedMovieIds = contentItems.filter((c) => c.type === "movie").slice(0, 5).map((c) => c.id);
  const taggedShowIds = contentItems.filter((c) => c.type === "tv").slice(0, 5).map((c) => c.id);
  const taggedMediaIds = [...taggedMovieIds, ...taggedShowIds];
  const taggedPersonIds = usePeople.slice(0, 5).map((p) => p.id);
  const editorial = q.trim()
    ? await searchEditorial(q, taggedMediaIds, taggedPersonIds).catch(() => ({
        blogPosts: [], twoThumbs: [], movieMaps: [], news: [], forumThreads: [], forumTotalCount: 0,
      }))
    : { blogPosts: [], twoThumbs: [], movieMaps: [], news: [], forumThreads: [], forumTotalCount: 0 };

  // Batch-lookup cached certifications from DB
  const certMap = new Map<string, string>();
  try {
    const movieIds = contentItems.filter((c) => c.type === "movie").map((c) => c.id);
    const showIds = contentItems.filter((c) => c.type === "tv").map((c) => c.id);
    const [movieCerts, showCerts] = await Promise.all([
      movieIds.length > 0 ? prisma.movie.findMany({ where: { tmdbId: { in: movieIds }, mpaaRating: { not: null } }, select: { tmdbId: true, mpaaRating: true } }) : [],
      showIds.length > 0 ? prisma.tVShow.findMany({ where: { tmdbId: { in: showIds }, contentRating: { not: null } }, select: { tmdbId: true, contentRating: true } }) : [],
    ]);
    for (const m of movieCerts) if (m.mpaaRating) certMap.set(`m-${m.tmdbId}`, m.mpaaRating);
    for (const s of showCerts) if (s.contentRating) certMap.set(`s-${s.tmdbId}`, s.contentRating);

    // Fill gaps from TMDB API
    const missingMovieIds = movieIds.filter((id) => !certMap.has(`m-${id}`));
    const missingShowIds = showIds.filter((id) => !certMap.has(`s-${id}`));
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

  const total = contentItems.length + (showPeople ? people.length : 0) + uniqueKeywordResults.length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <NavEntryRegister title={q ? `Search: "${q}"` : "Search"} />
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

      {correctedQuery && (
        <p className="text-sm text-[var(--foreground-muted)] mb-4">
          Showing results for <span className="text-white font-medium">&ldquo;{correctedQuery}&rdquo;</span>
        </p>
      )}

      <AdUnit slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_MOVIES ?? ""} format="auto" className="mb-6" />

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
                  <MovieCard key={`m-${item.id}`} movie={item.data as TMDBMovie} certification={certMap.get(`m-${item.id}`)} />
                ) : (
                  <ShowCard key={`s-${item.id}`} show={item.data as TMDBShow} certification={certMap.get(`s-${item.id}`)} />
                )
              )}
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-[var(--border)]">
              {contentItems.map((item) =>
                item.type === "movie" ? (
                  <MovieListItem key={`m-${item.id}`} movie={item.data as TMDBMovie} certification={certMap.get(`m-${item.id}`)} />
                ) : (
                  <ShowListItem key={`s-${item.id}`} show={item.data as TMDBShow} certification={certMap.get(`s-${item.id}`)} />
                )
              )}
            </div>
          )}
        </section>
      )}

      {/* Editorial: news, blog, two-thumbs, movie maps, forum.
         Forum sits last because it's the highest-volume long-term
         and is more discovery-than-result for the typical search. */}
      {editorial.news.length > 0 && (
        <EditorialSection
          icon={<Newspaper className="w-5 h-5 text-[var(--ratist-red)]" />}
          title="News"
          items={editorial.news}
          hrefBase="/news"
        />
      )}
      {editorial.blogPosts.length > 0 && (
        <EditorialSection
          icon={<BookOpen className="w-5 h-5 text-[var(--ratist-red)]" />}
          title="Blog"
          items={editorial.blogPosts}
          hrefBase="/blog"
        />
      )}
      {editorial.twoThumbs.length > 0 && (
        <EditorialSection
          icon={<ThumbsUp className="w-5 h-5 text-[var(--ratist-red)]" />}
          title="Two Thumbs"
          items={editorial.twoThumbs}
          hrefBase="/two-thumbs"
        />
      )}
      {editorial.movieMaps.length > 0 && (
        <EditorialSection
          icon={<MapIcon className="w-5 h-5 text-[var(--ratist-red)]" />}
          title="Movie Maps"
          items={editorial.movieMaps}
          hrefBase="/movie-maps"
        />
      )}
      {editorial.forumThreads.length > 0 && (
        <section className="mt-10">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-[var(--ratist-red)]" /> Forum
              <span className="text-sm font-normal text-[var(--foreground-muted)]">
                ({editorial.forumTotalCount} thread{editorial.forumTotalCount === 1 ? "" : "s"})
              </span>
            </h2>
            {editorial.forumTotalCount > editorial.forumThreads.length && (
              <Link href={`/forum?q=${encodeURIComponent(q)}`} className="text-sm text-[var(--ratist-red)] hover:underline">
                View all →
              </Link>
            )}
          </div>
          <div className="flex flex-col divide-y divide-[var(--border)]">
            {editorial.forumThreads.map((t) => (
              <Link
                key={t.id}
                href={`/forum/t/${t.slug}`}
                className="flex items-center gap-3 py-3 hover:bg-[var(--surface)] transition-colors px-2 -mx-2 rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{t.title}</p>
                  <p className="text-xs text-[var(--foreground-muted)]">
                    {t.threadType} · {t.authorName} · {t.postCount} {t.postCount === 1 ? "reply" : "replies"}
                  </p>
                </div>
              </Link>
            ))}
          </div>
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
      {/* Seen-filter overlay — hides results client-side based on
         ?seenStatus= and the user's seen list. */}
      <SeenFilterRunner />
    </div>
  );
}

interface EditorialItem {
  id: string;
  title: string;
  slug: string | null;
  excerpt: string | null;
  coverImage: string | null;
  publishedAt: string | null;
  authorName: string | null;
}

function EditorialSection({
  icon,
  title,
  items,
  hrefBase,
}: {
  icon: React.ReactNode;
  title: string;
  items: EditorialItem[];
  hrefBase: string;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        {icon} {title}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map((item) => (
          <Link
            key={item.id}
            href={item.slug ? `${hrefBase}/${item.slug}` : hrefBase}
            className="flex gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 hover:border-[var(--ratist-red)]/40 transition-colors"
          >
            {item.coverImage ? (
              <div className="relative w-20 h-20 shrink-0 rounded-lg overflow-hidden bg-[var(--surface-2)]">
                <Image src={item.coverImage} alt="" fill sizes="80px" className="object-cover" />
              </div>
            ) : null}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white line-clamp-2">{item.title}</p>
              {item.excerpt && (
                <p className="text-xs text-[var(--foreground-muted)] line-clamp-2 mt-1">{item.excerpt}</p>
              )}
              <p className="text-[10px] text-[var(--foreground-muted)] mt-1">
                {item.authorName}{item.publishedAt ? ` · ${new Date(item.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
