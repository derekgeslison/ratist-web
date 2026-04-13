export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Clock, Calendar, Tv, Globe } from "lucide-react";
import {
  getShowDetails,
  getShowWatchProviders,
  getShowRecommendations,
  posterUrl,
  backdropUrl,
  getShowTrailerKey,
  getShowContentRating,
  languageName,
  type TMDBShow,
} from "@/lib/tmdb";
import UserShowPanel from "@/components/UserShowPanel";
import ShowDetailTabs from "@/components/ShowDetailTabs";
import { upsertTVShow } from "@/lib/tmdb-sync";
import { prisma } from "@/lib/prisma";
import { getTVShowAwards } from "@/lib/awards";
import { syncTVShowAwards } from "@/lib/awards-sync";
import PageShare from "@/components/PageShare";
import AdUnit from "@/components/AdUnit";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const show = await getShowDetails(Number(id));
    const description = show.overview?.slice(0, 160) ?? undefined;
    const imageUrl = show.poster_path ? posterUrl(show.poster_path, "w500") : undefined;
    const year = show.first_air_date?.slice(0, 4);
    const fullTitle = year ? `${show.name} (${year})` : show.name;
    return {
      title: fullTitle,
      description,
      alternates: { canonical: `https://www.theratist.com/shows/${id}` },
      openGraph: {
        title: `${fullTitle} — The Ratist`,
        description,
        type: "video.tv_show",
        url: `https://www.theratist.com/shows/${id}`,
        ...(imageUrl ? { images: [{ url: imageUrl, width: 500, height: 750 }] } : {}),
      },
      twitter: {
        card: "summary_large_image",
        title: `${fullTitle} — The Ratist`,
        description,
        ...(imageUrl ? { images: [imageUrl] } : {}),
      },
    };
  } catch {
    return { title: "TV Show" };
  }
}

