export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Film, Clapperboard, Search, ImageIcon } from "lucide-react";
import PageShare from "@/components/PageShare";
import { posterUrl } from "@/lib/tmdb";
import { prisma } from "@/lib/prisma";
import CelebrityCreditsSection from "./CelebrityCreditsSection";
import CelebrityBio from "./CelebrityBio";
import CelebrityUserPanel from "./CelebrityUserPanel";
import { upsertCelebrity } from "@/lib/tmdb-sync";

const API_KEY = process.env.TMDB_API_KEY;
const BASE_URL = "https://api.themoviedb.org/3";

interface TMDBPersonDetail {
  id: number;
  name: string;
  biography: string;
  birthday: string | null;
  deathday: string | null;
  place_of_birth: string | null;
  profile_path: string | null;
  known_for_department: string;
  popularity: number;
  movie_credits: {
    cast: CastCredit[];
    crew: CrewCredit[];
  };
  tv_credits: {
    cast: TVCastCredit[];
    crew: TVCrewCredit[];
  };
  images?: {
    profiles: { file_path: string; width: number; height: number; vote_average: number }[];
  };
}

interface TVCastCredit {
  id: number;
  name: string;
  poster_path: string | null;
  first_air_date: string;
  character: string;
  vote_average: number;
  popularity: number;
  episode_count: number;
}

interface TVCrewCredit {
  id: number;
  name: string;
  poster_path: string | null;
  first_air_date: string;
  job: string;
  department: string;
  vote_average: number;
  popularity: number;
  episode_count: number;
}

interface CastCredit {
  id: number;
  title: string;
  poster_path: string | null;
  release_date: string;
  character: string;
  vote_average: number;
  popularity: number;
}

interface CrewCredit {
  id: number;
  title: string;
  poster_path: string | null;
  release_date: string;
  job: string;
  department: string;
  vote_average: number;
  popularity: number;
}

async function getPersonDetails(id: number): Promise<TMDBPersonDetail> {
  const res = await fetch(
    `${BASE_URL}/person/${id}?api_key=${API_KEY}&append_to_response=movie_credits,tv_credits,images`,
    { next: { revalidate: 3600 } }
  );
  if (!res.ok) throw new Error("Not found");
  return res.json();
}

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  try {
    const person = await getPersonDetails(Number(id));
    const description = person.biography ? person.biography.slice(0, 160) : `${person.name} on The Ratist`;
    const imageUrl = person.profile_path
      ? `https://image.tmdb.org/t/p/w500${person.profile_path}`
      : undefined;
    return {
      title: person.name,
      description,
      openGraph: {
        title: `${person.name} — The Ratist`,
        description,
        ...(imageUrl ? { images: [{ url: imageUrl, width: 500, height: 750 }] } : {}),
      },
      twitter: {
        card: "summary_large_image",
        title: `${person.name} — The Ratist`,
        description,
        ...(imageUrl ? { images: [imageUrl] } : {}),
      },
    };
  } catch {
    return { title: "Person" };
  }
}

