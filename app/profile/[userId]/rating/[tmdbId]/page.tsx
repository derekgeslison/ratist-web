import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { scoreColor } from "@/lib/ratings";
import { posterUrl } from "@/lib/tmdb";
import ShareButton from "@/components/ShareButton";

export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://theratist.com";

interface Props {
  params: Promise<{ userId: string; tmdbId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { userId, tmdbId } = await params;
  const user = await prisma.user.findFirst({
    where: { OR: [{ id: userId }, { firebaseUid: userId }] },
    select: { name: true },
  });
  const movie = await prisma.movie.findUnique({
    where: { tmdbId: Number(tmdbId) },
    select: { title: true },
  });
  if (!user || !movie) return { title: "Rating" };
  const rating = await prisma.movieRating.findFirst({
    where: { userId: user ? (await prisma.user.findFirst({ where: { OR: [{ id: userId }, { firebaseUid: userId }] }, select: { id: true } }))?.id ?? "" : "", movie: { tmdbId: Number(tmdbId) } },
    select: { ratistRating: true },
  });
  const score = rating?.ratistRating;
  const title = `${user.name} rated ${movie.title}${score != null ? ` — ${score.toFixed(1)}/10` : ""}`;
  const ogImageUrl = `${SITE_URL}/api/og/rating?userId=${encodeURIComponent(userId)}&tmdbId=${tmdbId}`;
  return {
    title,
    openGraph: {
      title,
      images: [{ url: ogImageUrl, width: 800, height: 500 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      images: [ogImageUrl],
    },
  };
}

export default async function PublicRatingPage({ params }: Props) {
  const { userId, tmdbId } = await params;

  const user = await prisma.user.findFirst({
    where: { OR: [{ id: userId }, { firebaseUid: userId }] },
    select: { id: true, name: true, avatarUrl: true, isPrivate: true, firebaseUid: true },
  });
  if (!user) notFound();
  if (user.isPrivate) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <p className="text-white font-semibold mb-2">This profile is private</p>
        <p className="text-[var(--foreground-muted)] text-sm">This user has set their profile to private.</p>
      </div>
    );
  }

  const [movie, rating] = await Promise.all([
    prisma.movie.findUnique({
      where: { tmdbId: Number(tmdbId) },
      select: { id: true, tmdbId: true, title: true, posterPath: true, releaseDate: true },
    }),
    prisma.movieRating.findFirst({
      where: { userId: user.id, movie: { tmdbId: Number(tmdbId) } },
      select: {
        ratistRating: true, overallRating: true,
        storyScore: true, styleScore: true, emotiveScore: true,
        actingScore: true, entertainScore: true,
        reviewText: true,
      },
    }),
  ]);

  if (!movie || !rating?.ratistRating) notFound();

  const shareUrl = `${SITE_URL}/profile/${userId}/rating/${tmdbId}`;
  const shareText = `${user.name} rated ${movie.title} ${rating.ratistRating.toFixed(1)}/10 on The Ratist.`;

  const categoryBars = [
    { label: "Story & Writing", score: rating.storyScore },
    { label: "Style & Craft", score: rating.styleScore },
    { label: "Emotion & Meaning", score: rating.emotiveScore },
    { label: "Performance", score: rating.actingScore },
    { label: "Entertainment", score: rating.entertainScore },
  ].filter((c) => c.score != null);

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <Link
        href={`/movies/${movie.tmdbId}`}
        className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to movie
      </Link>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start gap-5 p-6 border-b border-[var(--border)]">
          {movie.posterPath && (
            <div className="relative w-20 h-[120px] shrink-0 rounded-lg overflow-hidden">
              <Image src={posterUrl(movie.posterPath, "w185")} alt={movie.title} fill sizes="80px" className="object-cover" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <Link href={`/movies/${movie.tmdbId}`} className="text-lg font-bold text-white hover:text-[var(--ratist-red)] transition-colors">
              {movie.title}
            </Link>
            {movie.releaseDate && (
              <p className="text-sm text-[var(--foreground-muted)]">{movie.releaseDate.slice(0, 4)}</p>
            )}
            <div className="flex items-center gap-3 mt-3">
              <Link href={`/profile/${userId}`} className="flex items-center gap-2 group">
                <div className="relative w-7 h-7 rounded-full overflow-hidden bg-[var(--surface-2)] border border-[var(--border)]">
                  {user.avatarUrl ? (
                    <Image src={user.avatarUrl} alt="" fill sizes="28px" className="object-cover" unoptimized />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs font-bold text-white bg-[var(--ratist-red)]">
                      {user.name[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                <span className="text-sm text-[var(--foreground-muted)] group-hover:text-white transition-colors">{user.name}</span>
              </Link>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider mb-0.5">Ratist Score</p>
            <p className="text-4xl font-black" style={{ color: scoreColor(rating.ratistRating) }}>
              {rating.ratistRating.toFixed(1)}
            </p>
          </div>
        </div>

        {/* Category breakdown */}
        {categoryBars.length > 0 && (
          <div className="p-6 border-b border-[var(--border)]">
            <h3 className="text-sm font-semibold text-white mb-4">Score Breakdown</h3>
            <div className="space-y-3">
              {categoryBars.map(({ label, score }) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="text-xs text-[var(--foreground-muted)] w-36 shrink-0">{label}</span>
                  <div className="flex-1 h-2 bg-[var(--surface-2)] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${((score ?? 0) / 10) * 100}%`, backgroundColor: scoreColor(score ?? 0) }}
                    />
                  </div>
                  <span className="text-xs font-bold w-7 text-right" style={{ color: scoreColor(score ?? 0) }}>
                    {(score ?? 0).toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Review text */}
        {rating.reviewText && (
          <div className="p-6 border-b border-[var(--border)]">
            <p className="text-sm text-[var(--foreground-muted)] italic leading-relaxed">&ldquo;{rating.reviewText}&rdquo;</p>
          </div>
        )}

        {/* Footer */}
        <div className="p-6 flex items-center justify-between gap-4">
          <Link
            href={`/profile/${userId}`}
            className="text-sm text-[var(--ratist-red)] hover:underline"
          >
            See {user.name}&apos;s full profile →
          </Link>
          <div className="flex items-center gap-3">
            <Link href={`/movies/${tmdbId}/rate`} className="text-xs text-[var(--foreground-muted)] hover:text-white transition-colors">
              Rate this movie yourself →
            </Link>
            <ShareButton
              text={shareText}
              url={shareUrl}
              cardImageUrl={`/api/og/rating?userId=${encodeURIComponent(userId)}&tmdbId=${tmdbId}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
