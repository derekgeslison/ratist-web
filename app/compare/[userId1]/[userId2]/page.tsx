import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { posterUrl } from "@/lib/tmdb";
import { prisma } from "@/lib/prisma";
import { scoreColor } from "@/lib/ratings";
import { dimensionSimilarity, matchScore } from "@/lib/ratings";
import ShareButton from "@/components/ShareButton";

export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://theratist.com";

const COMPONENT_KEYS = [
  "narrativeFocused", "characterFocused", "messageFocused",
  "cinematicFocused", "performanceFocused", "entertainmentFocused",
] as const;
const COMPONENT_LABELS: Record<string, string> = {
  narrativeFocused: "Narrative",
  characterFocused: "Characters",
  messageFocused: "Message & Meaning",
  cinematicFocused: "Cinematic",
  performanceFocused: "Performance",
  entertainmentFocused: "Entertainment",
};

const GENRE_KEYS = [
  "genreAction", "genreHorror", "genreDrama", "genreHistorical", "genreScifi",
  "genreThriller", "genreComedy", "genreBookAdapt", "genreFantasy", "genreRomance",
  "genreDocumentary", "genreFamily", "genreFilmNoir", "genreMusical", "genreBiopic",
  "genreCrime", "genreWestern", "genreMystery",
] as const;