export default async function CelebrityPage({ params }: Props) {
  const { id } = await params;
  let person: TMDBPersonDetail;

  try {
    person = await getPersonDetails(Number(id));
  } catch {
    notFound();
  }

  // Cache to local DB — fire and forget
  upsertCelebrity({
    id: person.id,
    name: person.name,
    profile_path: person.profile_path,
    known_for_department: person.known_for_department,
    birthday: person.birthday,
    deathday: person.deathday,
    place_of_birth: person.place_of_birth,
    biography: person.biography,
    popularity: person.popularity,
    movie_credits: {
      cast: person.movie_credits.cast.map((c) => ({
        id: c.id,
        name: "",
        title: c.title,
        character: c.character,
        vote_average: c.vote_average,
        popularity: c.popularity,
        order: 0,
      })),
      crew: person.movie_credits.crew.map((c) => ({
        id: c.id,
        name: "",
        title: c.title,
        job: c.job,
        department: c.department,
        vote_average: c.vote_average,
        popularity: c.popularity,
      })),
    },
  }).catch(() => {});

  // Deduplicate movie cast credits
  const seenMovieIds = new Set<number>();
  const movieCastCredits = person.movie_credits.cast
    .filter((m) => { if (seenMovieIds.has(m.id)) return false; seenMovieIds.add(m.id); return true; })
    .map((m) => ({
      id: m.id,
      title: m.title,
      poster_path: m.poster_path,
      release_date: m.release_date,
      vote_average: m.vote_average,
      character: m.character,
      popularity: m.popularity,
      mediaType: "movie" as const,
    }));

  // Deduplicate TV cast credits
  const seenTvIds = new Set<number>();
  const tvCastCredits = (person.tv_credits?.cast ?? [])
    .filter((s) => { if (seenTvIds.has(s.id)) return false; seenTvIds.add(s.id); return true; })
    .map((s) => ({
      id: s.id,
      title: s.name,
      poster_path: s.poster_path,
      release_date: s.first_air_date,
      vote_average: s.vote_average,
      character: s.character,
      popularity: s.popularity,
      mediaType: "tv" as const,
    }));

  // Combined filmography — sorted by year (newest first)
  const filmography = [...movieCastCredits, ...tvCastCredits]
    .sort((a, b) => new Date(b.release_date || "0").getTime() - new Date(a.release_date || "0").getTime());

  // All crew credits (movies + TV) with deduplication
  const seenCrewKeys = new Set<string>();
  const allCrewCredits = [
    ...person.movie_credits.crew.map((c) => ({ id: c.id, title: c.title, poster_path: c.poster_path, release_date: c.release_date, vote_average: c.vote_average, job: c.job, department: c.department, popularity: c.popularity, mediaType: "movie" as const })),
    ...(person.tv_credits?.crew ?? []).map((c) => ({ id: c.id, title: c.name, poster_path: c.poster_path, release_date: c.first_air_date, vote_average: c.vote_average, job: c.job, department: c.department, popularity: c.popularity, mediaType: "tv" as const })),
  ].filter((c) => {
    const key = `${c.id}-${c.job}-${c.mediaType}`;
    if (seenCrewKeys.has(key)) return false;
    seenCrewKeys.add(key);
    return true;
  }).sort((a, b) => new Date(b.release_date || "0").getTime() - new Date(a.release_date || "0").getTime());

  // Photos
  const photos = person.images?.profiles ?? [];

  const age = person.birthday
    ? Math.floor(
        (new Date(person.deathday ?? Date.now()).getTime() - new Date(person.birthday).getTime()) /
          (1000 * 60 * 60 * 24 * 365.25)
      )
    : null;

  // TMDB avg from cast credits
  const allMovieTmdbIds = movieCastCredits.map((m) => m.id);
  const tmdbRatedMovies = movieCastCredits.filter((m) => m.vote_average > 0);
  const tmdbAvg = tmdbRatedMovies.length > 0
    ? tmdbRatedMovies.reduce((sum, m) => sum + m.vote_average, 0) / tmdbRatedMovies.length
    : null;

  // Get community Ratist data for hybrid rating
  let communityRatistCount = 0;
  let communityRatistSum = 0;
  if (allMovieTmdbIds.length > 0) {
    try {
      const agg = await prisma.movieRating.aggregate({
        where: { movie: { tmdbId: { in: allMovieTmdbIds } }, ratistRating: { not: null } },
        _count: { ratistRating: true },
        _sum: { ratistRating: true },
      });
      communityRatistCount = agg._count.ratistRating;
      communityRatistSum = agg._sum.ratistRating ?? 0;
    } catch {
      // DB not available
    }
  }

  // Hybrid community rating: TMDB avg as 50-review buffer (same formula as movies)
  const buffer = Math.max(0, 50 - communityRatistCount);
  const hybridCommunityRating = tmdbAvg != null
    ? (tmdbAvg * buffer + communityRatistSum) / Math.max(50, communityRatistCount)
    : communityRatistCount > 0
      ? communityRatistSum / communityRatistCount
      : null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link
        href="/celebrities"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> All Celebrities
      </Link>

      <div className="flex flex-col sm:flex-row gap-8 mb-10">
        {/* Photo */}
        <div className="relative w-40 h-60 sm:w-48 sm:h-72 shrink-0 rounded-xl overflow-hidden bg-[var(--surface-2)] border border-[var(--border)]">
          {person.profile_path ? (
            <Image
              src={`https://image.tmdb.org/t/p/w300${person.profile_path}`}
              alt={person.name}
              fill
              sizes="192px"
              className="object-cover object-top"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-5xl">👤</div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-white">{person.name}</h1>
            <PageShare title={`${person.name} on The Ratist`} />
          </div>
          <p className="text-sm text-[var(--foreground-muted)] mb-4">{person.known_for_department}</p>

          {/* Ratist stats row */}
          <div className="flex items-start gap-6 mb-4">
            <div>
              <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider mb-0.5">Community Rating</p>
              {hybridCommunityRating != null ? (
                <>
                  <p className="text-lg font-bold text-white">{hybridCommunityRating.toFixed(1)}</p>
                  <p className="text-xs text-[var(--foreground-muted)]">
                    {communityRatistCount > 0 ? `${communityRatistCount} Ratist review${communityRatistCount !== 1 ? "s" : ""}` : "TMDB estimate"}
                  </p>
                </>
              ) : (
                <p className="text-sm text-[var(--foreground-muted)] italic">No data yet</p>
              )}
            </div>
            {/* User's personal avg — loaded client-side */}
            <CelebrityUserPanel tmdbIds={allMovieTmdbIds.slice(0, 100)} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5 text-sm">
            {person.birthday && (
              <div>
                <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider mb-0.5">Born</p>
                <p className="text-white">
                  {new Date(person.birthday).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                  {age != null && !person.deathday && <span className="text-[var(--foreground-muted)]"> (age {age})</span>}
                </p>
              </div>
            )}
            {person.deathday && (
              <div>
                <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider mb-0.5">Died</p>
                <p className="text-white">
                  {new Date(person.deathday).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                  {age != null && <span className="text-[var(--foreground-muted)]"> (age {age})</span>}
                </p>
              </div>
            )}
            {person.place_of_birth && (
              <div>
                <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider mb-0.5">Born in</p>
                <p className="text-white line-clamp-2">{person.place_of_birth}</p>
              </div>
            )}
          </div>

          {/* Where do I know them from? */}
          <Link
            href={`/tools/actor-lookup?personId=${person.id}&name=${encodeURIComponent(person.name)}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-sm text-[var(--foreground-muted)] hover:text-white hover:border-[var(--ratist-red)] transition-colors mb-4"
          >
            <Search className="w-3.5 h-3.5" />
            Where do I know them from?
          </Link>

          {person.biography && <CelebrityBio biography={person.biography} />}
        </div>
      </div>

      {/* Filmography — combined movies + TV, sorted by year */}
      {filmography.length > 0 && (
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Film className="w-5 h-5 text-[var(--ratist-red)]" /> Filmography
              <span className="text-sm font-normal text-[var(--foreground-muted)]">({filmography.length})</span>
            </h2>
            <Link
              href={`/movies?cast=${person.id}&castLabels=${encodeURIComponent(person.name)}`}
              className="text-sm text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] transition-colors"
            >
              Show all &rarr;
            </Link>
          </div>
          <CelebrityCreditsSection credits={filmography} type="cast" personId={person.id} />
        </section>
      )}

      {/* Crew credits (Directing, Writing, Production, etc.) */}
      {allCrewCredits.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Clapperboard className="w-5 h-5 text-[var(--ratist-red)]" /> Behind the Camera
            <span className="text-sm font-normal text-[var(--foreground-muted)]">({allCrewCredits.length})</span>
          </h2>
          <CelebrityCreditsSection credits={allCrewCredits} type="crew" personId={person.id} />
        </section>
      )}

      {/* Photos */}
      {photos.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-[var(--ratist-red)]" /> Photos
            <span className="text-sm font-normal text-[var(--foreground-muted)]">({photos.length})</span>
          </h2>
          <p className="text-xs text-[var(--foreground-muted)] mb-4">Click any image to view full size</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {photos.slice(0, 20).map((img, i) => (
              <a
                key={i}
                href={`https://image.tmdb.org/t/p/original${img.file_path}`}
                target="_blank"
                rel="noopener noreferrer"
                className="relative aspect-[2/3] rounded-lg overflow-hidden border border-[var(--border)] hover:border-[var(--ratist-red)] transition-colors block"
              >
                <Image
                  src={`https://image.tmdb.org/t/p/w342${img.file_path}`}
                  alt={`${person.name} photo ${i + 1}`}
                  fill
                  sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 20vw"
                  className="object-cover object-top"
                />
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
