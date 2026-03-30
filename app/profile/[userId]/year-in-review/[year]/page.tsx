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
  params: Promise<{ userId: string; year: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { userId, year } = await params;
  const user = await prisma.user.findFirst({
    where: { OR: [{ id: userId }, { firebaseUid: userId }] },
    select: { name: true },
  });
  if (!user) return { title: "Year in Review" };
  const title = `${user.name}'s ${year} in Film`;
  const ogImageUrl = `${SITE_URL}/api/og/year-in-review?userId=${encodeURIComponent(userId)}&year=${year}`;
  return {
    title,
    openGraph: {
      title,
      images: [{ url: ogImageUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      images: [ogImageUrl],
    },
  };
}

export default async function YearInReviewPage({ params }: Props) {
  const { userId, year } = await params;

  const user = await prisma.user.findFirst({
    where: { OR: [{ id: userId }, { firebaseUid: userId }] },
    select: { id: true, name: true, avatarUrl: true, isPrivate: true },
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

  // All movies seen this year (by watchedDate)
  const seenThisYear = await prisma.userFavoriteMovie.findMany({
    where: {
      userId: user.id,
      OR: [
        { watchedDate: { gte: new Date(`${year}-01-01`), lt: new Date(`${Number(year) + 1}-01-01`) } },
        { AND: [{ watchedDate: null }, { createdAt: { gte: new Date(`${year}-01-01`), lt: new Date(`${Number(year) + 1}-01-01`) } }] },
      ],
    },
    include: {
      movie: {
        select: {
          tmdbId: true, title: true, posterPath: true, releaseDate: true,
          ratings: { where: { userId: user.id }, select: { ratistRating: true, storyScore: true, styleScore: true, emotiveScore: true, actingScore: true, entertainScore: true }, take: 1 },
        },
      },
    },
    orderBy: { watchedDate: "desc" },
  });

  if (seenThisYear.length === 0) notFound();

  const rated = seenThisYear.filter((m) => m.movie.ratings[0]?.ratistRating != null);
  const ratings = rated.map((m) => m.movie.ratings[0]!.ratistRating!);
  const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
  const topMovies = [...rated].sort((a, b) => (b.movie.ratings[0]?.ratistRating ?? 0) - (a.movie.ratings[0]?.ratistRating ?? 0)).slice(0, 10);
  const worstMovie = [...rated].sort((a, b) => (a.movie.ratings[0]?.ratistRating ?? 0) - (b.movie.ratings[0]?.ratistRating ?? 0))[0];

  const shareUrl = `${SITE_URL}/profile/${userId}/year-in-review/${year}`;
  const shareText = `My ${year} in Film: ${seenThisYear.length} movies watched${avgRating ? `, avg rating ${avgRating.toFixed(1)}` : ""}. Check out my year on The Ratist!`;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <Link
        href={`/profile/${userId}`}
        className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to profile
      </Link>

      {/* Hero */}
      <div className="bg-gradient-to-br from-[var(--surface)] to-[var(--surface-2)] border border-[var(--border)] rounded-2xl p-8 mb-8 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-[var(--ratist-red)]/5 pointer-events-none" />
        <div className="relative">
          <p className="text-[var(--ratist-red)] font-bold text-sm uppercase tracking-widest mb-2">{year} In Film</p>
          <h1 className="text-3xl sm:text-4xl font-black text-white mb-1">{user.name}</h1>
          <p className="text-[var(--foreground-muted)] text-sm mb-6">A year of movies, by the numbers</p>

          {/* Big stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="bg-black/20 rounded-xl p-4">
              <p className="text-3xl font-black text-white">{seenThisYear.length}</p>
              <p className="text-xs text-[var(--foreground-muted)] mt-1">Movies Watched</p>
            </div>
            <div className="bg-black/20 rounded-xl p-4">
              <p className="text-3xl font-black text-white">{rated.length}</p>
              <p className="text-xs text-[var(--foreground-muted)] mt-1">Rated</p>
            </div>
            {avgRating != null && (
              <div className="bg-black/20 rounded-xl p-4">
                <p className="text-3xl font-black" style={{ color: scoreColor(avgRating) }}>
                  {avgRating.toFixed(1)}
                </p>
                <p className="text-xs text-[var(--foreground-muted)] mt-1">Avg Rating</p>
              </div>
            )}
            {topMovies[0] && (
              <div className="bg-black/20 rounded-xl p-4">
                <p className="text-3xl font-black" style={{ color: scoreColor(topMovies[0].movie.ratings[0]?.ratistRating ?? 0) }}>
                  {(topMovies[0].movie.ratings[0]?.ratistRating ?? 0).toFixed(1)}
                </p>
                <p className="text-xs text-[var(--foreground-muted)] mt-1">Best Rating</p>
              </div>
            )}
          </div>

          <ShareButton
            label={`Share my ${year} in Film`}
            text={shareText}
            url={shareUrl}
          />
        </div>
      </div>

      {/* Top 10 */}
      {topMovies.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-bold text-white mb-4">Top Rated of {year}</h2>
          <div className="space-y-1">
            {topMovies.map((m, i) => {
              const r = m.movie.ratings[0]!.ratistRating!;
              return (
                <Link
                  key={m.movie.tmdbId}
                  href={`/movies/${m.movie.tmdbId}`}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--surface)] transition-colors group"
                >
                  <span className="text-sm font-bold text-[var(--foreground-muted)] w-6 text-right shrink-0">{i + 1}</span>
                  <div className="relative w-8 h-12 shrink-0 rounded overflow-hidden bg-[var(--surface-2)]">
                    {m.movie.posterPath && (
                      <Image src={posterUrl(m.movie.posterPath, "w92")} alt={m.movie.title} fill sizes="32px" className="object-cover" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white group-hover:text-[var(--ratist-red)] transition-colors line-clamp-1">{m.movie.title}</p>
                    <p className="text-xs text-[var(--foreground-muted)]">{m.movie.releaseDate?.slice(0, 4)}</p>
                  </div>
                  <span className="text-sm font-bold shrink-0" style={{ color: scoreColor(r) }}>{r.toFixed(1)}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Full poster grid */}
      <section className="mb-8">
        <h2 className="text-lg font-bold text-white mb-4">Everything Watched in {year}</h2>
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
          {seenThisYear.map((m) => (
            <Link key={m.movie.tmdbId} href={`/movies/${m.movie.tmdbId}`} className="group">
              <div className="relative aspect-[2/3] rounded overflow-hidden bg-[var(--surface-2)] border border-[var(--border)] group-hover:border-[var(--ratist-red)] transition-colors">
                {m.movie.posterPath ? (
                  <Image src={posterUrl(m.movie.posterPath, "w92")} alt={m.movie.title} fill sizes="80px" className="object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-[var(--foreground-muted)]">?</div>
                )}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Worst rated */}
      {worstMovie && worstMovie !== topMovies[0] && (
        <section className="mb-8 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3">The One That Disappointed</h3>
          <Link href={`/movies/${worstMovie.movie.tmdbId}`} className="flex items-center gap-3 group">
            <div className="relative w-10 h-14 shrink-0 rounded overflow-hidden bg-[var(--surface-2)]">
              {worstMovie.movie.posterPath && (
                <Image src={posterUrl(worstMovie.movie.posterPath, "w92")} alt={worstMovie.movie.title} fill sizes="40px" className="object-cover" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white group-hover:text-[var(--ratist-red)] transition-colors line-clamp-1">{worstMovie.movie.title}</p>
              <p className="text-xs text-[var(--foreground-muted)]">{worstMovie.movie.releaseDate?.slice(0, 4)}</p>
            </div>
            <span className="text-sm font-bold shrink-0" style={{ color: scoreColor(worstMovie.movie.ratings[0]?.ratistRating ?? 0) }}>
              {(worstMovie.movie.ratings[0]?.ratistRating ?? 0).toFixed(1)}
            </span>
          </Link>
        </section>
      )}

      {/* Footer CTA for non-members */}
      <div className="text-center py-6 border-t border-[var(--border)]">
        <p className="text-sm text-[var(--foreground-muted)] mb-3">Track and rate your own movies on The Ratist</p>
        <Link href="/auth/signup" className="inline-block bg-[var(--ratist-red)] text-white text-sm font-semibold px-6 py-2.5 rounded-full hover:bg-[var(--ratist-red)]/90 transition-colors">
          Join for free
        </Link>
      </div>
    </div>
  );
}
