import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Clock, Calendar } from "lucide-react";
import {
  getMovieDetails,
  getWatchProviders,
  getMovieRecommendations,
  getCollectionDetails,
  posterUrl,
  backdropUrl,
  getTrailerKey,
  getMpaaRating,
  type TMDBMovie,
  type TMDBCollection,
} from "@/lib/tmdb";
import UserMoviePanel from "@/components/UserMoviePanel";
import MovieDetailTabs from "@/components/MovieDetailTabs";
import { upsertMovie } from "@/lib/tmdb-sync";
import { prisma } from "@/lib/prisma";
import PageShare from "@/components/PageShare";
import AdUnit from "@/components/AdUnit";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const movie = await getMovieDetails(Number(id));
    const description = movie.overview?.slice(0, 160) ?? undefined;
    const imageUrl = movie.poster_path ? posterUrl(movie.poster_path, "w500") : undefined;
    return {
      title: movie.title,
      description,
      openGraph: {
        title: `${movie.title} — The Ratist`,
        description,
        type: "video.movie",
        ...(imageUrl ? { images: [{ url: imageUrl, width: 500, height: 750 }] } : {}),
      },
      twitter: {
        card: "summary_large_image",
        title: `${movie.title} — The Ratist`,
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

  const trailerKey = getTrailerKey(movie);
  const mpaaRating = getMpaaRating(movie);
  const communityScore = movie.vote_average > 0 ? movie.vote_average : null;
  const cast = movie.credits?.cast ?? [];
  const crew = movie.credits?.crew ?? [];
  const images = movie.images?.backdrops ?? [];

  return (
    <div>
      {/* Backdrop hero */}
      <div className="relative w-full h-[45vh] min-h-[300px] max-h-[500px] overflow-hidden">
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
        <div className="flex gap-6 -mt-24 relative z-10 mb-8">
          {/* Poster */}
          <div className="relative w-32 sm:w-44 lg:w-52 shrink-0 aspect-[2/3] rounded-lg overflow-hidden border-2 border-[var(--border)] shadow-2xl bg-[var(--surface-2)]">
            <Image
              src={posterUrl(movie.poster_path, "w342")}
              alt={movie.title}
              fill
              sizes="(max-width: 640px) 128px, (max-width: 1024px) 176px, 208px"
              className="object-cover"
            />
          </div>

          {/* Details */}
          <div className="flex-1 pt-24 sm:pt-28 lg:pt-32 min-w-0">
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
            </div>

            {/* Genres */}
            {movie.genres && movie.genres.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {movie.genres.map((g) => (
                  <Link
                    key={g.id}
                    href={`/movies?genre=${g.id}`}
                    className="text-xs px-3 py-1 rounded-full bg-[var(--surface-2)] border border-[var(--border)] text-[var(--foreground-muted)] hover:border-[var(--ratist-red)] hover:text-white transition-colors"
                  >
                    {g.name}
                  </Link>
                ))}
              </div>
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
                    <Link
                      key={part.id}
                      href={`/movies/${part.id}`}
                      className={`shrink-0 w-28 group ${isCurrent ? "opacity-100" : "opacity-70 hover:opacity-100"} transition-opacity`}
                    >
                      <div className={`relative aspect-[2/3] rounded-lg overflow-hidden bg-[var(--surface-2)] ${isCurrent ? "ring-2 ring-[var(--ratist-red)]" : "border border-[var(--border)]"}`}>
                        {part.poster_path ? (
                          <Image
                            src={posterUrl(part.poster_path, "w185")}
                            alt={part.title}
                            fill
                            sizes="112px"
                            className="object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs text-[var(--foreground-muted)] p-2 text-center">
                            {part.title}
                          </div>
                        )}
                        {isCurrent && (
                          <div className="absolute top-1.5 left-1.5 bg-[var(--ratist-red)] text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                            Current
                          </div>
                        )}
                        {part.vote_average > 0 && part.vote_average < 10 && (
                          <div className="absolute top-1.5 right-1.5 bg-black/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                            {part.vote_average.toFixed(1)}
                          </div>
                        )}
                      </div>
                      <p className="text-[11px] text-white mt-1.5 line-clamp-2 group-hover:text-[var(--ratist-red)] transition-colors">
                        {part.title}
                      </p>
                      <p className="text-[10px] text-[var(--foreground-muted)]">
                        {part.release_date?.slice(0, 4) ?? "TBA"}
                      </p>
                    </Link>
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
        />
      </div>
    </div>
  );
}
