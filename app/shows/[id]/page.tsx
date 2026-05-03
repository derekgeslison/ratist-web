export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Clock, Calendar, Tv, Globe, MonitorPlay, ArrowRight, Radio } from "lucide-react";
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
import ZoomableImage from "@/components/ZoomableImage";
import SmartBackLink from "@/components/SmartBackLink";
import NavEntryRegister from "@/components/NavEntryRegister";
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

  // Cache to local DB — resync if stale (7 days) or if key fields are missing (fire and forget)
  prisma.tVShow.findUnique({ where: { tmdbId: show.id }, select: { cachedAt: true, posterPath: true, contentRating: true } })
    .then((existing) => {
      const age = existing?.cachedAt ? Date.now() - new Date(existing.cachedAt as Date | string).getTime() : Infinity;
      const missingData = existing && (!existing.posterPath || !existing.contentRating);
      if (age > 7 * 24 * 60 * 60 * 1000 || missingData) upsertTVShow(show).catch(() => {});
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
    const [linkedThreads, linkedNews, linkedBlog] = await Promise.all([
      prisma.forumThread.findMany({
        where: { media: { some: { tmdbId: show.id, mediaType: "tv" } } },
        select: {
          id: true, title: true, slug: true, threadType: true, viewCount: true, createdAt: true,
          author: { select: { name: true } },
          _count: { select: { posts: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 10,
      }),
      prisma.newsItem.findMany({
        where: { published: true, publishedAt: { lte: new Date() }, media: { some: { tmdbId: show.id, mediaType: "tv" } } },
        select: { id: true, title: true, slug: true, viewCount: true, publishedAt: true, showAuthor: true, author: { select: { name: true } } },
        orderBy: { publishedAt: "desc" },
        take: 5,
      }),
      prisma.blogPost.findMany({
        where: { published: true, publishedAt: { lte: new Date() }, media: { some: { tmdbId: show.id, mediaType: "tv" } } },
        select: { id: true, title: true, slug: true, type: true, viewCount: true, publishedAt: true, createdAt: true, showAuthor: true, author: { select: { name: true } } },
        orderBy: { publishedAt: "desc" },
        take: 5,
      }),
    ]);
    const forumDiscussions = linkedThreads.map((t) => ({
      id: t.id, title: t.title, slug: t.slug, threadType: t.threadType,
      authorName: t.author.name, postCount: t._count.posts, viewCount: t.viewCount,
      createdAt: t.createdAt.toISOString(), linkType: "forum" as const, linkHref: `/forum/t/${t.slug}`,
    }));
    const newsDiscussions = linkedNews.map((n) => ({
      id: n.id, title: n.title, slug: n.slug ?? "", threadType: "news",
      authorName: n.showAuthor !== false ? (n.author?.name ?? "The Ratist") : "The Ratist", postCount: 0, viewCount: n.viewCount,
      createdAt: (n.publishedAt ?? new Date()).toISOString(), linkType: "news" as const, linkHref: `/news/${n.slug}`,
    }));
    const blogDiscussions = linkedBlog.map((b) => {
      const basePath = b.type === "PUNCH_AND_JUDY" ? "/two-thumbs" : b.type === "MOVIE_MAP" ? "/movie-maps" : "/blog";
      const threadType = b.type === "PUNCH_AND_JUDY" ? "two-thumbs" : b.type === "MOVIE_MAP" ? "movie-map" : "blog";
      return {
        id: b.id, title: b.title, slug: b.slug, threadType,
        authorName: b.showAuthor !== false ? (b.author?.name ?? "The Ratist") : "The Ratist", postCount: 0, viewCount: b.viewCount,
        createdAt: b.createdAt.toISOString(), linkType: "blog" as const, linkHref: `${basePath}/${b.slug}`,
      };
    });
    discussions = [...newsDiscussions, ...blogDiscussions, ...forumDiscussions]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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

  // Fetch text reviews from DB
  let reviews: {
    id: string;
    reviewText: string | null;
    ratistRating: number | null;
    overallRating: number | null;
    reviewType: string;
    ratingScope: string;
    seasonNumber: number;
    hasSpoilers: boolean;
    commentsDisabled: boolean;
    user: { id: string; firebaseUid: string; name: string; avatarUrl: string | null };
    createdAt: Date;
    likeCount: number;
    commentCount: number;
  }[] = [];
  let seasonAggregates: {
    ratingScope: string;
    seasonNumber: number;
    avg: { ratistRating: number | null; storyScore: number | null; styleScore: number | null; emotiveScore: number | null; actingScore: number | null; entertainScore: number | null };
    count: number;
  }[] = [];
  try {
    const dbShow = await prisma.tVShow.findUnique({
      where: { tmdbId: show.id },
      select: { id: true },
    });
    if (dbShow) {
      const [rawReviews, rawAggregates] = await Promise.all([
        prisma.tVShowRating.findMany({
          where: {
            tvShowId: dbShow.id,
            reviewText: { not: null },
            // Exclude drafts (text saved before required fields → no
            // ratistRating computed).
            ratistRating: { not: null },
          },
          select: {
            id: true,
            reviewText: true,
            ratistRating: true,
            overallRating: true,
            reviewType: true,
            ratingScope: true,
            seasonNumber: true,
            hasSpoilers: true,
            commentsDisabled: true,
            createdAt: true,
            user: { select: { id: true, firebaseUid: true, name: true, avatarUrl: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
        prisma.tVShowRating.groupBy({
          by: ["ratingScope", "seasonNumber"],
          where: { tvShowId: dbShow.id, ratistRating: { not: null } },
          _avg: {
            ratistRating: true,
            storyScore: true,
            styleScore: true,
            emotiveScore: true,
            actingScore: true,
            entertainScore: true,
          },
          _count: { ratistRating: true },
        }),
      ]);

      // Fetch comment + like counts from unified models
      const reviewIds = rawReviews.map((r) => r.id);
      const [commentCounts, likeCounts] = await Promise.all([
        prisma.comment.groupBy({
          by: ["targetId"],
          where: { targetType: "review", targetId: { in: reviewIds } },
          _count: { id: true },
        }),
        prisma.postLike.groupBy({
          by: ["targetId"],
          where: { targetType: "review", targetId: { in: reviewIds } },
          _count: { targetId: true },
        }),
      ]);
      const commentMap = new Map(commentCounts.map((c) => [c.targetId, c._count.id]));
      const likeMap = new Map(likeCounts.map((l) => [l.targetId, l._count.targetId]));

      reviews = rawReviews.map((r) => ({
        ...r,
        commentCount: commentMap.get(r.id) ?? 0,
        likeCount: likeMap.get(r.id) ?? 0,
      }));

      seasonAggregates = rawAggregates.map((a) => ({
        ratingScope: a.ratingScope,
        seasonNumber: a.seasonNumber,
        avg: {
          ratistRating: a._avg.ratistRating,
          storyScore: a._avg.storyScore,
          styleScore: a._avg.styleScore,
          emotiveScore: a._avg.emotiveScore,
          actingScore: a._avg.actingScore,
          entertainScore: a._avg.entertainScore,
        },
        count: a._count.ratistRating,
      }));
    }
  } catch { /* DB not ready */ }

  const trailerKey = getShowTrailerKey(show);
  const contentRating = getShowContentRating(show);
  const communityScore = show.vote_average > 0 ? show.vote_average : null;

  // Is there a published Watch Companion for this show?
  let hasCompanion = false;
  try {
    const c = await prisma.watchCompanion.findUnique({
      where: { tmdbId_mediaType: { tmdbId: show.id, mediaType: "tv" } },
      select: { status: true },
    });
    hasCompanion = c?.status === "published";
  } catch { /* DB not ready */ }

  // Ratist series-level community aggregate for JSON-LD. Falls through to
  // TMDB numbers when Ratist hasn't accumulated any series ratings yet.
  let ratistAggregate: { value: number; count: number } | null = null;
  try {
    const dbShow = await prisma.tVShow.findUnique({
      where: { tmdbId: show.id },
      select: { id: true },
    });
    if (dbShow) {
      const agg = await prisma.tVShowRating.aggregate({
        where: { tvShowId: dbShow.id, ratingScope: "series", ratistRating: { not: null } },
        _avg: { ratistRating: true },
        _count: { ratistRating: true },
      });
      if (agg._avg.ratistRating != null && agg._count.ratistRating > 0) {
        ratistAggregate = { value: agg._avg.ratistRating, count: agg._count.ratistRating };
      }
    }
  } catch { /* DB not ready */ }
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
    ...(ratistAggregate
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: ratistAggregate.value.toFixed(1),
            bestRating: "10",
            worstRating: "1",
            ratingCount: ratistAggregate.count,
          },
        }
      : communityScore
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: communityScore.toFixed(1),
            bestRating: "10",
            worstRating: "1",
            ratingCount: show.vote_count ?? 0,
          },
        }
      : {}),
    url: `https://www.theratist.com/shows/${show.id}`,
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://www.theratist.com" },
      { "@type": "ListItem", position: 2, name: "TV Shows", item: "https://www.theratist.com/movies?type=tv" },
      { "@type": "ListItem", position: 3, name: show.name, item: `https://www.theratist.com/shows/${show.id}` },
    ],
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      {/* Breadcrumb + smart back link, rendered above the backdrop so
         the negative-margin poster row below can't cover it. */}
      <NavEntryRegister title={show.name} />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-2">
        <SmartBackLink defaultHref="/movies?type=tv" defaultLabel="All shows" />
      </div>

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
          {/* Poster — tap to zoom into a larger version. */}
          <div className="relative w-32 sm:w-44 lg:w-52 shrink-0 aspect-[2/3] self-start mt-16 sm:mt-20 lg:mt-24 rounded-lg overflow-hidden border-2 border-[var(--border)] shadow-2xl bg-[var(--surface-2)]">
            <ZoomableImage
              src={posterUrl(show.poster_path, "w342")}
              zoomSrc={posterUrl(show.poster_path, "w780")}
              alt={show.name}
              sizes="(max-width: 640px) 128px, (max-width: 1024px) 176px, 208px"
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

        {/* Currently-airing banner. Surfaces only while a season is
           mid-broadcast — i.e. at least one episode has aired AND
           more episodes are still scheduled. We require that
           last_episode_to_air and next_episode_to_air both belong to
           the same season; if last is from an earlier season, the
           upcoming season hasn't started yet (don't surface) and if
           next is null the show has finished airing.

           Annual events (e.g. The Oscars, /shows/27023) list each year's
           ceremony as its own season with a single scheduled episode,
           which would otherwise flag the show as airing 11+ months out.
           Suppress when the next_episode's season has ≤1 episode. */}
        {(() => {
          if (!show.next_episode_to_air) return null;
          const next = show.next_episode_to_air;
          const last = show.last_episode_to_air;
          if (!last || last.season_number !== next.season_number) return null;
          const targetSeason = seasons.find((s) => s.season_number === next.season_number);
          if (targetSeason && (targetSeason.episode_count ?? 0) <= 1) return null;
          const date = next.air_date ? new Date(next.air_date) : null;
          const dateStr = date && !Number.isNaN(date.getTime())
            ? date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined })
            : "TBA";
          return (
            <div className="flex items-center gap-3 bg-blue-500/10 border border-blue-500/40 rounded-xl px-4 py-3 mb-4">
              <Radio className="w-5 h-5 text-blue-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">Currently Airing</p>
                <p className="text-xs text-[var(--foreground-muted)]">
                  Next episode: S{next.season_number}E{next.episode_number}
                  {next.name ? ` "${next.name}"` : ""} · {dateStr}
                </p>
              </div>
            </div>
          );
        })()}

        {/* Watch Companion banner — consistent tagline whether or not a
           companion exists yet. The /companion page handles the generate/
           view distinction on arrival. TV is always eligible. */}
        <Link
          href={`/shows/${show.id}/companion`}
          className="flex items-center gap-3 bg-gradient-to-r from-[var(--ratist-red)]/20 to-transparent border border-[var(--ratist-red)]/40 hover:border-[var(--ratist-red)]/70 rounded-xl px-4 py-3 mb-4 transition-colors group"
        >
          <MonitorPlay className="w-5 h-5 text-[var(--ratist-red)] shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">Watch Companion</p>
            <p className="text-xs text-[var(--foreground-muted)]">Spoiler-safe reference guide to pull up while you watch.</p>
          </div>
          <ArrowRight className="w-4 h-4 text-[var(--foreground-muted)] group-hover:text-white transition-colors shrink-0" />
        </Link>

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
          reviews={reviews.map((r) => ({
            id: r.id,
            reviewText: r.reviewText ?? "",
            ratistRating: r.ratistRating,
            overallRating: r.overallRating,
            reviewType: r.reviewType,
            ratingScope: r.ratingScope,
            seasonNumber: r.seasonNumber,
            hasSpoilers: r.hasSpoilers,
            commentsDisabled: r.commentsDisabled,
            user: r.user,
            createdAt: r.createdAt.toISOString(),
            likeCount: r.likeCount,
            commentCount: r.commentCount,
          }))}
          seasonAggregates={seasonAggregates}
        />
      </div>
    </div>
  );
}
