import type { Metadata } from "next";
export const metadata: Metadata = { title: "Celebrities", description: "Explore popular actors, directors, and celebrities. See their filmographies, photos, and roles across movies and TV shows." };
import { Users, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import CelebritiesFilterBar from "./CelebritiesFilterBar";
import { prisma } from "@/lib/prisma";
import { upsertCelebrityList } from "@/lib/tmdb-sync";
import { generateFuzzyVariants } from "@/lib/fuzzy-search";
import AdUnit from "@/components/AdUnit";

const API_KEY = process.env.TMDB_API_KEY;
const BASE_URL = "https://api.themoviedb.org/3";

interface TMDBPerson {
  id: number;
  name: string;
  profile_path: string | null;
  known_for_department: string;
  popularity: number;
  known_for?: { id: number; title?: string; name?: string; media_type: string; vote_count?: number }[];
  birthday?: string | null;
  movie_credits?: {
    cast: MovieCredit[];
    crew: MovieCredit[];
  };
}

interface MovieCredit {
  id: number;
  title: string;
  vote_average: number;
  popularity: number;
}

// Minimum vote count on known_for entries to filter out TMDB popularity noise
const MIN_KNOWN_FOR_VOTES = 500;

function isNotableEnough(person: TMDBPerson): boolean {
  if (!person.known_for?.length) return false;
  return person.known_for.some((k) => (k.vote_count ?? 0) >= MIN_KNOWN_FOR_VOTES);
}

// Fetch list of people (popular / name search)
async function fetchPeople(
  q: string,
  page: number
): Promise<{ results: TMDBPerson[]; total_pages: number; total_results: number }> {
  const url = q
    ? `${BASE_URL}/search/person?api_key=${API_KEY}&query=${encodeURIComponent(q)}&page=${page}&include_adult=false`
    : `${BASE_URL}/person/popular?api_key=${API_KEY}&page=${page}`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return { results: [], total_pages: 1, total_results: 0 };
  return res.json();
}

// Fetch all cast + crew for a specific movie — for "appeared in" filter
async function fetchMediaCredits(mediaId: string, mediaType: string = "movie"): Promise<TMDBPerson[]> {
  const endpoint = mediaType === "tv"
    ? `${BASE_URL}/tv/${mediaId}/aggregate_credits?api_key=${API_KEY}`
    : `${BASE_URL}/movie/${mediaId}/credits?api_key=${API_KEY}`;
  const res = await fetch(endpoint, { next: { revalidate: 3600 } });
  if (!res.ok) return [];
  const data = await res.json();

  const seen = new Set<number>();
  const people: TMDBPerson[] = [];

  for (const c of [...(data.cast ?? []), ...(data.crew ?? [])]) {
    if (!seen.has(c.id)) {
      seen.add(c.id);
      people.push({
        id: c.id,
        name: c.name,
        profile_path: c.profile_path,
        known_for_department: c.known_for_department ?? c.department ?? "Unknown",
        popularity: c.popularity ?? 0,
      });
    }
  }

  people.sort((a, b) => b.popularity - a.popularity);
  return people;
}

// Fetch individual person details (birthday + movie_credits for filtering)
async function fetchPersonDetails(id: number): Promise<TMDBPerson | null> {
  const res = await fetch(
    `${BASE_URL}/person/${id}?api_key=${API_KEY}&append_to_response=movie_credits`,
    { next: { revalidate: 86400 } }
  );
  if (!res.ok) return null;
  return res.json();
}

function calcAge(birthday: string): number {
  const birth = new Date(birthday);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

function computePersonCommunityRating(
  credits: MovieCredit[],
  ratistByTmdb: Map<number, { sum: number; count: number }>
): number | null {
  let total = 0, count = 0;
  for (const movie of credits) {
    if (!movie.vote_average || movie.vote_average === 0) continue;
    const ratist = ratistByTmdb.get(movie.id) ?? { sum: 0, count: 0 };
    const buffer = Math.max(0, 50 - ratist.count);
    const hybrid = (movie.vote_average * buffer + ratist.sum) / Math.max(50, ratist.count);
    total += hybrid;
    count++;
  }
  return count > 0 ? total / count : null;
}

interface Props {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function CelebritiesPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1));
  const q = params.q ?? "";
  const movie = params.movie ?? "";
  const dept = params.dept ?? "";
  const sort = params.sort ?? "popular";
  const ageMin = params.ageMin ? Number(params.ageMin) : null;
  const ageMax = params.ageMax ? Number(params.ageMax) : null;
  const cratingGte = params.cratingGte ? Number(params.cratingGte) : null;
  const cratingLte = params.cratingLte ? Number(params.cratingLte) : null;
  const hasAgeFilter = ageMin !== null || ageMax !== null;
  const hasCommunityRatingFilter = cratingGte !== null || cratingLte !== null;
  const needsDetailLookup = hasAgeFilter || hasCommunityRatingFilter;

  const perPage = [20, 50, 100].includes(Number(params.perPage)) ? Number(params.perPage) : 20;

  let people: TMDBPerson[];
  let total_results: number;
  let total_pages: number;
  let correctedQuery = "";

  const movieMediaType = params.movieMediaType ?? "movie";
  if (movie) {
    // Use credits endpoint — returns full cast/crew, no pagination needed
    const credits = await fetchMediaCredits(movie, movieMediaType);
    people = credits;
    total_results = credits.length;
    total_pages = 1;
  } else if (!q) {
    // Default popular browse (with optional dept filter) — overfetch and filter
    // to remove TMDB popularity noise (obscure people with inflated scores)
    const overfetchPages = 10; // 200 people pool
    const pageResponses = await Promise.all(
      Array.from({ length: overfetchPages }, (_, i) => fetchPeople("", i + 1))
    );
    let allPeople = pageResponses.flatMap((r) => r.results).filter(isNotableEnough);
    if (dept) allPeople = allPeople.filter((p) => p.known_for_department === dept);
    // Manual pagination over filtered results
    const startIdx = (page - 1) * perPage;
    people = allPeople.slice(startIdx, startIdx + perPage);
    total_results = allPeople.length;
    total_pages = Math.max(1, Math.ceil(allPeople.length / perPage));
  } else {
    // Search query — show all results, no notability filter
    const tmdbPagesNeeded = Math.ceil(perPage / 20);
    const tmdbStartPage = (page - 1) * tmdbPagesNeeded + 1;
    const pageResponses = await Promise.all(
      Array.from({ length: tmdbPagesNeeded }, (_, i) => fetchPeople(q, tmdbStartPage + i))
    );
    people = pageResponses.flatMap((r) => r.results).slice(0, perPage);
    total_results = pageResponses[0]?.total_results ?? 0;
    total_pages = Math.min(
      Math.ceil(total_results / perPage),
      Math.floor(500 / tmdbPagesNeeded)
    );

    // Fuzzy retry: if few results, try spelling variants
    if (total_results < 3) {
      const variants = generateFuzzyVariants(q);
      for (const variant of variants) {
        const retryPages = await Promise.all(
          Array.from({ length: tmdbPagesNeeded }, (_, i) => fetchPeople(variant, tmdbStartPage + i))
        );
        const retryResults = retryPages.flatMap((r) => r.results);
        const retryTotal = retryPages[0]?.total_results ?? 0;
        if (retryTotal > total_results) {
          correctedQuery = variant;
          people = retryResults.slice(0, perPage);
          total_results = retryTotal;
          total_pages = Math.min(Math.ceil(retryTotal / perPage), Math.floor(500 / tmdbPagesNeeded));
          break;
        }
      }
    }
  }

  // Cache basic celebrity data — fire and forget
  if (!movie) {
    upsertCelebrityList(
      people.map((p) => ({
        id: p.id,
        name: p.name,
        profile_path: p.profile_path,
        known_for_department: p.known_for_department,
        popularity: p.popularity,
      }))
    ).catch(() => {});
  }

  // Apply department filter (skip if already filtered in overfetch branch above)
  if (dept && (movie || q)) {
    people = people.filter((p) => p.known_for_department === dept);
  }

  // Fetch person details if age or community rating filter is active
  if (needsDetailLookup && people.length > 0) {
    const details = await Promise.all(people.map((p) => fetchPersonDetails(p.id)));

    // If community rating filter active, build ratist ratings map from DB
    let ratistByTmdb = new Map<number, { sum: number; count: number }>();
    if (hasCommunityRatingFilter) {
      const allMovieTmdbIds = new Set<number>();
      for (const detail of details) {
        if (!detail?.movie_credits) continue;
        for (const m of [...detail.movie_credits.cast, ...detail.movie_credits.crew]) {
          if (m.vote_average > 0) allMovieTmdbIds.add(m.id);
        }
      }
      if (allMovieTmdbIds.size > 0) {
        const ratings = await prisma.movieRating.findMany({
          where: {
            movie: { tmdbId: { in: Array.from(allMovieTmdbIds) } },
            ratistRating: { not: null },
          },
          include: { movie: { select: { tmdbId: true } } },
        });
        for (const r of ratings) {
          if (r.movie.tmdbId && r.ratistRating) {
            const existing = ratistByTmdb.get(r.movie.tmdbId) ?? { sum: 0, count: 0 };
            existing.sum += r.ratistRating;
            existing.count++;
            ratistByTmdb.set(r.movie.tmdbId, existing);
          }
        }
      }
    }

    people = people.filter((person, i) => {
      const detail = details[i];

      // Age filter
      if (hasAgeFilter) {
        if (!detail?.birthday) return false;
        const age = calcAge(detail.birthday);
        if (ageMin !== null && age < ageMin) return false;
        if (ageMax !== null && age > ageMax) return false;
      }

      // Community rating filter
      if (hasCommunityRatingFilter) {
        if (!detail?.movie_credits) return false;
        const credits = [...(detail.movie_credits.cast ?? []), ...(detail.movie_credits.crew ?? [])];
        const rating = computePersonCommunityRating(credits, ratistByTmdb);
        if (rating === null) return false;
        if (cratingGte !== null && rating < cratingGte) return false;
        if (cratingLte !== null && rating > cratingLte) return false;
      }

      return true;
    });
  }

  // Apply sort
  if (sort === "az") {
    people = [...people].sort((a, b) => a.name.localeCompare(b.name));
  } else if (sort === "za") {
    people = [...people].sort((a, b) => b.name.localeCompare(a.name));
  }

  const displayTotal = movie ? people.length : total_results;
  const maxPages = Math.min(total_pages, 500);

  function buildPaginationUrl(p: number) {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (movie) qs.set("movie", movie);
    if (params.movieLabel) qs.set("movieLabel", params.movieLabel);
    if (dept) qs.set("dept", dept);
    if (sort && sort !== "popular") qs.set("sort", sort);
    if (params.ageMin) qs.set("ageMin", params.ageMin);
    if (params.ageMax) qs.set("ageMax", params.ageMax);
    if (params.cratingGte) qs.set("cratingGte", params.cratingGte);
    if (params.cratingLte) qs.set("cratingLte", params.cratingLte);
    if (perPage !== 20) qs.set("perPage", String(perPage));
    qs.set("page", String(p));
    return `/celebrities?${qs.toString()}`;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-2">
        <Users className="w-6 h-6 text-[var(--ratist-red)]" />
        <h1 className="text-2xl font-bold text-white">Celebrities</h1>
      </div>
      <p className="text-[var(--foreground-muted)] mb-4">
        Actors, directors, and filmmakers — click to explore their filmography.
      </p>

      <Suspense>
        <CelebritiesFilterBar totalResults={displayTotal} />
      </Suspense>

      {correctedQuery && (
        <p className="text-sm text-[var(--foreground-muted)] mb-4">
          Showing results for <span className="text-white font-medium">&ldquo;{correctedQuery}&rdquo;</span>
        </p>
      )}

      <AdUnit slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_COMMUNITY ?? ""} format="auto" className="mb-6" />

      {people.length === 0 ? (
        <p className="text-[var(--foreground-muted)] text-center py-20">No results found.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {people.map((person) => (
            <Link
              key={person.id}
              href={`/celebrities/${person.id}`}
              className="group flex flex-col items-center text-center"
            >
              <div className="relative w-full aspect-square rounded-full overflow-hidden bg-[var(--surface-2)] border-2 border-[var(--border)] group-hover:border-[var(--ratist-red)] transition-colors mb-2">
                {person.profile_path ? (
                  <Image
                    src={`https://image.tmdb.org/t/p/w185${person.profile_path}`}
                    alt={person.name}
                    fill
                    sizes="160px"
                    className="object-cover object-top"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-3xl text-[var(--foreground-muted)]">
                    &#x1F464;
                  </div>
                )}
              </div>
              <p className="text-sm font-semibold text-white group-hover:text-[var(--ratist-red)] transition-colors line-clamp-1">
                {person.name}
              </p>
              <p className="text-xs text-[var(--foreground-muted)] mb-1">
                {person.known_for_department}
              </p>
              {(person.known_for?.length ?? 0) > 0 && (
                <p className="text-xs text-[var(--foreground-muted)] line-clamp-1 opacity-70">
                  {person.known_for!
                    .map((k) => k.title ?? k.name)
                    .filter(Boolean)
                    .slice(0, 2)
                    .join(", ")}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}

      {!movie && maxPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-10">
          {page > 1 && (
            <Link
              href={buildPaginationUrl(page - 1)}
              className="flex items-center gap-1.5 px-4 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-full text-sm text-white hover:border-[var(--ratist-red)] transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Previous
            </Link>
          )}
          <span className="text-sm text-[var(--foreground-muted)]">
            Page {page} of {maxPages}
          </span>
          {page < maxPages && (
            <Link
              href={buildPaginationUrl(page + 1)}
              className="flex items-center gap-1.5 px-4 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-full text-sm text-white hover:border-[var(--ratist-red)] transition-colors"
            >
              Next <ChevronRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
