export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Clock, Calendar, Globe, Ticket } from "lucide-react";
import { getFandangoUrl } from "@/lib/affiliates";
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
  type TMDBMovie,
  type TMDBCollection,
} from "@/lib/tmdb";
import UserMoviePanel from "@/components/UserMoviePanel";
import MovieDetailTabs from "@/components/MovieDetailTabs";
import { upsertMovie } from "@/lib/tmdb-sync";
import { getMovieAwards } from "@/lib/awards";
import { syncMovieAwards } from "@/lib/awards-sync";
import { prisma } from "@/lib/prisma";
import PageShare from "@/components/PageShare";
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

  // Parallel fetch: watch providers + recommendations + collection (non-blocking)
  const [watchProviders, recommendations, collection] = await Promise.all([
    getWatchProviders(movie.id).catch(() => null),
    getMovieRecommendations(movie.id).catch(() => ({ results: [] })),
    movie.belongs_to_collection
      ? getCollectionDetails(movie.belongs_to_collection.id).catch(() => null)
      : Promise.resolve(null),
  ]);

  // Cache to local DB — only if not recently synced (fire and forget)
  prisma.movie.findUnique({ where: { tmdbId: movie.id }, select: { cachedAt: true } })
    .then((existing) => {
      const age = existing?.cachedAt ? Date.now() - new Date(existing.cachedAt as Date | string).getTime() : Infinity;
      if (age > 7 * 24 * 60 * 60 * 1000) upsertMovie(movie).catch(() => {});
    })
    .catch(() => {});

  // Awards sync — fire and forget
  prisma.movie.findUnique({ where: { tmdbId: movie.id }, select: { id: true, imdbId: true } })
    .then((dbMovie) => {
      if (dbMovie) syncMovieAwards(dbMovie.id, movie.id, dbMovie.imdbId ?? movie.imdb_id).catch(() => {});
    })
    .catch(() => {});

  // Fetch text reviews from DB
  let reviews: {
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
  }[] = [];
  try {
    const dbMovie = await prisma.movie.findUnique({
      where: { tmdbId: movie.id },
      select: { id: true },
    });
    if (dbMovie) {
      const rawReviews = await prisma.movieRating.findMany({
        where: {
          movieId: dbMovie.id,
          reviewText: { not: null },
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
    }
  } catch {
    // DB not ready yet
  }

  // Fetch forum threads linked to this movie
  let discussions: { id: string; title: string; slug: string; threadType: string; authorName: string; postCount: number; viewCount: number; createdAt: string }[] = [];
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
        where: { published: true, media: { some: { tmdbId: movie.id, mediaType: "movie" } } },
        select: { id: true, title: true, slug: true, viewCount: true, publishedAt: true, author: { select: { name: true } } },
        orderBy: { publishedAt: "desc" },
        take: 5,
      }),
      prisma.blogPost.findMany({
        where: { published: true, media: { some: { tmdbId: movie.id, mediaType: "movie" } } },
        select: { id: true, title: true, slug: true, viewCount: true, createdAt: true, author: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
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
      authorName: n.author?.name ?? "The Ratist", postCount: 0, viewCount: n.viewCount,
      createdAt: (n.publishedAt ?? new Date()).toISOString(), linkType: "news" as const, linkHref: `/news/${n.slug}`,
    }));
    const blogDiscussions = linkedBlog.map((b) => ({
      id: b.id, title: b.title, slug: b.slug, threadType: "blog",
      authorName: b.author?.name ?? "The Ratist", postCount: 0, viewCount: b.viewCount,
      createdAt: b.createdAt.toISOString(), linkType: "blog" as const, linkHref: `/blog/${b.slug}`,
    }));
    discussions = [...newsDiscussions, ...blogDiscussions, ...forumDiscussions];
  } catch { /* DB not ready */ }

  // Fetch awards from DB
  let awards: Awaited<ReturnType<typeof getMovieAwards>> = [];
  try {
    const dbMovie = await prisma.movie.findUnique({
      where: { tmdbId: movie.id },
      select: { id: true },
    });
    if (dbMovie) {
      awards = await getMovieAwards(dbMovie.id);
    }
  } catch { /* DB not ready */ }

  const trailerKey = getTrailerKey(movie);
  const mpaaRating = getMpaaRating(movie);
  const communityScore = movie.vote_average > 0 ? movie.vote_average : null;

  // Check if movie is currently in theaters (released within last 8 weeks)
  const releaseDate = movie.release_date ? new Date(movie.release_date) : null;
  const eightWeeksAgo = new Date(Date.now() - 56 * 24 * 60 * 60 * 1000);
  const isInTheaters = releaseDate && releaseDate >= eightWeeksAgo && releaseDate <= new Date();
  const cast = movie.credits?.cast ?? [];
  const crew = movie.credits?.crew ?? [];
  const images = movie.images?.backdrops ?? [];

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
    ...(communityScore ? {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: communityScore.toFixed(1),
        bestRating: "10",
        worstRating: "1",
        ratingCount: movie.vote_count ?? 0,
      },
    } : {}),
    url: `https://www.theratist.com/movies/${movie.id}`,
  };

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {/* Backdrop hero */}
      <div className="relative w-full h-[30vh] min-h-[200px] max-h-[340px] overflow-hidden">
        <Image
          src={backdropUrl(movie.backdrop_path, "original")}
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
          {/* Poster */}
          <div className="relative w-32 sm:w-44 lg:w-52 shrink-0 aspect-[2/3] self-start mt-16 sm:mt-20 lg:mt-24 rounded-lg overflow-hidden border-2 border-[var(--border)] shadow-2xl bg-[var(--surface-2)]">
            <Image
              src={posterUrl(movie.poster_path, "w342")}
              alt={movie.title}
              fill
              sizes="(max-width: 640px) 128px, (max-width: 1024px) 176px, 208px"
              className="object-cover"
            />
          </div>

          {/* Details */}
          <div className="flex-1 pt-16 sm:pt-20 lg:pt-24 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white leading-tight">
                {movie.title}
              </h1>
              <PageShare title={`${movie.title} on The Ratist`} />
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
              {movie.runtime && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {Math.floor(movie.runtime / 60)}h {movie.runtime % 60}m
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
              <a
                href={getFandangoUrl(movie.title)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 mb-4 bg-[var(--surface)] border border-orange-400/50 rounded-full text-sm font-semibold text-orange-400 hover:bg-orange-400/10 transition-colors"
              >
                <Ticket className="w-4 h-4" />
                Find Showtimes & Tickets
              </a>
            )}

            <UserMoviePanel
              tmdbId={movie.id}
              movieTitle={movie.title}
              posterPath={movie.poster_path}
              tmdbScore={communityScore}
            />
          </div>
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
        />
      </div>
    </div>
  );
}
