export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Search } from "lucide-react";
import PageShare from "@/components/PageShare";
import ShareNudge from "@/components/ShareNudge";
import ZoomableImage from "@/components/ZoomableImage";
import SmartBackLink from "@/components/SmartBackLink";
import NavEntryRegister from "@/components/NavEntryRegister";
import AdUnit from "@/components/AdUnit";
import { prisma } from "@/lib/prisma";
import CelebrityBio from "./CelebrityBio";
import CelebrityUserPanel from "./CelebrityUserPanel";
import CelebrityDetailTabs from "./CelebrityDetailTabs";
import { upsertCelebrity } from "@/lib/tmdb-sync";
import { getCelebrityAwards } from "@/lib/awards";
import { syncCelebrityAwards } from "@/lib/awards-sync";

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
  imdb_id?: string;
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
      alternates: { canonical: `/celebrities/${id}` },
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

  // Awards sync — fire and forget
  prisma.celebrity.findUnique({ where: { tmdbId: person.id }, select: { id: true, imdbId: true } })
    .then((dbCeleb) => {
      if (dbCeleb) syncCelebrityAwards(dbCeleb.id, person.id, dbCeleb.imdbId ?? person.imdb_id).catch(() => {});
    })
    .catch(() => {});

  // Build unified filmography: merge cast + crew per title, deduped by id+mediaType
  type FilmEntry = {
    id: number; title: string; poster_path: string | null; release_date: string;
    vote_average: number; character?: string; jobs: string[]; popularity: number;
    mediaType: "movie" | "tv";
  };
  const filmMap = new Map<string, FilmEntry>();

  // Add movie cast
  for (const m of person.movie_credits.cast) {
    const key = `movie-${m.id}`;
    const existing = filmMap.get(key);
    if (existing) { if (m.character && !existing.character) existing.character = m.character; }
    else filmMap.set(key, { id: m.id, title: m.title, poster_path: m.poster_path, release_date: m.release_date, vote_average: m.vote_average, character: m.character, jobs: [], popularity: m.popularity, mediaType: "movie" });
  }
  // Add TV cast
  for (const s of person.tv_credits?.cast ?? []) {
    const key = `tv-${s.id}`;
    const existing = filmMap.get(key);
    if (existing) { if (s.character && !existing.character) existing.character = s.character; }
    else filmMap.set(key, { id: s.id, title: s.name, poster_path: s.poster_path, release_date: s.first_air_date, vote_average: s.vote_average, character: s.character, jobs: [], popularity: s.popularity, mediaType: "tv" });
  }
  // Add movie crew (merge jobs into existing entries or create new)
  for (const c of person.movie_credits.crew) {
    const key = `movie-${c.id}`;
    const existing = filmMap.get(key);
    if (existing) { if (!existing.jobs.includes(c.job)) existing.jobs.push(c.job); }
    else filmMap.set(key, { id: c.id, title: c.title, poster_path: c.poster_path, release_date: c.release_date, vote_average: c.vote_average, jobs: [c.job], popularity: c.popularity, mediaType: "movie" });
  }
  // Add TV crew
  for (const c of person.tv_credits?.crew ?? []) {
    const key = `tv-${c.id}`;
    const existing = filmMap.get(key);
    if (existing) { if (!existing.jobs.includes(c.job)) existing.jobs.push(c.job); }
    else filmMap.set(key, { id: c.id, title: c.name, poster_path: c.poster_path, release_date: c.first_air_date, vote_average: c.vote_average, jobs: [c.job], popularity: c.popularity, mediaType: "tv" });
  }

  const filmography = [...filmMap.values()]
    .sort((a, b) => {
      // No release date = announced/upcoming, sort to the top (newest)
      const dateA = a.release_date ? new Date(a.release_date).getTime() : Infinity;
      const dateB = b.release_date ? new Date(b.release_date).getTime() : Infinity;
      return dateB - dateA;
    });

  // Photos
  const photos = person.images?.profiles ?? [];

  const age = person.birthday
    ? Math.floor(
        (new Date(person.deathday ?? Date.now()).getTime() - new Date(person.birthday).getTime()) /
          (1000 * 60 * 60 * 24 * 365.25)
      )
    : null;

  // TMDB avg from movie credits (for community rating calc)
  const movieCredits = filmography.filter((f) => f.mediaType === "movie");
  const allMovieTmdbIds = movieCredits.map((m) => m.id);
  const tmdbRatedMovies = movieCredits.filter((m) => m.vote_average > 0);
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

  // Fetch awards from DB
  let awards: Awaited<ReturnType<typeof getCelebrityAwards>> = [];
  try {
    const dbCeleb = await prisma.celebrity.findUnique({
      where: { tmdbId: person.id },
      select: { id: true },
    });
    if (dbCeleb) {
      awards = await getCelebrityAwards(dbCeleb.id);
    }
  } catch { /* DB not ready */ }

  // Fetch forum discussions about this person
  let discussions: { id: string; title: string; slug: string; threadType: string; authorName: string; postCount: number; createdAt: string; linkHref?: string }[] = [];
  try {
    const [threads, newsItems, blogItems] = await Promise.all([
      prisma.forumThread.findMany({
        where: { people: { some: { tmdbId: person.id } } },
        select: {
          id: true, title: true, slug: true, threadType: true, createdAt: true,
          author: { select: { name: true } },
          _count: { select: { posts: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 10,
      }),
      prisma.newsItem.findMany({
        where: { published: true, publishedAt: { lte: new Date() }, people: { some: { tmdbId: person.id } } },
        select: { id: true, title: true, slug: true, publishedAt: true, showAuthor: true, author: { select: { name: true } } },
        orderBy: { publishedAt: "desc" },
        take: 5,
      }),
      prisma.blogPost.findMany({
        where: { published: true, publishedAt: { lte: new Date() }, people: { some: { tmdbId: person.id } } },
        select: { id: true, title: true, slug: true, type: true, publishedAt: true, createdAt: true, showAuthor: true, author: { select: { name: true } } },
        orderBy: { publishedAt: "desc" },
        take: 5,
      }),
    ]);
    const forumDiscussions = threads.map((t) => ({
      id: t.id, title: t.title, slug: t.slug, threadType: t.threadType,
      authorName: t.author.name, postCount: t._count.posts,
      createdAt: t.createdAt.toISOString(), linkHref: `/forum/t/${t.slug}`,
    }));
    const newsDiscussions = newsItems.map((n) => ({
      id: n.id, title: n.title, slug: n.slug ?? "", threadType: "news",
      authorName: n.showAuthor !== false ? (n.author?.name ?? "The Ratist") : "The Ratist", postCount: 0,
      createdAt: (n.publishedAt ?? new Date()).toISOString(), linkHref: `/news/${n.slug}`,
    }));
    const blogDiscussions = blogItems.map((b) => {
      const basePath = b.type === "PUNCH_AND_JUDY" ? "/two-thumbs" : b.type === "MOVIE_MAP" ? "/movie-maps" : "/blog";
      const threadType = b.type === "PUNCH_AND_JUDY" ? "two-thumbs" : b.type === "MOVIE_MAP" ? "movie-map" : "blog";
      return {
        id: b.id, title: b.title, slug: b.slug, threadType,
        authorName: b.showAuthor !== false ? (b.author?.name ?? "The Ratist") : "The Ratist", postCount: 0,
        createdAt: b.createdAt.toISOString(), linkHref: `${basePath}/${b.slug}`,
      };
    });
    discussions = [...newsDiscussions, ...blogDiscussions, ...forumDiscussions]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch { /* DB not ready */ }

  const personSchema = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: person.name,
    url: `https://www.theratist.com/celebrities/${id}`,
    ...(person.profile_path ? { image: `https://image.tmdb.org/t/p/w500${person.profile_path}` } : {}),
    ...(person.biography ? { description: person.biography.slice(0, 500) } : {}),
    ...(person.birthday ? { birthDate: person.birthday } : {}),
    ...(person.deathday ? { deathDate: person.deathday } : {}),
    ...(person.place_of_birth ? { birthPlace: person.place_of_birth } : {}),
    ...(person.known_for_department ? { jobTitle: person.known_for_department } : {}),
    ...(person.imdb_id ? { sameAs: [`https://www.imdb.com/name/${person.imdb_id}/`] } : {}),
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://www.theratist.com" },
      { "@type": "ListItem", position: 2, name: "Celebrities", item: "https://www.theratist.com/celebrities" },
      { "@type": "ListItem", position: 3, name: person.name, item: `https://www.theratist.com/celebrities/${id}` },
    ],
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(personSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      {/* Smart back link — points to wherever the user actually came
         from (e.g., the movie they just clicked an actor on). Falls
         back to the celebrities list when the in-app breadcrumb is
         empty. NavEntryRegister pushes this person's name so OTHER
         pages get "Back to {name}" when navigating from here. */}
      <NavEntryRegister title={person.name} />
      <div className="mb-6">
        <SmartBackLink defaultHref="/celebrities" defaultLabel="All celebrities" className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] transition-colors" />
      </div>

      <div className="flex flex-col sm:flex-row gap-8 mb-10">
        {/* Photo — tap to zoom into a larger version. */}
        <div className="relative w-40 h-60 sm:w-48 sm:h-72 shrink-0 rounded-xl overflow-hidden bg-[var(--surface-2)] border border-[var(--border)]">
          {person.profile_path ? (
            <ZoomableImage
              src={`https://image.tmdb.org/t/p/w300${person.profile_path}`}
              zoomSrc={`https://image.tmdb.org/t/p/h632${person.profile_path}`}
              alt={person.name}
              sizes="192px"
              objectClassName="object-cover object-top"
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

      <AdUnit slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_COMMUNITY ?? ""} format="auto" className="mb-4" />

      {/* Tabbed content */}
      <CelebrityDetailTabs
        personId={person.id}
        personName={person.name}
        filmography={filmography}
        awards={awards}
        photos={photos}
        discussions={discussions}
      />

      <ShareNudge
        url={`https://www.theratist.com/celebrities/${person.id}`}
        text={`${person.name} on The Ratist`}
      />
    </div>
  );
}
