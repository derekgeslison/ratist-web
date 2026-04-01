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
      images: [{ url: ogImageUrl, width: 800, height: 500 }],
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
      watchedDate: { gte: new Date(`${year}-01-01`), lt: new Date(`${Number(year) + 1}-01-01`) },
    },
    include: {
      movie: {
        select: {
          tmdbId: true, title: true, posterPath: true, releaseDate: true, runtime: true,
          genres: { include: { genre: true } },
          cast: { where: { job: "Director" }, include: { celebrity: { select: { name: true, tmdbId: true } } }, take: 3 },
          ratings: {
            where: { userId: user.id },
            select: { ratistRating: true, storyScore: true, styleScore: true, emotiveScore: true, actingScore: true, entertainScore: true },
            take: 1,
          },
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

  // Genre breakdown
  const genreCount = new Map<string, number>();
  for (const s of seenThisYear) {
    for (const mg of s.movie.genres) {
      genreCount.set(mg.genre.name, (genreCount.get(mg.genre.name) ?? 0) + 1);
    }
  }
  const topGenres = [...genreCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  // Category averages for rated movies this year
  const categoryLabels = [
    { key: "storyScore", label: "Story & Writing" },
    { key: "styleScore", label: "Style & Craft" },
    { key: "emotiveScore", label: "Emotion & Meaning" },
    { key: "actingScore", label: "Performance" },
    { key: "entertainScore", label: "Entertainment" },
  ];
  const categoryAvgs = categoryLabels.map(({ key, label }) => {
    const vals = rated
      .map((m) => (m.movie.ratings[0] as Record<string, number | null>)?.[key])
      .filter((v): v is number => v != null);
    const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    return { label, avg };
  }).filter((c) => c.avg != null) as { label: string; avg: number }[];

  // Highest single category score
  const bestCategory = categoryAvgs.length > 0 ? categoryAvgs.reduce((a, b) => (a.avg > b.avg ? a : b)) : null;

  // Total watch time
  const totalMinutes = seenThisYear.reduce((sum, m) => sum + (m.movie.runtime ?? 0), 0);
  const totalHours = Math.round(totalMinutes / 60);

  // Most-watched director
  const directorCount = new Map<string, { name: string; tmdbId: number; count: number }>();
  for (const s of seenThisYear) {
    for (const c of s.movie.cast) {
      const existing = directorCount.get(c.celebrity.name) ?? { name: c.celebrity.name, tmdbId: c.celebrity.tmdbId, count: 0 };
      existing.count++;
      directorCount.set(c.celebrity.name, existing);
    }
  }
  const topDirector = [...directorCount.values()].sort((a, b) => b.count - a.count)[0] ?? null;

  // Busiest month
  const monthCounts = new Array(12).fill(0);
  for (const s of seenThisYear) {
    const d = s.watchedDate ?? s.createdAt;
    if (d) monthCounts[new Date(d).getMonth()]++;
  }
  const busiestMonthIdx = monthCounts.indexOf(Math.max(...monthCounts));
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const busiestMonth = monthCounts[busiestMonthIdx] > 0 ? { name: monthNames[busiestMonthIdx], count: monthCounts[busiestMonthIdx] } : null;

  // Most controversial rating (biggest diff from community avg)
  let mostControversial: { title: string; tmdbId: number; userRating: number; diff: number } | null = null;
  if (rated.length > 0) {
    const movieIds = rated.map((m) => m.movieId);
    const communityAvgs = await prisma.movieRating.groupBy({
      by: ["movieId"],
      where: { movieId: { in: movieIds }, ratistRating: { not: null } },
      _avg: { ratistRating: true },
      _count: { ratistRating: true },
    });
    const avgMap = new Map(communityAvgs.filter((c) => (c._count.ratistRating ?? 0) >= 2).map((c) => [c.movieId, c._avg.ratistRating!]));
    for (const m of rated) {
      const userR = m.movie.ratings[0]?.ratistRating;
      const commAvg = avgMap.get(m.movieId);
      if (userR != null && commAvg != null) {
        const diff = Math.abs(userR - commAvg);
        if (!mostControversial || diff > mostControversial.diff) {
          mostControversial = { title: m.movie.title, tmdbId: m.movie.tmdbId, userRating: userR, diff };
        }
      }
    }
  }

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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="bg-black/20 rounded-xl p-4 text-center">
              <p className="text-3xl font-black text-white">{seenThisYear.length}</p>
              <p className="text-xs text-[var(--foreground-muted)] mt-1">Movies Watched</p>
            </div>
            <div className="bg-black/20 rounded-xl p-4 text-center">
              <p className="text-3xl font-black text-white">{rated.length}</p>
              <p className="text-xs text-[var(--foreground-muted)] mt-1">Rated</p>
            </div>
            {avgRating != null && (
              <div className="bg-black/20 rounded-xl p-4 text-center">
                <p className="text-3xl font-black" style={{ color: scoreColor(avgRating) }}>
                  {avgRating.toFixed(1)}
                </p>
                <p className="text-xs text-[var(--foreground-muted)] mt-1">Avg Rating</p>
              </div>
            )}
            {totalHours > 0 && (
              <div className="bg-black/20 rounded-xl p-4 text-center">
                <p className="text-3xl font-black text-white">{totalHours}</p>
                <p className="text-xs text-[var(--foreground-muted)] mt-1">Hours Watched</p>
              </div>
            )}
          </div>

          {/* Secondary stats */}
          <div className="flex flex-wrap justify-center gap-3 mb-6 text-center">
            {busiestMonth && (
              <div className="bg-black/20 rounded-lg px-4 py-2">
                <p className="text-sm font-bold text-white">{busiestMonth.name}</p>
                <p className="text-[10px] text-[var(--foreground-muted)]">Busiest month ({busiestMonth.count} movies)</p>
              </div>
            )}
            {topDirector && topDirector.count >= 2 && (
              <div className="bg-black/20 rounded-lg px-4 py-2">
                <p className="text-sm font-bold text-white">{topDirector.name}</p>
                <p className="text-[10px] text-[var(--foreground-muted)]">Most-watched director ({topDirector.count}x)</p>
              </div>
            )}
            {topGenres.length > 0 && (
              <div className="bg-black/20 rounded-lg px-4 py-2">
                <p className="text-sm font-bold text-[#eab308]">{topGenres[0][0]}</p>
                <p className="text-[10px] text-[var(--foreground-muted)]">Top genre ({topGenres[0][1]} movies)</p>
              </div>
            )}
          </div>

          <ShareButton
            label={`Share my ${year} in Film`}
            text={shareText}
            url={shareUrl}
            cardImageUrl={`/api/og/year-in-review?userId=${encodeURIComponent(userId)}&year=${year}`}
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

      {/* Category averages */}
      {categoryAvgs.length > 0 && (
        <section className="mb-8 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6">
          <h2 className="text-base font-semibold text-white mb-1">How You Rated in {year}</h2>
          <p className="text-xs text-[var(--foreground-muted)] mb-4">
            Your average scores across {rated.length} rated movies
            {bestCategory && <> — strongest in <span className="text-white font-medium">{bestCategory.label}</span></>}
          </p>
          <div className="space-y-2.5">
            {categoryAvgs.map(({ label, avg }) => (
              <div key={label} className="flex items-center gap-3">
                <span className="text-xs text-[var(--foreground-muted)] w-32 shrink-0">{label}</span>
                <div className="flex-1 h-2 bg-[var(--surface-2)] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${(avg / 10) * 100}%`, backgroundColor: avg >= 8 ? "#22c55e" : avg >= 6 ? "#eab308" : avg >= 4 ? "#f97316" : "#ef4444" }}
                  />
                </div>
                <span className="text-xs font-bold w-8 text-right" style={{ color: avg >= 8 ? "#22c55e" : avg >= 6 ? "#eab308" : avg >= 4 ? "#f97316" : "#ef4444" }}>
                  {avg.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Genre breakdown */}
      {topGenres.length > 0 && (
        <section className="mb-8 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6">
          <h2 className="text-base font-semibold text-white mb-4">Top Genres of {year}</h2>
          <div className="flex flex-wrap gap-2">
            {topGenres.map(([name, count]) => (
              <span
                key={name}
                className="text-xs px-3 py-1.5 rounded-full bg-[var(--surface-2)] border border-[var(--border)] text-[var(--foreground-muted)]"
              >
                {name} <span className="text-white font-semibold">{count}</span>
              </span>
            ))}
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

      {/* Most controversial rating */}
      {mostControversial && mostControversial.diff >= 2 && (
        <section className="mb-8 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-1">Your Most Controversial Take</h3>
          <p className="text-xs text-[var(--foreground-muted)] mb-3">
            Your rating differed from the community average by {mostControversial.diff.toFixed(1)} points
          </p>
          <Link href={`/movies/${mostControversial.tmdbId}`} className="text-sm text-[var(--ratist-red)] hover:underline">
            {mostControversial.title} — you gave it {mostControversial.userRating.toFixed(1)}
          </Link>
        </section>
      )}

      {/* Footer CTA for non-members */}
      <div className="text-center py-6 border-t border-[var(--border)]">
        <p className="text-sm text-[var(--foreground-muted)] mb-3">Track and rate your own movies on The Ratist</p>
        <Link href="/auth/signin" className="inline-block bg-[var(--ratist-red)] text-white text-sm font-semibold px-6 py-2.5 rounded-full hover:bg-[var(--ratist-red)]/90 transition-colors">
          Join for free
        </Link>
      </div>
    </div>
  );
}
