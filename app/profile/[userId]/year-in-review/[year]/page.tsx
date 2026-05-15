import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import SignInLink from "@/components/SignInLink";
import { ArrowLeft, Star, TrendingUp, TrendingDown, Minus, Calendar, Flame, Award, Eye, Lock, Users, Sparkles, Heart, Clock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { adminAuth } from "@/lib/firebase-admin";
import { scoreColor } from "@/lib/score-color";
import { posterUrl } from "@/lib/tmdb";
import ShareButton from "@/components/ShareButton";
import OwnerOnly from "@/components/OwnerOnly";
import { getYearInReview } from "@/lib/year-in-review/data";
import { isYearInReviewUnlocked, unlockTeaser } from "@/lib/year-in-review/lock";

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
    openGraph: { title, images: [{ url: ogImageUrl, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, images: [ogImageUrl] },
  };
}

export default async function YearInReviewPage({ params }: Props) {
  const { userId, year: yearStr } = await params;
  const year = parseInt(yearStr, 10);
  if (!Number.isFinite(year)) notFound();

  const userRow = await prisma.user.findFirst({
    where: { OR: [{ id: userId }, { firebaseUid: userId }] },
    select: { id: true, isPrivate: true },
  });
  if (!userRow) notFound();
  if (userRow.isPrivate) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <p className="text-white font-semibold mb-2">This profile is private</p>
        <p className="text-[var(--foreground-muted)] text-sm">This user has set their profile to private.</p>
      </div>
    );
  }

  // Resolve the current viewer's admin flag from the auth cookie.
  // Admins bypass the Dec 1 lock so we can test and refine YiR
  // throughout the year. Anonymous / non-admin viewers are subject
  // to the lock.
  let viewerIsAdmin = false;
  try {
    const token = (await cookies()).get("__session")?.value;
    if (token) {
      const decoded = await adminAuth.verifyIdToken(token);
      const viewer = await prisma.user.findUnique({
        where: { firebaseUid: decoded.uid },
        select: { isAdmin: true },
      });
      viewerIsAdmin = viewer?.isAdmin === true;
    }
  } catch { /* invalid token = anonymous, no admin bypass */ }

  if (!isYearInReviewUnlocked(year, viewerIsAdmin)) {
    return (
      <div className="max-w-lg mx-auto px-4 py-24 text-center">
        <Lock className="w-10 h-10 text-[var(--ratist-red)] mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">{year} in Film unlocks {unlockTeaser(year)}</h1>
        <p className="text-sm text-[var(--foreground-muted)] mb-6">
          Year in Review goes live on December 1. Keep watching and rating — every entry counts toward your recap.
        </p>
        <Link href="/seen" className="inline-block text-sm text-[var(--ratist-red)] hover:underline">
          ← Back to your diary
        </Link>
      </div>
    );
  }

  const data = await getYearInReview(userRow.id, year);
  if (!data) notFound();

  const { user } = data;
  const shareUrl = `${SITE_URL}/profile/${userId}/year-in-review/${year}`;
  const shareText = `My ${year} in Film — ${data.cinephile.archetype}. ${data.movieCount} movies, ${data.showCount} shows, ${data.totalHours} hours${data.avgRating != null ? `, avg rating ${data.avgRating.toFixed(1)}` : ""}.`;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
      <Link
        href={`/profile/${userId}`}
        className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to profile
      </Link>

      {/* ============ CHAPTER 1 / SHARE: COVER ============ */}
      <section className="relative overflow-hidden rounded-3xl mb-10 bg-gradient-to-br from-[var(--ratist-red)]/30 via-[var(--surface)] to-[var(--surface-2)] border border-[var(--border)]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--ratist-red)_0%,_transparent_60%)] opacity-15 pointer-events-none" />
        <div className="relative p-6 sm:p-10 text-center">
          <p className="text-[var(--ratist-red)] font-bold text-xs uppercase tracking-[0.3em] mb-2">{user.name}&apos;s</p>
          <h1 className="text-7xl sm:text-9xl font-black text-white leading-none tracking-tight">{year}</h1>
          <p className="text-2xl sm:text-3xl font-bold text-white mt-1 mb-6">in Film</p>

          {/* Archetype as the hook */}
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--foreground-muted)] mt-2 mb-1">You were</p>
          <p className="text-3xl sm:text-5xl font-black text-white leading-tight">{data.cinephile.archetype}</p>
          <p className="text-sm sm:text-base text-[var(--foreground-muted)] mt-3 max-w-2xl mx-auto">{data.cinephile.tagline}</p>

          {/* Big stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8">
            <StatTile big value={data.movieCount} label="Movies" />
            <StatTile big value={data.showCount} label={data.showCount === 1 ? "Show" : "Shows"} />
            <StatTile big value={data.totalHours} label="Hours" />
            {data.avgRating != null
              ? <StatTile big value={data.avgRating.toFixed(1)} label="Avg Rating" color={scoreColor(data.avgRating)} />
              : <StatTile big value="—" label="Avg Rating" />}
          </div>

          {/* Secondary pills */}
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            {data.episodeCount > 0 && (
              <Pill icon={<Eye className="w-3 h-3" />} text={`${data.episodeCount} episodes`} />
            )}
            {data.topGenres[0] && (
              <Pill icon={<Flame className="w-3 h-3 text-amber-400" />} text={`${data.topGenres[0].name} · ${data.topGenres[0].count}`} />
            )}
            {data.busiestMonth && (
              <Pill icon={<Calendar className="w-3 h-3" />} text={`Busiest: ${data.busiestMonth.name}`} />
            )}
            {data.avgPerMonth != null && (
              <Pill icon={<Clock className="w-3 h-3" />} text={`${data.avgPerMonth}/mo pace`} />
            )}
          </div>

          <div className="mt-6">
            <OwnerOnly ownerFirebaseUid={user.firebaseUid}>
              <ShareButton
                label={`Share my ${year}`}
                text={shareText}
                url={shareUrl}
                cardImageUrl={`/api/og/year-in-review?userId=${encodeURIComponent(userId)}&year=${year}`}
              />
            </OwnerOnly>
          </div>
        </div>
      </section>

      {/* ============ CHAPTER 2 / SHARE: TOP RATED ============ */}
      {data.topPicks.length > 0 && (
        <section className="mb-10 rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-6 sm:p-8">
          <div className="flex items-start justify-between mb-5 gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--ratist-red)] mb-1">Chapter 2</p>
              <h2 className="text-2xl sm:text-3xl font-black text-white">My {year} Standouts</h2>
            </div>
            <OwnerOnly ownerFirebaseUid={user.firebaseUid}>
              <ShareButton
                label="Share"
                text={`My top rated films of ${year} on The Ratist: ${data.topPicks.map((p) => p.title).join(", ")}`}
                url={shareUrl}
                cardImageUrl={`/api/og/year-in-review/top-rated?userId=${encodeURIComponent(userId)}&year=${year}`}
              />
            </OwnerOnly>
          </div>
          <div className="space-y-2 mb-6">
            {data.topPicks.map((pick, i) => (
              <Link
                key={`${pick.mediaType}-${pick.tmdbId}`}
                href={pick.mediaType === "tv" ? `/shows/${pick.tmdbId}` : `/movies/${pick.tmdbId}`}
                className="flex items-center gap-4 p-3 rounded-xl hover:bg-[var(--surface-2)] border border-transparent hover:border-[var(--border)] transition-colors group"
              >
                <span className="text-3xl font-black text-[var(--foreground-muted)] w-8 text-center shrink-0">{i + 1}</span>
                <div className="relative w-12 h-18 sm:w-16 sm:h-24 shrink-0 rounded-lg overflow-hidden bg-[var(--surface-2)] border border-[var(--border)]">
                  {pick.posterPath && (
                    <Image src={posterUrl(pick.posterPath, "w185")} alt={pick.title} fill sizes="64px" className="object-cover" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base sm:text-lg font-bold text-white group-hover:text-[var(--ratist-red)] transition-colors line-clamp-1">{pick.title}</p>
                  <p className="text-xs text-[var(--foreground-muted)]">
                    {pick.releaseYear}
                    {pick.mediaType === "tv" && <span className="ml-2 text-[10px] uppercase tracking-wider bg-[var(--surface-2)] px-1.5 py-0.5 rounded">Show</span>}
                  </p>
                </div>
                <p className="text-2xl sm:text-3xl font-black shrink-0" style={{ color: scoreColor(pick.rating) }}>{pick.rating.toFixed(1)}</p>
              </Link>
            ))}
          </div>

          {/* Hidden Gem + Disappointed sidekicks */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-4 border-t border-[var(--border)]">
            {data.hiddenGem ? (
              <MiniItemCard
                label="Hidden Gem"
                sublabel={`Only ${data.hiddenGem.communityCount} community review${data.hiddenGem.communityCount === 1 ? "" : "s"}`}
                tone="emerald"
                take={data.hiddenGem}
              />
            ) : <Placeholder>No hidden gem this year — your top picks already get plenty of community love.</Placeholder>}
            {data.disappointed ? (
              <SimpleItemCard
                label="One That Disappointed"
                tmdbId={data.disappointed.tmdbId}
                title={data.disappointed.title}
                posterPath={data.disappointed.posterPath}
                releaseYear={data.disappointed.releaseYear}
                rating={data.disappointed.rating}
                mediaType={data.disappointed.mediaType}
              />
            ) : <Placeholder>No disappointments — you only watched things you knew you&apos;d like.</Placeholder>}
          </div>
        </section>
      )}

      {/* ============ CHAPTER 3 / SHARE: YOUR TASTE ============ */}
      <section className="mb-10 rounded-3xl bg-gradient-to-br from-[var(--surface)] to-black/40 border border-[var(--border)] p-6 sm:p-8">
        <div className="flex items-start justify-between mb-5 gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--ratist-red)] mb-1">Chapter 3</p>
            <h2 className="text-2xl sm:text-3xl font-black text-white">Your Taste in {year}</h2>
          </div>
          <OwnerOnly ownerFirebaseUid={user.firebaseUid}>
            <ShareButton
              label="Share"
              text={`My ${year} taste on The Ratist — ${data.cinephile.archetype}. ${data.cinephile.tagline}`}
              url={shareUrl}
              cardImageUrl={`/api/og/year-in-review/taste?userId=${encodeURIComponent(userId)}&year=${year}`}
            />
          </OwnerOnly>
        </div>

        {/* Cinephile type recap */}
        <div className="bg-black/30 rounded-2xl p-5 mb-5">
          <p className="text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-1.5">Your type</p>
          <p className="text-2xl sm:text-3xl font-black text-white">{data.cinephile.archetype}</p>
          <p className="text-sm text-[var(--foreground-muted)] mt-2">{data.cinephile.tagline}</p>
        </div>

        {/* Category breakdown */}
        {data.categoryAvgs.length > 0 && (
          <div className="mb-5">
            <div className="flex items-baseline justify-between mb-3">
              <p className="text-sm font-semibold text-white">How you rated each axis</p>
              {data.bestCategory && (
                <p className="text-[11px] text-[var(--foreground-muted)]">
                  Strongest in <span className="text-white font-medium">{data.bestCategory.label}</span>
                </p>
              )}
            </div>
            <div className="space-y-2">
              {data.categoryAvgs.map(({ label, avg }) => {
                const isBest = data.bestCategory?.label === label;
                const isWorst = data.worstCategory?.label === label && data.bestCategory?.label !== label;
                return (
                  <div key={label} className="flex items-center gap-3">
                    <span className={`text-xs w-36 shrink-0 ${isBest ? "text-emerald-400 font-semibold" : isWorst ? "text-red-400 font-semibold" : "text-[var(--foreground-muted)]"}`}>{label}</span>
                    <div className="flex-1 h-2 bg-black/40 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${(avg / 10) * 100}%`, backgroundColor: scoreColor(avg) }} />
                    </div>
                    <span className="text-xs font-bold w-8 text-right" style={{ color: scoreColor(avg) }}>{avg.toFixed(1)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Top genres + Decade in a 2-up */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
          {data.topGenres.length > 0 && (
            <div className="bg-black/30 rounded-2xl p-4">
              <p className="text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-3">Top Genres</p>
              <div className="space-y-1.5">
                {data.topGenres.slice(0, 5).map(({ name, count }) => (
                  <div key={name} className="flex items-center justify-between text-sm">
                    <span className="text-white">{name}</span>
                    <span className="text-[var(--foreground-muted)] text-xs">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {data.decades.length > 0 && (
            <div className="bg-black/30 rounded-2xl p-4">
              <p className="text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-3">By Decade</p>
              <DecadeBars decades={data.decades} />
            </div>
          )}
        </div>

        {/* Taste metrics row */}
        <div className="grid grid-cols-2 gap-3">
          {data.avgMovieAge != null && (
            <div className="bg-black/30 rounded-xl p-4">
              <p className="text-2xl font-black text-white">{data.avgMovieAge}<span className="text-base"> yrs</span></p>
              <p className="text-[11px] uppercase tracking-widest text-[var(--foreground-muted)] mt-1">Avg Movie Age</p>
            </div>
          )}
          {data.guiltyPleasure && (
            <div className="bg-black/30 rounded-xl p-4">
              <p className="text-base font-black text-amber-400 truncate">{data.guiltyPleasure.name}</p>
              <p className="text-[11px] uppercase tracking-widest text-[var(--foreground-muted)] mt-1">
                Guilty Pleasure · you watch a lot, rate it {data.guiltyPleasure.avg.toFixed(1)}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ============ CHAPTER 4 / SHARE: HOW MY YEAR WAS DEFINED ============ */}
      {(data.topPeople.length > 0 || data.topActors.length > 0 || data.tasteTwin || data.topMonths.length > 0) && (
        <section className="mb-10 rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-6 sm:p-8">
          <div className="flex items-start justify-between mb-5 gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--ratist-red)] mb-1">Chapter 4</p>
              <h2 className="text-2xl sm:text-3xl font-black text-white">How My {year} Was Defined</h2>
            </div>
            <OwnerOnly ownerFirebaseUid={user.firebaseUid}>
              <ShareButton
                label="Share"
                text={`How my ${year} was defined — actors, watching pace, and a friend whose taste matches mine. On The Ratist.`}
                url={shareUrl}
                cardImageUrl={`/api/og/year-in-review/people?userId=${encodeURIComponent(userId)}&year=${year}`}
              />
            </OwnerOnly>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Top Actors */}
            {data.topActors.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-3">Top Actors</p>
                <div className="space-y-2">
                  {data.topActors.slice(0, 5).map((a) => (
                    <Link
                      key={a.tmdbId}
                      href={`/celebrities/${a.tmdbId}`}
                      className="flex items-center justify-between p-3 rounded-xl bg-black/30 hover:bg-black/50 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
                        <span className="text-sm font-semibold text-white truncate">{a.name}</span>
                      </div>
                      <span className="text-xs text-[var(--foreground-muted)] shrink-0">{a.count}× appearance{a.count === 1 ? "" : "s"}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Slot 3: Top Months bar chart when ≥3 months have activity,
                else fall back to Directors & Creators list. A 1- or
                2-month "Top 3" chart isn't really a chart. */}
            {data.topMonths.length >= 3 ? (
              <div>
                <p className="text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-3">Top Months</p>
                <div className="space-y-2.5 bg-black/30 rounded-2xl p-4">
                  <MonthBars months={data.topMonths} />
                </div>
              </div>
            ) : data.topPeople.length > 0 ? (
              <div>
                <p className="text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-3">Directors & Creators</p>
                <div className="space-y-2">
                  {data.topPeople.map((p) => (
                    <Link
                      key={`${p.role}-${p.tmdbId}`}
                      href={`/celebrities/${p.tmdbId}`}
                      className="flex items-center justify-between p-3 rounded-xl bg-black/30 hover:bg-black/50 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Award className="w-4 h-4 text-amber-400 shrink-0" />
                        <span className="text-sm font-semibold text-white truncate">{p.name}</span>
                      </div>
                      <span className="text-xs text-[var(--foreground-muted)] shrink-0">
                        {p.count}× {p.role === "director" ? "dir." : "creator"}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {data.tasteTwin && (
            <Link
              href={`/profile/${data.tasteTwin.firebaseUid}`}
              className="mt-5 flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-[var(--ratist-red)]/10 via-transparent to-transparent border border-[var(--ratist-red)]/30 hover:border-[var(--ratist-red)]/60 transition-colors group"
            >
              {data.tasteTwin.avatarUrl ? (
                <Image src={data.tasteTwin.avatarUrl} alt={data.tasteTwin.name} width={48} height={48} className="rounded-full" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-[var(--ratist-red)] flex items-center justify-center text-white font-black text-lg">
                  {data.tasteTwin.name[0]?.toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs uppercase tracking-widest text-[var(--foreground-muted)]">Taste Twin (among the people you follow)</p>
                <p className="text-base font-bold text-white group-hover:text-[var(--ratist-red)] transition-colors">{data.tasteTwin.name}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-2xl font-black text-emerald-400">{data.tasteTwin.similarity}%</p>
                <p className="text-[10px] uppercase tracking-widest text-[var(--foreground-muted)]">match</p>
              </div>
            </Link>
          )}
        </section>
      )}

      {/* ============ CHAPTER 5 / SHARE: THE DRAMA ============ */}
      {(data.controversial || data.vsLastYear) && (
        <section className="mb-10 rounded-3xl bg-gradient-to-br from-amber-500/10 via-[var(--surface)] to-[var(--surface-2)] border border-amber-500/20 p-6 sm:p-8">
          <div className="flex items-start justify-between mb-5 gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-amber-400 mb-1">Chapter 5</p>
              <h2 className="text-2xl sm:text-3xl font-black text-white">Where You Stood</h2>
            </div>
            <OwnerOnly ownerFirebaseUid={user.firebaseUid}>
              <ShareButton
                label="Share"
                text={data.controversial
                  ? `My most controversial ${year} take on The Ratist: ${data.controversial.title} — I gave it ${data.controversial.userRating.toFixed(1)}, community said ${data.controversial.communityAvg.toFixed(1)}.`
                  : `How my ${year} compares to last year on The Ratist.`}
                url={shareUrl}
                cardImageUrl={`/api/og/year-in-review/drama?userId=${encodeURIComponent(userId)}&year=${year}`}
              />
            </OwnerOnly>
          </div>

          {/* Top row: Controversial Take (left) + per-movie bars (right) */}
          {data.controversial && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
              {/* LEFT: Controversial Take */}
              <div className="bg-black/30 rounded-2xl p-5">
                <p className="text-[10px] uppercase tracking-[0.3em] text-amber-400 mb-3">Most Controversial Take</p>
                <div className="flex items-stretch gap-4">
                  <Link
                    href={data.controversial.mediaType === "tv" ? `/shows/${data.controversial.tmdbId}` : `/movies/${data.controversial.tmdbId}`}
                    className="relative w-24 h-36 shrink-0 rounded-xl overflow-hidden bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--ratist-red)] transition-colors"
                  >
                    {data.controversial.posterPath && (
                      <Image src={posterUrl(data.controversial.posterPath, "w342")} alt={data.controversial.title} fill sizes="96px" className="object-cover" />
                    )}
                  </Link>
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <Link
                      href={data.controversial.mediaType === "tv" ? `/shows/${data.controversial.tmdbId}` : `/movies/${data.controversial.tmdbId}`}
                      className="text-base font-bold text-white hover:text-[var(--ratist-red)] transition-colors line-clamp-2 mb-3"
                    >
                      {data.controversial.title}
                    </Link>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-black/40 rounded-lg p-2 flex flex-col items-center">
                        <div className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-[var(--foreground-muted)]">
                          <Star className="w-3 h-3" /> Community
                        </div>
                        <span className="text-xl font-black mt-0.5" style={{ color: scoreColor(data.controversial.communityAvg) }}>
                          {data.controversial.communityAvg.toFixed(1)}
                        </span>
                      </div>
                      <div className="bg-black/40 rounded-lg p-2 flex flex-col items-center">
                        <div className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-[var(--foreground-muted)]">
                          <RBadge size={10} /> You
                        </div>
                        <span className="text-xl font-black mt-0.5" style={{ color: scoreColor(data.controversial.userRating) }}>
                          {data.controversial.userRating.toFixed(1)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-center gap-2 mt-2 bg-amber-500/10 rounded-lg py-1.5">
                      <span className="text-[10px] uppercase tracking-widest text-amber-400">Off by</span>
                      <span className="text-base font-black text-white">{data.controversial.diff.toFixed(1)} pts</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT: per-movie category bars */}
              {data.controversialCategories && data.controversialCategories.scores.length > 0 ? (
                <div className="bg-black/30 rounded-2xl p-5">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-amber-400 mb-1">
                    {data.controversialCategories.isUserScored ? "Your scores for this title" : "Community averages for this title"}
                  </p>
                  {!data.controversialCategories.isUserScored && (
                    <p className="text-[10px] text-[var(--foreground-muted)] mb-3 italic">
                      You did a quick rating — showing the community&apos;s per-category averages instead.
                    </p>
                  )}
                  <div className="space-y-2.5 mt-3">
                    {data.controversialCategories.scores.map(({ label, avg }) => (
                      <div key={label} className="flex items-center gap-3">
                        <span className="text-xs text-[var(--foreground-muted)] w-36 shrink-0">{label}</span>
                        <div className="flex-1 h-2 bg-black/40 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${(avg / 10) * 100}%`, backgroundColor: scoreColor(avg) }} />
                        </div>
                        <span className="text-xs font-bold w-8 text-right" style={{ color: scoreColor(avg) }}>{avg.toFixed(1)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bg-black/20 rounded-2xl p-5 flex items-center justify-center border border-dashed border-[var(--border)]">
                  <p className="text-xs text-[var(--foreground-muted)] italic text-center">
                    No category breakdown available for this title.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Most-Shared Opinion — calm counterpart */}
          {data.mostShared && (
            <div className="bg-black/30 rounded-2xl p-4 flex items-center gap-4 mb-5">
              <Heart className="w-5 h-5 text-blue-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-widest text-[var(--foreground-muted)] mb-0.5">Most Agreed-On Take</p>
                <Link
                  href={data.mostShared.mediaType === "tv" ? `/shows/${data.mostShared.tmdbId}` : `/movies/${data.mostShared.tmdbId}`}
                  className="text-sm font-bold text-white hover:text-[var(--ratist-red)] transition-colors line-clamp-1"
                >
                  {data.mostShared.title}
                </Link>
                <p className="text-[11px] text-[var(--foreground-muted)] mt-0.5">
                  You and the community agreed within {data.mostShared.diff.toFixed(1)} points (you: {data.mostShared.userRating.toFixed(1)}, them: {data.mostShared.communityAvg.toFixed(1)})
                </p>
              </div>
            </div>
          )}

          {/* vs Last Year — closing thought */}
          {data.vsLastYear && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--foreground-muted)] mb-3">How {year} compares to {data.vsLastYear.year}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <DeltaTile delta={data.vsLastYear.movieDelta} label="Movies" />
                <DeltaTile delta={data.vsLastYear.showDelta} label="Shows" />
                <DeltaTile delta={data.vsLastYear.hoursDelta} label="Hours" />
                <DeltaTile delta={data.vsLastYear.avgRatingDelta} label="Avg Rating" decimal />
              </div>
            </div>
          )}
        </section>
      )}

      {/* ============ IN-PAGE DELIGHT (no share) ============ */}

      {/* Streak + Discovery rate */}
      {(data.longestStreak || data.discoveryRate) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          {data.longestStreak && (
            <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-5">
              <p className="text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-2">Longest Streak</p>
              <p className="text-3xl font-black text-white">{data.longestStreak.days} days</p>
              <p className="text-xs text-[var(--foreground-muted)] mt-1">
                {formatDate(data.longestStreak.startDate)} → {formatDate(data.longestStreak.endDate)}
              </p>
            </div>
          )}
          {data.discoveryRate && (
            <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-5">
              <p className="text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-2">Discovery vs Rewatch</p>
              <div className="flex items-end gap-3">
                <p className="text-3xl font-black text-white">{data.discoveryRate.firstWatches}</p>
                <p className="text-sm text-[var(--foreground-muted)] mb-1">first watches</p>
                <p className="text-base font-bold text-[var(--foreground-muted)] mb-1">·</p>
                <p className="text-xl font-bold text-[var(--foreground-muted)] mb-0.5">{data.discoveryRate.rewatches}</p>
                <p className="text-sm text-[var(--foreground-muted)] mb-1">rewatches</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Poster wall */}
      <section className="mb-8">
        <h3 className="text-base font-bold text-white mb-4">Everything Watched in {year}</h3>
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
          {data.posterWall.map((p) => (
            <Link
              key={`${p.mediaType}-${p.tmdbId}`}
              href={p.mediaType === "tv" ? `/shows/${p.tmdbId}` : `/movies/${p.tmdbId}`}
              className="group"
            >
              <div className="relative aspect-[2/3] rounded overflow-hidden bg-[var(--surface-2)] border border-[var(--border)] group-hover:border-[var(--ratist-red)] transition-colors">
                {p.posterPath
                  ? <Image src={posterUrl(p.posterPath, "w92")} alt={p.title} fill sizes="80px" className="object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-xs text-[var(--foreground-muted)]">?</div>}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Updated-as-of footer */}
      <p className="text-center text-xs text-[var(--foreground-muted)] mb-6">
        Updated as of {formatDate(data.updatedAt.toISOString().slice(0, 10))} ·
        {" "}live page — keeps updating as you watch and rate
      </p>

      {/* CTA */}
      <div className="text-center py-6 border-t border-[var(--border)]">
        <p className="text-sm text-[var(--foreground-muted)] mb-3">Track and rate your own movies on The Ratist</p>
        <SignInLink className="inline-block bg-[var(--ratist-red)] text-white text-sm font-semibold px-6 py-2.5 rounded-full hover:bg-[var(--ratist-red)]/90 transition-colors">
          Join for free
        </SignInLink>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────

function StatTile({ value, label, color, big }: { value: number | string; label: string; color?: string; big?: boolean }) {
  return (
    <div className="bg-black/30 rounded-2xl p-3 sm:p-4">
      <p
        className={big ? "text-3xl sm:text-5xl font-black leading-none" : "text-2xl font-black"}
        style={{ color: color ?? "white" }}
      >
        {value}
      </p>
      <p className="text-[10px] sm:text-xs uppercase tracking-widest text-[var(--foreground-muted)] mt-1.5">{label}</p>
    </div>
  );
}

function Pill({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 bg-black/30 border border-[var(--border)] rounded-full px-3 py-1 text-xs text-white">
      {icon}
      {text}
    </span>
  );
}

function ScoreBlock({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="flex flex-col items-center justify-center">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-[var(--foreground-muted)]">
        {icon} {label}
      </div>
      <p className="text-4xl sm:text-5xl font-black mt-1" style={{ color }}>{value}</p>
    </div>
  );
}

function RBadge({ size = 16 }: { size?: number }) {
  return (
    <Image src="/logo.png" alt="R" width={size} height={size} className="inline-block opacity-90" style={{ width: size, height: size }} />
  );
}

function DeltaTile({ delta, label, decimal, big }: { delta: number | null; label: string; decimal?: boolean; big?: boolean }) {
  const numClass = big ? "text-4xl sm:text-5xl" : "text-2xl";
  const padding = big ? "p-5 sm:p-6" : "p-4";
  const labelClass = big ? "text-xs" : "text-[10px]";
  if (delta == null) {
    return (
      <div className={`bg-black/40 rounded-2xl ${padding} text-center`}>
        <p className={`${numClass} font-black text-[var(--foreground-muted)] leading-none`}>—</p>
        <p className={`${labelClass} uppercase tracking-widest text-[var(--foreground-muted)] mt-2`}>{label}</p>
      </div>
    );
  }
  const formatted = decimal ? Math.abs(delta).toFixed(1) : Math.abs(delta).toString();
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const color = delta > 0 ? "#22c55e" : delta < 0 ? "#ef4444" : "var(--foreground-muted)";
  return (
    <div className={`bg-black/40 rounded-2xl ${padding} text-center`}>
      <div className="flex items-center justify-center gap-1.5" style={{ color }}>
        <Icon className={big ? "w-6 h-6 sm:w-7 sm:h-7" : "w-5 h-5"} />
        <p className={`${numClass} font-black leading-none`}>{delta > 0 ? "+" : delta < 0 ? "−" : ""}{formatted}</p>
      </div>
      <p className={`${labelClass} uppercase tracking-widest text-[var(--foreground-muted)] mt-2`}>{label}</p>
    </div>
  );
}

function MiniItemCard({ label, sublabel, tone, take }: {
  label: string;
  sublabel: string;
  tone: "emerald" | "blue";
  take: { tmdbId: number; title: string; posterPath: string | null; mediaType: "movie" | "tv"; userRating: number; communityAvg: number };
}) {
  const accent = tone === "emerald" ? "border-emerald-500/30" : "border-blue-500/30";
  return (
    <div className={`rounded-2xl bg-black/30 border ${accent} p-4`}>
      <p className="text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-1">{label}</p>
      <p className="text-[11px] text-[var(--foreground-muted)] mb-3">{sublabel}</p>
      <Link
        href={take.mediaType === "tv" ? `/shows/${take.tmdbId}` : `/movies/${take.tmdbId}`}
        className="flex items-center gap-3 group"
      >
        <div className="relative w-10 h-14 shrink-0 rounded overflow-hidden bg-[var(--surface-2)] border border-[var(--border)]">
          {take.posterPath && (
            <Image src={posterUrl(take.posterPath, "w92")} alt={take.title} fill sizes="40px" className="object-cover" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white group-hover:text-[var(--ratist-red)] transition-colors line-clamp-1">{take.title}</p>
          <div className="flex items-center gap-3 mt-1 text-[11px]">
            <span className="flex items-center gap-1"><Star className="w-3 h-3" style={{ color: scoreColor(take.communityAvg) }} /><span style={{ color: scoreColor(take.communityAvg) }}>{take.communityAvg.toFixed(1)}</span></span>
            <span className="flex items-center gap-1"><RBadge /><span style={{ color: scoreColor(take.userRating) }}>{take.userRating.toFixed(1)}</span></span>
          </div>
        </div>
      </Link>
    </div>
  );
}

function SimpleItemCard({ label, tmdbId, title, posterPath, releaseYear, rating, mediaType }: {
  label: string; tmdbId: number; title: string; posterPath: string | null;
  releaseYear: string | null; rating: number; mediaType: "movie" | "tv";
}) {
  return (
    <div className="rounded-2xl bg-black/30 border border-[var(--border)] p-4">
      <p className="text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-3">{label}</p>
      <Link
        href={mediaType === "tv" ? `/shows/${tmdbId}` : `/movies/${tmdbId}`}
        className="flex items-center gap-3 group"
      >
        <div className="relative w-10 h-14 shrink-0 rounded overflow-hidden bg-[var(--surface-2)] border border-[var(--border)]">
          {posterPath && (
            <Image src={posterUrl(posterPath, "w92")} alt={title} fill sizes="40px" className="object-cover" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white group-hover:text-[var(--ratist-red)] transition-colors line-clamp-1">{title}</p>
          <p className="text-[11px] text-[var(--foreground-muted)]">{releaseYear}</p>
        </div>
        <span className="text-sm font-bold shrink-0" style={{ color: scoreColor(rating) }}>{rating.toFixed(1)}</span>
      </Link>
    </div>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-black/20 border border-[var(--border)] border-dashed p-4 flex items-center">
      <p className="text-xs text-[var(--foreground-muted)] italic">{children}</p>
    </div>
  );
}

function MonthBars({ months }: { months: { name: string; count: number }[] }) {
  const max = Math.max(...months.map((m) => m.count), 1);
  return (
    <>
      {months.map(({ name, count }) => (
        <div key={name} className="flex items-center gap-3">
          <span className="text-xs uppercase tracking-widest text-[var(--foreground-muted)] w-10 shrink-0">{name}</span>
          <div className="flex-1 h-3 bg-black/40 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-blue-500/70 to-blue-400 rounded-full" style={{ width: `${(count / max) * 100}%` }} />
          </div>
          <span className="text-sm font-black text-white w-8 text-right">{count}</span>
        </div>
      ))}
    </>
  );
}

function DecadeBars({ decades }: { decades: { decade: string; count: number }[] }) {
  const max = Math.max(...decades.map((d) => d.count), 1);
  return (
    <div className="space-y-1.5">
      {decades.map(({ decade, count }) => (
        <div key={decade} className="flex items-center gap-2.5">
          <span className="text-xs text-[var(--foreground-muted)] w-10 shrink-0">{decade}</span>
          <div className="flex-1 h-2.5 bg-black/40 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-[var(--ratist-red)]/80 to-[var(--ratist-red)] rounded-full" style={{ width: `${(count / max) * 100}%` }} />
          </div>
          <span className="text-xs font-bold text-white w-6 text-right">{count}</span>
        </div>
      ))}
    </div>
  );
}

function formatDate(yyyymmdd: string): string {
  const d = new Date(`${yyyymmdd}T12:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