interface Props {
  params: Promise<{ userId1: string; userId2: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { userId1, userId2 } = await params;
  const [u1, u2] = await Promise.all([
    prisma.user.findFirst({ where: { OR: [{ id: userId1 }, { firebaseUid: userId1 }] }, select: { name: true } }),
    prisma.user.findFirst({ where: { OR: [{ id: userId2 }, { firebaseUid: userId2 }] }, select: { name: true } }),
  ]);
  if (!u1 || !u2) return { title: "Taste Comparison" };
  const title = `${u1.name} vs ${u2.name} — Taste Comparison`;
  const ogImageUrl = `${SITE_URL}/api/og/compare?userId1=${encodeURIComponent(userId1)}&userId2=${encodeURIComponent(userId2)}`;
  return {
    title,
    openGraph: { title, images: [{ url: ogImageUrl, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, images: [ogImageUrl] },
  };
}

export default async function ComparePage({ params }: Props) {
  const { userId1, userId2 } = await params;

  const [user1, user2] = await Promise.all([
    prisma.user.findFirst({
      where: { OR: [{ id: userId1 }, { firebaseUid: userId1 }] },
      include: { profile: true },
    }),
    prisma.user.findFirst({
      where: { OR: [{ id: userId2 }, { firebaseUid: userId2 }] },
      include: { profile: true },
    }),
  ]);
  if (!user1 || !user2) notFound();

  // Compute match score
  let overallMatch = 0;
  if (user1.profile && user2.profile) {
    const p1 = user1.profile as unknown as Record<string, number>;
    const p2 = user2.profile as unknown as Record<string, number>;
    const allKeys = [...COMPONENT_KEYS, ...GENRE_KEYS];
    const sims = allKeys.map((k) => dimensionSimilarity(p1[k] ?? 0, p2[k] ?? 0));
    overallMatch = Math.round((sims.reduce((a, b) => a + b, 0) / sims.length) * 100);
  }

  // Movies both have rated — include genres for genre comparison
  const [ratings1, ratings2] = await Promise.all([
    prisma.movieRating.findMany({
      where: { userId: user1.id, ratistRating: { not: null } },
      select: {
        movieId: true, ratistRating: true,
        movie: { select: { tmdbId: true, title: true, posterPath: true, genres: { include: { genre: true } } } },
      },
    }),
    prisma.movieRating.findMany({
      where: { userId: user2.id, ratistRating: { not: null } },
      select: {
        movieId: true, ratistRating: true,
        movie: { select: { tmdbId: true, title: true, posterPath: true, genres: { include: { genre: true } } } },
      },
    }),
  ]);

  const ratings2Map = new Map(ratings2.map((r) => [r.movieId, r.ratistRating!]));
  const sharedMovies = ratings1
    .filter((r) => ratings2Map.has(r.movieId))
    .map((r) => ({
      tmdbId: r.movie.tmdbId,
      title: r.movie.title,
      posterPath: r.movie.posterPath,
      rating1: r.ratistRating!,
      rating2: ratings2Map.get(r.movieId)!,
      diff: Math.abs(r.ratistRating! - ratings2Map.get(r.movieId)!),
    }));

  const mostAgreed = [...sharedMovies].sort((a, b) => a.diff - b.diff).slice(0, 5);
  const agreedIds = new Set(mostAgreed.map((m) => m.tmdbId));
  const mostDisagreed = [...sharedMovies].filter((m) => !agreedIds.has(m.tmdbId)).sort((a, b) => b.diff - a.diff).slice(0, 5);

  // Genre comparison — count genres each user has rated, find overlap
  const genreCount1 = new Map<string, { count: number; sum: number }>();
  const genreCount2 = new Map<string, { count: number; sum: number }>();
  for (const r of ratings1) {
    for (const mg of r.movie.genres) {
      const e = genreCount1.get(mg.genre.name) ?? { count: 0, sum: 0 };
      e.count++; e.sum += r.ratistRating ?? 0;
      genreCount1.set(mg.genre.name, e);
    }
  }
  for (const r of ratings2) {
    for (const mg of r.movie.genres) {
      const e = genreCount2.get(mg.genre.name) ?? { count: 0, sum: 0 };
      e.count++; e.sum += r.ratistRating ?? 0;
      genreCount2.set(mg.genre.name, e);
    }
  }
  // Genres both users have rated, sorted by combined count
  const sharedGenres = [...genreCount1.entries()]
    .filter(([name]) => genreCount2.has(name))
    .map(([name, g1]) => {
      const g2 = genreCount2.get(name)!;
      return { name, count1: g1.count, avg1: g1.sum / g1.count, count2: g2.count, avg2: g2.sum / g2.count };
    })
    .sort((a, b) => (b.count1 + b.count2) - (a.count1 + a.count2))
    .slice(0, 6);

  // Recommend to each other — movies one rated highly that the other hasn't seen
  const rated1Ids = new Set(ratings1.map((r) => r.movieId));
  const rated2Ids = new Set(ratings2.map((r) => r.movieId));
  const recsForUser2 = ratings1
    .filter((r) => !rated2Ids.has(r.movieId) && r.ratistRating != null && r.ratistRating >= 7.5)
    .sort((a, b) => (b.ratistRating ?? 0) - (a.ratistRating ?? 0))
    .slice(0, 4)
    .map((r) => ({ tmdbId: r.movie.tmdbId, title: r.movie.title, posterPath: r.movie.posterPath, rating: r.ratistRating! }));
  const recsForUser1 = ratings2
    .filter((r) => !rated1Ids.has(r.movieId) && r.ratistRating != null && r.ratistRating >= 7.5)
    .sort((a, b) => (b.ratistRating ?? 0) - (a.ratistRating ?? 0))
    .slice(0, 4)
    .map((r) => ({ tmdbId: r.movie.tmdbId, title: r.movie.title, posterPath: r.movie.posterPath, rating: r.ratistRating! }));

  const matchColor = overallMatch >= 80 ? "#22c55e" : overallMatch >= 60 ? "#eab308" : "#888888";
  const shareUrl = `${SITE_URL}/compare/${userId1}/${userId2}`;
  const shareText = `${user1.name} and ${user2.name} are ${overallMatch}% taste compatible on The Ratist!`;

  function UserAvatar({ user }: { user: { name: string; avatarUrl: string | null } }) {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="relative w-16 h-16 rounded-full overflow-hidden bg-[var(--surface-2)] border-2 border-[var(--border)]">
          {user.avatarUrl ? (
            <Image src={user.avatarUrl} alt="" fill sizes="64px" className="object-cover" unoptimized />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xl font-bold text-white bg-[var(--ratist-red)]">
              {user.name[0]?.toUpperCase()}
            </div>
          )}
        </div>
        <p className="text-sm font-semibold text-white">{user.name}</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 mb-8 text-center">
        <div className="flex items-center justify-center gap-6 mb-6">
          <Link href={`/profile/${userId1}`}>
            <UserAvatar user={user1} />
          </Link>
          <div className="flex flex-col items-center">
            <p className="text-5xl font-black mb-1" style={{ color: matchColor }}>{overallMatch}%</p>
            <p className="text-sm text-[var(--foreground-muted)]">taste match</p>
            <p className="text-xs text-[var(--foreground-muted)] mt-1">
              {overallMatch >= 80 ? "Very similar taste" : overallMatch >= 60 ? "Good overlap" : "Different tastes"}
            </p>
          </div>
          <Link href={`/profile/${userId2}`}>
            <UserAvatar user={user2} />
          </Link>
        </div>
        <div className="flex items-center justify-center gap-4">
          <ShareButton
            label="Share this comparison"
            text={shareText}
            url={shareUrl}
            cardImageUrl={`/api/og/compare?userId1=${encodeURIComponent(userId1)}&userId2=${encodeURIComponent(userId2)}`}
          />
          <Link href="/auth/signin" className="text-xs text-[var(--foreground-muted)] hover:text-white transition-colors">
            Get your own match score →
          </Link>
        </div>
      </div>

      {/* Profile preference comparison */}
      {user1.profile && user2.profile && (
        <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 mb-6">
          <h2 className="text-base font-semibold text-white mb-4">What You Each Value</h2>
          <div className="space-y-3">
            {COMPONENT_KEYS.map((key) => {
              const p1 = user1.profile as unknown as Record<string, number>;
              const p2 = user2.profile as unknown as Record<string, number>;
              const s1 = p1[key] ?? 0;
              const s2 = p2[key] ?? 0;
              return (
                <div key={key} className="grid grid-cols-[1fr_auto_1fr] gap-1.5 sm:gap-3 items-center">
                  <div className="flex justify-end gap-1.5 items-center">
                    <span className="text-[10px] sm:text-xs shrink-0" style={{ color: scoreColor(s1) }}>{s1.toFixed(1)}</span>
                    <div className="w-12 sm:w-20 h-2 bg-[var(--surface-2)] rounded-full overflow-hidden flex justify-end">
                      <div className="h-full rounded-full" style={{ width: `${(s1 / 10) * 100}%`, backgroundColor: scoreColor(s1) }} />
                    </div>
                  </div>
                  <span className="text-[10px] sm:text-xs text-[var(--foreground-muted)] text-center w-16 sm:w-28 truncate">{COMPONENT_LABELS[key]}</span>
                  <div className="flex gap-1.5 items-center">
                    <div className="w-12 sm:w-20 h-2 bg-[var(--surface-2)] rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(s2 / 10) * 100}%`, backgroundColor: scoreColor(s2) }} />
                    </div>
                    <span className="text-[10px] sm:text-xs shrink-0" style={{ color: scoreColor(s2) }}>{s2.toFixed(1)}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-xs text-[var(--foreground-muted)] mt-3 px-0">
            <span>{user1.name}</span>
            <span>{user2.name}</span>
          </div>
        </section>
      )}

      {/* Most agreed on */}
      {mostAgreed.length > 0 && (
        <section className="mb-6">
          <h2 className="text-base font-semibold text-white mb-4">You Both Agree On</h2>
          <div className="space-y-2">
            {mostAgreed.map((m) => (
              <Link key={m.tmdbId} href={`/movies/${m.tmdbId}`} className="flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--surface)] transition-colors group">
                <div className="relative w-8 h-12 shrink-0 rounded overflow-hidden bg-[var(--surface-2)]">
                  {m.posterPath && <Image src={posterUrl(m.posterPath, "w92")} alt={m.title} fill sizes="32px" className="object-cover" />}
                </div>
                <p className="flex-1 text-sm font-medium text-white group-hover:text-[var(--ratist-red)] transition-colors line-clamp-1">{m.title}</p>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs" style={{ color: scoreColor(m.rating1) }}>{m.rating1.toFixed(1)}</span>
                  <span className="text-xs text-[var(--foreground-muted)]">vs</span>
                  <span className="text-xs" style={{ color: scoreColor(m.rating2) }}>{m.rating2.toFixed(1)}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Most disagreed on */}
      {mostDisagreed.length > 0 && mostDisagreed[0].diff > 1 && (
        <section className="mb-8">
          <h2 className="text-base font-semibold text-white mb-4">Where You Disagree Most</h2>
          <div className="space-y-2">
            {mostDisagreed.filter((m) => m.diff > 1).map((m) => (
              <Link key={m.tmdbId} href={`/movies/${m.tmdbId}`} className="flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--surface)] transition-colors group">
                <div className="relative w-8 h-12 shrink-0 rounded overflow-hidden bg-[var(--surface-2)]">
                  {m.posterPath && <Image src={posterUrl(m.posterPath, "w92")} alt={m.title} fill sizes="32px" className="object-cover" />}
                </div>
                <p className="flex-1 text-sm font-medium text-white group-hover:text-[var(--ratist-red)] transition-colors line-clamp-1">{m.title}</p>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs" style={{ color: scoreColor(m.rating1) }}>{m.rating1.toFixed(1)}</span>
                  <span className="text-xs text-[var(--foreground-muted)]">vs</span>
                  <span className="text-xs" style={{ color: scoreColor(m.rating2) }}>{m.rating2.toFixed(1)}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {sharedMovies.length === 0 && (
        <div className="text-center py-8 text-[var(--foreground-muted)]">
          <p>No movies rated by both users yet.</p>
        </div>
      )}

      {/* Shared genre preferences */}
      {sharedGenres.length > 0 && (
        <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 mb-6">
          <h2 className="text-base font-semibold text-white mb-4">Shared Genre Preferences</h2>
          <div className="space-y-3">
            {sharedGenres.map(({ name, count1, avg1, count2, avg2 }) => (
              <div key={name} className="flex items-center gap-3">
                <span className="text-xs font-semibold shrink-0" style={{ color: scoreColor(avg1) }}>{avg1.toFixed(1)}</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-[var(--foreground-muted)]">{count1} films</span>
                    <span className="text-xs font-medium text-white">{name}</span>
                    <span className="text-xs text-[var(--foreground-muted)]">{count2} films</span>
                  </div>
                  <div className="flex gap-1 h-1.5">
                    <div className="flex-1 bg-[var(--surface-2)] rounded-full overflow-hidden flex justify-end">
                      <div className="h-full rounded-full" style={{ width: `${(avg1 / 10) * 100}%`, backgroundColor: scoreColor(avg1) }} />
                    </div>
                    <div className="flex-1 bg-[var(--surface-2)] rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(avg2 / 10) * 100}%`, backgroundColor: scoreColor(avg2) }} />
                    </div>
                  </div>
                </div>
                <span className="text-xs font-semibold shrink-0" style={{ color: scoreColor(avg2) }}>{avg2.toFixed(1)}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-[var(--foreground-muted)] mt-2">
            <span>{user1.name}</span>
            <span>{user2.name}</span>
          </div>
        </section>
      )}

      {/* Recommend to each other */}
      {(recsForUser1.length > 0 || recsForUser2.length > 0) && (
        <section className="mb-8">
          <h2 className="text-base font-semibold text-white mb-4">Recommend To Each Other</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {/* User2's top picks that User1 hasn't seen */}
            {recsForUser1.length > 0 && (
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
                <p className="text-xs text-[var(--foreground-muted)] mb-3">
                  <span className="text-white font-medium">{user2.name}</span> thinks {user1.name} should watch
                </p>
                <div className="space-y-2">
                  {recsForUser1.map((m) => (
                    <Link key={m.tmdbId} href={`/movies/${m.tmdbId}`} className="flex items-center gap-2.5 group">
                      <div className="relative w-8 h-12 shrink-0 rounded overflow-hidden bg-[var(--surface-2)]">
                        {m.posterPath && <Image src={posterUrl(m.posterPath, "w92")} alt={m.title} fill sizes="32px" className="object-cover" />}
                      </div>
                      <span className="text-sm text-white group-hover:text-[var(--ratist-red)] transition-colors line-clamp-1 flex-1">{m.title}</span>
                      <span className="text-xs font-bold shrink-0" style={{ color: scoreColor(m.rating) }}>{m.rating.toFixed(1)}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {/* User1's top picks that User2 hasn't seen */}
            {recsForUser2.length > 0 && (
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
                <p className="text-xs text-[var(--foreground-muted)] mb-3">
                  <span className="text-white font-medium">{user1.name}</span> thinks {user2.name} should watch
                </p>
                <div className="space-y-2">
                  {recsForUser2.map((m) => (
                    <Link key={m.tmdbId} href={`/movies/${m.tmdbId}`} className="flex items-center gap-2.5 group">
                      <div className="relative w-8 h-12 shrink-0 rounded overflow-hidden bg-[var(--surface-2)]">
                        {m.posterPath && <Image src={posterUrl(m.posterPath, "w92")} alt={m.title} fill sizes="32px" className="object-cover" />}
                      </div>
                      <span className="text-sm text-white group-hover:text-[var(--ratist-red)] transition-colors line-clamp-1 flex-1">{m.title}</span>
                      <span className="text-xs font-bold shrink-0" style={{ color: scoreColor(m.rating) }}>{m.rating.toFixed(1)}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Non-member CTA */}
      <div className="text-center py-6 border-t border-[var(--border)]">
        <p className="text-sm text-[var(--foreground-muted)] mb-3">Find your own taste match on The Ratist</p>
        <Link href="/auth/signin" className="inline-block bg-[var(--ratist-red)] text-white text-sm font-semibold px-6 py-2.5 rounded-full hover:bg-[var(--ratist-red)]/90 transition-colors">
          Join for free
        </Link>
      </div>
    </div>
  );
}
