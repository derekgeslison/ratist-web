import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Clock, Calendar } from "lucide-react";
import {
  getMovieDetails,
  getWatchProviders,
  getMovieRecommendations,
  posterUrl,
  backdropUrl,
  getTrailerKey,
  getMpaaRating,
  type TMDBMovie,
} from "@/lib/tmdb";
import UserMoviePanel from "@/components/UserMoviePanel";
import MovieDetailTabs from "@/components/MovieDetailTabs";
import { upsertMovie } from "@/lib/tmdb-sync";
import { prisma } from "@/lib/prisma";
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

  // Parallel fetch: watch providers + recommendations (non-blocking)
  const [watchProviders, recommendations] = await Promise.all([
    getWatchProviders(movie.id).catch(() => null),
    getMovieRecommendations(movie.id).catch(() => ({ results: [] })),
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
    user: { id: string; name: string; avatarUrl: string | null };
    createdAt: Date;
    _count: { likes: number };
  }[] = [];
  try {
    const dbMovie = await prisma.movie.findUnique({
      where: { tmdbId: movie.id },
      select: { id: true },
    });
    if (dbMovie) {
      reviews = await prisma.movieRating.findMany({
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
          createdAt: true,
          user: { select: { id: true, name: true, avatarUrl: true } },
          _count: { select: { likes: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }) as typeof reviews;
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
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white leading-tight mb-1">
              {movie.title}
            </h1>
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

        {/* Ad — between movie panel and tabs */}
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
            likeCount: r._count.likes,
            user: r.user,
            createdAt: r.createdAt.toISOString(),
          }))}
        />
      </div>
    </div>
  );
}