export default async function ShowDetailPage({ params }: Props) {
  const { id } = await params;
  let show: TMDBShow;

  try {
    show = await getShowDetails(Number(id));
  } catch {
    notFound();
  }

  // Parallel fetch: watch providers + recommendations (non-blocking)
  const [watchProviders, recommendations] = await Promise.all([
    getShowWatchProviders(show.id).catch(() => null),
    getShowRecommendations(show.id).catch(() => ({ results: [] })),
  ]);

  // Cache to local DB (fire and forget)
  prisma.tVShow.findUnique({ where: { tmdbId: show.id }, select: { cachedAt: true } })
    .then((existing) => {
      const age = existing?.cachedAt ? Date.now() - new Date(existing.cachedAt as Date | string).getTime() : Infinity;
      if (age > 7 * 24 * 60 * 60 * 1000) upsertTVShow(show).catch(() => {});
    })
    .catch(() => {});

  // Awards sync — fire and forget (requires IMDb ID)
  prisma.tVShow.findUnique({ where: { tmdbId: show.id }, select: { id: true, imdbId: true } })
    .then((dbShow) => {
      if (dbShow?.imdbId) syncTVShowAwards(dbShow.id, dbShow.imdbId).catch(() => {});
    })
    .catch(() => {});

  // Fetch forum discussions linked to this show
  let discussions: { id: string; title: string; slug: string; threadType: string; authorName: string; postCount: number; viewCount: number; createdAt: string }[] = [];
  try {
    const linkedThreads = await prisma.forumThread.findMany({
      where: { media: { some: { tmdbId: show.id, mediaType: "tv" } } },
      select: {
        id: true, title: true, slug: true, threadType: true, viewCount: true, createdAt: true,
        author: { select: { name: true } },
        _count: { select: { posts: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
    });
    discussions = linkedThreads.map((t) => ({
      id: t.id, title: t.title, slug: t.slug, threadType: t.threadType,
      authorName: t.author.name, postCount: t._count.posts, viewCount: t.viewCount,
      createdAt: t.createdAt.toISOString(),
    }));
  } catch { /* DB not ready */ }

  // Fetch awards from DB
  let awards: Awaited<ReturnType<typeof getTVShowAwards>> = [];
  try {
    const dbShow = await prisma.tVShow.findUnique({
      where: { tmdbId: show.id },
      select: { id: true },
    });
    if (dbShow) {
      awards = await getTVShowAwards(dbShow.id);
    }
  } catch { /* DB not ready */ }

  const trailerKey = getShowTrailerKey(show);
  const contentRating = getShowContentRating(show);
  const communityScore = show.vote_average > 0 ? show.vote_average : null;
  const cast = show.aggregate_credits?.cast ?? [];
  const crew = show.aggregate_credits?.crew ?? [];
  const images = show.images?.backdrops ?? [];
  const seasons = show.seasons ?? [];

  // JSON-LD structured data
  const creators = (show.created_by ?? []).map((c) => ({ "@type": "Person" as const, name: c.name }));
  const actors = cast.slice(0, 5).map((c) => ({ "@type": "Person" as const, name: c.name }));
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TVSeries",
    name: show.name,
    ...(show.overview ? { description: show.overview } : {}),
    ...(show.first_air_date ? { datePublished: show.first_air_date } : {}),
    ...(show.poster_path ? { image: posterUrl(show.poster_path, "w500") } : {}),
    ...(creators.length > 0 ? { creator: creators } : {}),
    ...(actors.length > 0 ? { actor: actors } : {}),
    ...(show.genres?.length ? { genre: show.genres.map((g) => g.name) } : {}),
    ...(show.number_of_seasons ? { numberOfSeasons: show.number_of_seasons } : {}),
    ...(show.number_of_episodes ? { numberOfEpisodes: show.number_of_episodes } : {}),
    ...(contentRating ? { contentRating } : {}),
    ...(communityScore ? {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: communityScore.toFixed(1),
        bestRating: "10",
        worstRating: "1",
        ratingCount: show.vote_count ?? 0,
      },
    } : {}),
    url: `https://www.theratist.com/shows/${show.id}`,
  };

  // Compute episode runtime display
  const avgRuntime = show.episode_run_time?.length
    ? Math.round(show.episode_run_time.reduce((a, b) => a + b, 0) / show.episode_run_time.length)
    : null;

  // Year range display
  const startYear = show.first_air_date?.slice(0, 4);
  const endYear = show.status === "Ended" || show.status === "Canceled"
    ? show.last_air_date?.slice(0, 4)
    : "Present";
  const yearDisplay = startYear
    ? endYear && endYear !== startYear
      ? `${startYear}–${endYear}`
      : startYear
    : null;

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {/* Backdrop hero */}
      <div className="relative w-full h-[30vh] min-h-[200px] max-h-[340px] overflow-hidden">
        <Image
          src={backdropUrl(show.backdrop_path, "original")}
          alt={show.name}
          fill
          priority
          sizes="100vw"
          className="object-cover object-top"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--background)] via-[var(--background)]/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[var(--background)]/80 via-transparent to-transparent" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Main info row */}
        <div className="flex gap-6 -mt-16 relative z-10 mb-8">
          {/* Poster */}
          <div className="relative w-32 sm:w-44 lg:w-52 shrink-0 aspect-[2/3] self-start mt-16 sm:mt-20 lg:mt-24 rounded-lg overflow-hidden border-2 border-[var(--border)] shadow-2xl bg-[var(--surface-2)]">
            <Image
              src={posterUrl(show.poster_path, "w342")}
              alt={show.name}
              fill
              sizes="(max-width: 640px) 128px, (max-width: 1024px) 176px, 208px"
              className="object-cover"
            />
          </div>

          {/* Details */}
          <div className="flex-1 pt-16 sm:pt-20 lg:pt-24 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white leading-tight">
                  {show.name}
                </h1>
                <span title="TV Show"><Tv className="w-5 h-5 text-blue-400 shrink-0 mt-1" /></span>
              </div>
              <PageShare title={`${show.name} on The Ratist`} />
            </div>
            {show.tagline && (
              <p className="text-sm italic text-[var(--foreground-muted)] mb-3">{show.tagline}</p>
            )}

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--foreground-muted)] mb-4">
              {contentRating && (
                <span className="border border-[var(--border)] px-2 py-0.5 text-xs rounded font-semibold text-white">
                  {contentRating}
                </span>
              )}
              {yearDisplay && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {yearDisplay}
                </span>
              )}
              {show.number_of_seasons && (
                <span>{show.number_of_seasons} season{show.number_of_seasons !== 1 ? "s" : ""}</span>
              )}
              {avgRuntime && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {avgRuntime}m / episode
                </span>
              )}
              {show.networks && show.networks.length > 0 && (
                <span>{show.networks.map((n) => n.name).join(", ")}</span>
              )}
              {show.original_language && show.original_language !== "en" && (
                <Link
                  href={`/movies?language=${show.original_language}&type=tv`}
                  className="flex items-center gap-1 hover:text-white transition-colors"
                >
                  <Globe className="w-3.5 h-3.5" />
                  {languageName(show.original_language)}
                </Link>
              )}
            </div>

            {/* Genres */}
            {show.genres && show.genres.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {show.genres.map((g) => (
                  <Link
                    key={g.id}
                    href={`/movies?genres=${g.id}&type=tv`}
                    className="text-xs px-3 py-1 rounded-full bg-[var(--surface-2)] border border-[var(--border)] text-[var(--foreground-muted)] hover:border-[var(--ratist-red)] hover:text-white transition-colors"
                  >
                    {g.name}
                  </Link>
                ))}
              </div>
            )}

            <UserShowPanel
              tmdbId={show.id}
              showName={show.name}
              posterPath={show.poster_path}
              tmdbScore={communityScore}
              seasons={seasons}
            />
          </div>
        </div>

        {/* Ad */}
        <AdUnit slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_MOVIE ?? ""} format="auto" className="mb-4" />

        {/* Functional tabs */}
        <ShowDetailTabs
          show={show}
          trailerKey={trailerKey}
          cast={cast}
          crew={crew}
          images={images}
          recommendations={recommendations?.results ?? []}
          streaming={watchProviders?.flatrate ?? null}
          rent={watchProviders?.rent ?? null}
          seasons={seasons}
          discussions={discussions}
          awards={awards}
          tmdbId={show.id}
        />
      </div>
    </div>
  );
}
