export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Clock, Calendar, Globe, Ticket, BookOpen, ArrowRight } from "lucide-react";
import { getFandangoUrl } from "@/lib/affiliates";
import AffiliateLink from "@/components/AffiliateLink";
import ZoomableImage from "@/components/ZoomableImage";
import SmartBackLink from "@/components/SmartBackLink";
import NavEntryRegister from "@/components/NavEntryRegister";
import {
  getMovieDetails,
  getWatchProviders,
  getMovieRecommendations,
  getCollectionDetails,
  posterUrl,
  backdropUrl,
  getTrailerKey,
  getMpaaRating,
  languageName,
  POSTER_BLOCKED_SENTINEL,
  type TMDBMovie,
  type TMDBCollection,
} from "@/lib/tmdb";
import UserMoviePanel from "@/components/UserMoviePanel";
import MoviePosterBlockToggle from "@/components/admin/MoviePosterBlockToggle";
import ReportPosterButton from "@/components/ReportPosterButton";
import MovieDetailTabs from "@/components/MovieDetailTabs";
import CommunityBreakdown from "@/components/CommunityBreakdown";
import { upsertMovie } from "@/lib/tmdb-sync";
import { getMovieBoxOfficeRanks } from "@/lib/box-office-queries";
import { getMovieAwards } from "@/lib/awards";
import { syncMovieAwards } from "@/lib/awards-sync";
import { prisma } from "@/lib/prisma";
import { safeguardTMDBMovies } from "@/lib/safe-content";
import PageShare from "@/components/PageShare";
import ShareNudge from "@/components/ShareNudge";
import AdUnit from "@/components/AdUnit";
import PosterOverlay from "@/components/PosterOverlay";
import MovieCard from "@/components/MovieCard";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const movie = await getMovieDetails(Number(id));
    const description = movie.overview?.slice(0, 160) ?? undefined;
    const imageUrl = movie.poster_path ? posterUrl(movie.poster_path, "w500") : undefined;
    const year = movie.release_date?.slice(0, 4);
    const fullTitle = year ? `${movie.title} (${year})` : movie.title;
    return {
      title: fullTitle,
      description,
      alternates: { canonical: `https://www.theratist.com/movies/${id}` },
      openGraph: {
        title: `${fullTitle} — The Ratist`,
        description,
        type: "video.movie",
        url: `https://www.theratist.com/movies/${id}`,
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
    return { title: "Movie" };
  }
}

export default async function MovieDetailPage({ params }: Props) {
  const { id } = await params;
  let movie: TMDBMovie;

  try {
    movie = await getMovieDetails(Number(id));
  } catch {
    notFound();
  }

  // Parallel fetch: TMDB-side data + the one local Movie row we need
  // across every downstream sub-query on this page. Previously this
  // page issued ~4 separate findUnique calls for the same row and
  // walked through 5+ DB blocks sequentially; consolidating cuts the
  // server-render TTFB on every visit. catch(null) keeps the page
  // resilient to a stale DB connection or a missing row.
  const [watchProviders, recommendations, collection, boxOfficeRanks, dbMovie] = await Promise.all([
    getWatchProviders(movie.id).catch(() => null),
    getMovieRecommendations(movie.id).catch(() => ({ results: [] })),
    movie.belongs_to_collection
      ? getCollectionDetails(movie.belongs_to_collection.id).catch(() => null)
      : Promise.resolve(null),
    getMovieBoxOfficeRanks(movie.id).catch(() => null),
    prisma.movie.findUnique({
      where: { tmdbId: movie.id },
      select: { id: true, imdbId: true, cachedAt: true, posterPath: true, mpaaRating: true, posterBlocked: true, mediaBlocked: true, isAdult: true },
    }).catch(() => null),
  ]);

  // Hide-entirely gate: TMDB-adult-flagged movies don't get detail
  // pages on this site. notFound() returns the standard 404 shell
  // so any incoming link / search-engine hit lands on a clean
  // "page not found" rather than the title's real page.
  if (dbMovie?.isAdult) {
    notFound();
  }
  // Mask the movie's own poster if an admin / the Vision auto-scan
  // has flagged it. We stamp the sentinel so posterUrl() resolves to
  // the custom /poster-blocked.svg placeholder (distinct from the
  // generic missing-poster fallback).
  if (dbMovie?.posterBlocked) {
    movie.poster_path = POSTER_BLOCKED_SENTINEL;
  }

  // Mask blocked posters inside the recommendations rail rendered
  // further down by MovieDetailTabs.
  recommendations.results = await safeguardTMDBMovies(recommendations.results, {
    filterNC17: true,
    stripBlockedPosters: true,
  });

  // Collection parts ("Part of X" strip on the detail page). Mask
  // blocked posters but keep all parts in the strip — filtering NC-17
  // entries out entirely would drop the franchise's adult parts and
  // could collapse the strip below the length-2 threshold, hiding the
  // entire section. Placeholder + title is the right UX here.
  if (collection?.parts?.length) {
    collection.parts = await safeguardTMDBMovies(collection.parts, {
      stripBlockedPosters: true,
    });
  }

  // Fire-and-forget syncs — driven off the single dbMovie lookup above.
  if (dbMovie) {
    const age = dbMovie.cachedAt ? Date.now() - new Date(dbMovie.cachedAt as Date | string).getTime() : Infinity;
    const missingData = !dbMovie.posterPath || !dbMovie.mpaaRating;
    if (age > 7 * 24 * 60 * 60 * 1000 || missingData) upsertMovie(movie).catch(() => {});
    syncMovieAwards(dbMovie.id, movie.id, dbMovie.imdbId ?? movie.imdb_id).catch(() => {});
  } else {
    // Row doesn't exist yet — first-time view. Upsert it.
    upsertMovie(movie).catch(() => {});
  }

  // All remaining DB-backed page data fetched in parallel. Each
  // sub-fetch handles its own missing-dbMovie / DB-error case so a
  // single failing block doesn't take the whole page down.
  type ReviewRow = {
    id: string;
    reviewText: string | null;
    ratistRating: number | null;
    overallRating: number | null;
    reviewType: string;
    hasSpoilers: boolean;
    commentsDisabled: boolean;
    user: { id: string; firebaseUid: string; name: string; avatarUrl: string | null };
    createdAt: Date;
    likeCount: number;
    commentCount: number;
  };
  type DiscussionRow = { id: string; title: string; slug: string; threadType: string; authorName: string; postCount: number; viewCount: number; createdAt: string };

  const movieRowId = dbMovie?.id;
  const [reviews, discussions, hasCompanion, awards, ratistAggregate] = await Promise.all([
    // Reviews: pulled from movie_ratings + comment/like counts in a 2-step pipeline.
    (async (): Promise<ReviewRow[]> => {
      if (!movieRowId) return [];
      try {
        const rawReviews = await prisma.movieRating.findMany({
          where: {
            movieId: movieRowId,
            reviewText: { not: null },
            // Exclude drafts. ratistRating is null on drafts; basic
            // reviews mirror overallRating, standard/critic compute
            // from required sub-fields.
            ratistRating: { not: null },
          },
          select: {
            id: true,
            reviewText: true,
            ratistRating: true,
            overallRating: true,
            reviewType: true,
            hasSpoilers: true,
            commentsDisabled: true,
            createdAt: true,
            user: { select: { id: true, firebaseUid: true, name: true, avatarUrl: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        });
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
        return rawReviews.map((r) => ({
          ...r,
          commentCount: commentMap.get(r.id) ?? 0,
          likeCount: likeMap.get(r.id) ?? 0,
        }));
      } catch {
        return [];
      }
    })(),

    // Discussions: forum + news + blog rolled into one sorted list.
    (async (): Promise<DiscussionRow[]> => {
      try {
        const [linkedThreads, linkedNews, linkedBlog] = await Promise.all([
          prisma.forumThread.findMany({
            where: { media: { some: { tmdbId: movie.id, mediaType: "movie" } } },
            select: {
              id: true, title: true, slug: true, threadType: true, viewCount: true, createdAt: true,
              author: { select: { name: true } },
              _count: { select: { posts: true } },
            },
            orderBy: { updatedAt: "desc" },
            take: 10,
          }),
          prisma.newsItem.findMany({
            where: { published: true, publishedAt: { lte: new Date() }, media: { some: { tmdbId: movie.id, mediaType: "movie" } } },
            select: { id: true, title: true, slug: true, viewCount: true, publishedAt: true, showAuthor: true, author: { select: { name: true } } },
            orderBy: { publishedAt: "desc" },
            take: 5,
          }),
          prisma.blogPost.findMany({
            where: { published: true, publishedAt: { lte: new Date() }, media: { some: { tmdbId: movie.id, mediaType: "movie" } } },
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
        return [...newsDiscussions, ...blogDiscussions, ...forumDiscussions]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      } catch {
        return [];
      }
    })(),

    // Published Watch Companion check.
    prisma.watchCompanion.findUnique({
      where: { tmdbId_mediaType: { tmdbId: movie.id, mediaType: "movie" } },
      select: { status: true },
    }).then((c) => c?.status === "published").catch(() => false),

    // Awards from DB.
    movieRowId ? getMovieAwards(movieRowId).catch(() => [] as Awaited<ReturnType<typeof getMovieAwards>>) : Promise.resolve([] as Awaited<ReturnType<typeof getMovieAwards>>),

    // Ratist community aggregate for JSON-LD.
    (async (): Promise<{ value: number; count: number } | null> => {
      if (!movieRowId) return null;
      try {
        const agg = await prisma.movieRating.aggregate({
          // excluded: false keeps admin-flagged review-bomb ratings out
          // of the public-facing community aggregate that feeds JSON-LD.
          where: { movieId: movieRowId, ratistRating: { not: null }, excluded: false },
          _avg: { ratistRating: true },
          _count: { ratistRating: true },
        });
        if (agg._avg.ratistRating != null && agg._count.ratistRating > 0) {
          return { value: agg._avg.ratistRating, count: agg._count.ratistRating };
        }
        return null;
      } catch {
        return null;
      }
    })(),
  ]);

  const trailerKey = getTrailerKey(movie);
  const mpaaRating = getMpaaRating(movie);
  const communityScore = movie.vote_average > 0 ? movie.vote_average : null;

  // Check if movie is currently in theaters (released within last 8 weeks)
  const releaseDate = movie.release_date ? new Date(movie.release_date) : null;
  const eightWeeksAgo = new Date(Date.now() - 56 * 24 * 60 * 60 * 1000);
  const isInTheaters = releaseDate && releaseDate >= eightWeeksAgo && releaseDate <= new Date();
  const cast = movie.credits?.cast ?? [];
  const crew = movie.credits?.crew ?? [];
  // Media tab safeguard: NC-17 movies almost always ship explicit
  // backdrop/still imagery, so we suppress the whole tab by default.
  // Admins can additionally flip Movie.mediaBlocked on NR / unrated
  // films via the moderation queue.
  const suppressMedia = mpaaRating === "NC-17" || dbMovie?.mediaBlocked === true;
  const images = suppressMedia ? [] : (movie.images?.backdrops ?? []);

  // JSON-LD structured data
  const directors = crew.filter((c) => c.job === "Director").map((c) => c.name);
  const actors = cast.slice(0, 5).map((c) => ({ "@type": "Person" as const, name: c.name }));
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Movie",
    name: movie.title,
    ...(movie.overview ? { description: movie.overview } : {}),
    ...(movie.release_date ? { datePublished: movie.release_date } : {}),
    ...(movie.poster_path ? { image: posterUrl(movie.poster_path, "w500") } : {}),
    ...(directors.length > 0 ? { director: directors.map((d) => ({ "@type": "Person", name: d })) } : {}),
    ...(actors.length > 0 ? { actor: actors } : {}),
    ...(movie.genres?.length ? { genre: movie.genres.map((g) => g.name) } : {}),
    ...(movie.runtime ? { duration: `PT${movie.runtime}M` } : {}),
    ...(mpaaRating ? { contentRating: mpaaRating } : {}),
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
            ratingCount: movie.vote_count ?? 0,
          },
        }
      : {}),
    url: `https://www.theratist.com/movies/${movie.id}`,
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://www.theratist.com" },
      { "@type": "ListItem", position: 2, name: "Movies", item: "https://www.theratist.com/movies" },
      { "@type": "ListItem", position: 3, name: movie.title, item: `https://www.theratist.com/movies/${movie.id}` },
    ],
  };

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      {/* Breadcrumb registration + smart back link, rendered ABOVE the
         backdrop hero so it can't get covered by the negative-margin
         poster row that overlaps the bottom of the hero. Lives in its
         own slim row at the top of the page. */}
      <NavEntryRegister title={movie.title} />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-2">
        <SmartBackLink defaultHref="/movies" defaultLabel="All movies" />
      </div>

      {/* Backdrop hero. When media is suppressed (NC-17 auto, or
          admin-flipped mediaBlocked, or the poster itself is blocked)
          the backdrop comes from the same TMDB images pool we don't
          want to surface — fall back to the gradient placeholder. */}
      <div className="relative w-full h-[30vh] min-h-[200px] max-h-[340px] overflow-hidden">
        <Image
          src={(suppressMedia || dbMovie?.posterBlocked) ? "/placeholder-backdrop.svg" : backdropUrl(movie.backdrop_path, "original")}
          alt={movie.title}
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
          <div className="self-start mt-16 sm:mt-20 lg:mt-24">
            <div className="relative w-32 sm:w-44 lg:w-52 shrink-0 aspect-[2/3] rounded-lg overflow-hidden border-2 border-[var(--border)] shadow-2xl bg-[var(--surface-2)]">
              <ZoomableImage
                src={posterUrl(movie.poster_path, "w342")}
                zoomSrc={posterUrl(movie.poster_path, "w780")}
                alt={movie.title}
                sizes="(max-width: 640px) 128px, (max-width: 1024px) 176px, 208px"
              />
            </div>
            {(mpaaRating === "NC-17" || mpaaRating === "NR" || !mpaaRating) && (
              <MoviePosterBlockToggle
                tmdbId={movie.id}
                initialPosterBlocked={dbMovie?.posterBlocked ?? false}
                initialMediaBlocked={dbMovie?.mediaBlocked ?? false}
              />
            )}
          </div>

          {/* Details */}
          <div className="flex-1 pt-16 sm:pt-20 lg:pt-24 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white leading-tight">
                {movie.title}
              </h1>
              <div className="flex items-center gap-2 shrink-0">
                {(mpaaRating === "NC-17" || mpaaRating === "NR" || !mpaaRating) && (
                  <ReportPosterButton tmdbId={movie.id} />
                )}
                <PageShare title={`${movie.title} on The Ratist`} />
              </div>
            </div>
            {movie.tagline && (
              <p className="text-sm italic text-[var(--foreground-muted)] mb-3">{movie.tagline}</p>
            )}

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--foreground-muted)] mb-4">
              {mpaaRating && (
                <span className="border border-[var(--border)] px-2 py-0.5 text-xs rounded font-semibold text-white">
                  {mpaaRating}
                </span>
              )}
              {movie.release_date && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {movie.release_date.slice(0, 4)}
                </span>
              )}
              {(movie.runtime ?? 0) > 0 && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {Math.floor(movie.runtime! / 60)}h {movie.runtime! % 60}m
                </span>
              )}
              {movie.original_language && movie.original_language !== "en" && (
                <Link
                  href={`/movies?language=${movie.original_language}`}
                  className="flex items-center gap-1 hover:text-white transition-colors"
                >
                  <Globe className="w-3.5 h-3.5" />
                  {languageName(movie.original_language)}
                </Link>
              )}
            </div>

            {/* Genres */}
            {movie.genres && movie.genres.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {movie.genres.map((g) => (
                  <Link
                    key={g.id}
                    href={`/movies?genres=${g.id}`}
                    className="text-xs px-3 py-1 rounded-full bg-[var(--surface-2)] border border-[var(--border)] text-[var(--foreground-muted)] hover:border-[var(--ratist-red)] hover:text-white transition-colors"
                  >
                    {g.name}
                  </Link>
                ))}
              </div>
            )}

            {/* In Theaters — showtimes link */}
            {isInTheaters && (
              <AffiliateLink
                href={getFandangoUrl(movie.title)}
                provider="fandango"
                mediaType="movie"
                tmdbId={movie.id}
                className="inline-flex items-center gap-2 px-4 py-2 mb-4 bg-[var(--surface)] border border-orange-400/50 rounded-full text-sm font-semibold text-orange-400 hover:bg-orange-400/10 transition-colors"
              >
                <Ticket className="w-4 h-4" />
                Find Showtimes & Tickets
              </AffiliateLink>
            )}

            <UserMoviePanel
              tmdbId={movie.id}
              movieTitle={movie.title}
              posterPath={movie.poster_path}
              tmdbScore={communityScore}
            />
          </div>
        </div>

        {/* Community ratings breakdown — full-width below the
           poster row so the bars aren't squeezed into the narrow
           right column on mobile. */}
        <div className="mb-6">
          <CommunityBreakdown tmdbId={movie.id} mediaType="movie" />
        </div>

        {/* Collection / Franchise */}
        {collection && collection.parts.length > 1 && (
          <section className="mb-6">
            <h2 className="text-sm font-semibold text-white mb-3">
              Part of <span className="text-[var(--ratist-red)]">{collection.name}</span>
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2 pt-1 px-1 -mx-1 scrollbar-thin">
              {collection.parts
                .sort((a, b) => (a.release_date || "9999").localeCompare(b.release_date || "9999"))
                .map((part) => {
                  const isCurrent = part.id === movie.id;
                  return (
                    <div key={part.id} className={`shrink-0 w-[140px] relative ${isCurrent ? "" : "opacity-70 hover:opacity-100"} transition-opacity`}>
                      {isCurrent && (
                        <div className="absolute top-1.5 left-1.5 bg-[var(--ratist-red)] text-white text-[9px] font-bold px-1.5 py-0.5 rounded z-20">
                          Current
                        </div>
                      )}
                      <MovieCard movie={part as TMDBMovie} />
                    </div>
                  );
                })}
            </div>
          </section>
        )}

        {/* Watch Companion banner — consistent tagline regardless of
           whether one exists yet. The /companion page handles the
           generate-or-view distinction. Hidden for movies with no digital
           provider (likely still theatrical) since we block generation
           there anyway. */}
        {(() => {
          const hasAnyProvider = !!(watchProviders?.flatrate?.length || watchProviders?.rent?.length || watchProviders?.buy?.length);
          if (!hasAnyProvider) return null;
          return (
            <Link
              href={`/movies/${movie.id}/companion`}
              className="flex items-center gap-3 bg-gradient-to-r from-[var(--ratist-red)]/20 to-transparent border border-[var(--ratist-red)]/40 hover:border-[var(--ratist-red)]/70 rounded-xl px-4 py-3 mb-4 transition-colors group"
            >
              <BookOpen className="w-5 h-5 text-[var(--ratist-red)] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">Watch Companion</p>
                <p className="text-xs text-[var(--foreground-muted)]">Spoiler-safe reference guide to pull up while you watch.</p>
              </div>
              <ArrowRight className="w-4 h-4 text-[var(--foreground-muted)] group-hover:text-white transition-colors shrink-0" />
            </Link>
          );
        })()}

        {/* Ad — between collection and tabs */}
        <AdUnit slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_MOVIE ?? ""} format="auto" className="mb-4" />

        {/* Functional tabs */}
        <MovieDetailTabs
          movie={movie}
          trailerKey={trailerKey}
          cast={cast}
          crew={crew}
          images={images}
          recommendations={recommendations?.results ?? []}
          streaming={watchProviders?.flatrate ?? null}
          rent={watchProviders?.rent ?? null}
          reviews={reviews.map((r) => ({
            id: r.id,
            reviewText: r.reviewText ?? "",
            ratistRating: r.ratistRating,
            overallRating: r.overallRating,
            reviewType: r.reviewType,
            hasSpoilers: r.hasSpoilers,
            commentsDisabled: r.commentsDisabled,
            commentCount: r.commentCount,
            likeCount: r.likeCount,
            user: r.user,
            createdAt: r.createdAt.toISOString(),
          }))}
          discussions={discussions}
          awards={awards}
          tmdbId={movie.id}
          boxOfficeRanks={boxOfficeRanks ?? undefined}
        />

        <ShareNudge
          url={`https://www.theratist.com/movies/${movie.id}`}
          text={`${movie.title} on The Ratist`}
        />
      </div>
    </div>
  );
}
