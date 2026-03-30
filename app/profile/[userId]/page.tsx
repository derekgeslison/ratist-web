import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
export const dynamic = "force-dynamic";
import Image from "next/image";
import CompareTasteButton from "@/components/CompareTasteButton";
import { getRatingStatus } from "@/lib/rating-status";
import { prisma } from "@/lib/prisma";
import { findSimilarUsers } from "@/lib/profile";
import ProfileTabs from "@/components/ProfileTabs";
import { scoreColor } from "@/lib/ratings";

interface Props { params: Promise<{ userId: string }> }

const COMPONENT_LABELS: Record<string, string> = {
  plotFocused: "Plot-focused",
  visualFocused: "Visual-focused",
  scriptFocused: "Script-focused",
  actingFocused: "Acting-focused",
  originalityFocused: "Originality-focused",
  characterFocused: "Character-focused",
  messageFocused: "Message-focused",
};

const GENRE_LABELS: Record<string, string> = {
  genreAction: "Action / Adventure", genreHorror: "Horror", genreDrama: "Drama",
  genreHistorical: "Historical", genreScifi: "Sci-Fi", genreThriller: "Thriller",
  genreComedy: "Comedy", genreBookAdapt: "Book Adaptation", genreFantasy: "Fantasy",
  genreRomance: "Romance", genreDocumentary: "Documentary", genreFamily: "Family",
  genreFilmNoir: "Film-Noir", genreMusical: "Musical", genreBiopic: "Biopic",
  genreCrime: "Crime", genreWestern: "Western", genreMystery: "Mystery",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { userId } = await params;
  const user = await prisma.user.findFirst({
    where: { OR: [{ id: userId }, { firebaseUid: userId }] },
    select: { name: true },
  });
  if (!user) return { title: "Profile" };
  return {
    title: user.name,
    openGraph: { title: `${user.name}'s profile on The Ratist` },
  };
}

export default async function ProfilePage({ params }: Props) {
  const { userId } = await params;

  const user = await prisma.user.findFirst({
    where: { OR: [{ id: userId }, { firebaseUid: userId }] },
    include: { profile: true },
  });

  if (!user) notFound();

  // Fetch all profile data in parallel
  const [
    ratingCount,
    avgRating,
    seenCount,
    watchlistCount,
    allRatings,
    seenMovies,
    watchlistMovies,
  ] = await Promise.all([
    prisma.movieRating.count({ where: { userId: user.id } }),
    prisma.movieRating.aggregate({
      where: { userId: user.id, ratistRating: { not: null } },
      _avg: { ratistRating: true },
    }),
    prisma.userFavoriteMovie.count({ where: { userId: user.id } }),
    prisma.userWatchlistMovie.count({ where: { userId: user.id } }),
    prisma.movieRating.findMany({
      where: { userId: user.id },
      include: {
        movie: {
          select: {
            tmdbId: true,
            title: true,
            posterPath: true,
            genres: { include: { genre: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.userFavoriteMovie.findMany({
      where: { userId: user.id },
      include: {
        movie: {
          select: {
            tmdbId: true,
            title: true,
            posterPath: true,
            releaseDate: true,
            ratings: { where: { userId: user.id }, select: { ratistRating: true }, take: 1 },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.userWatchlistMovie.findMany({
      where: { userId: user.id },
      include: {
        movie: { select: { tmdbId: true, title: true, posterPath: true, releaseDate: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Build rating distribution (0-2, 2-4, 4-6, 6-8, 8-10)
  const RANGES = [
    { label: "0–2", min: 0, max: 2 },
    { label: "2–4", min: 2, max: 4 },
    { label: "4–6", min: 4, max: 6 },
    { label: "6–7", min: 6, max: 7 },
    { label: "7–8", min: 7, max: 8 },
    { label: "8–9", min: 8, max: 9 },
    { label: "9–10", min: 9, max: 10.1 },
  ];
  const ratingDistribution = RANGES.map(({ label, min, max }) => ({
    range: label,
    count: allRatings.filter((r) => r.ratistRating !== null && r.ratistRating >= min && r.ratistRating < max).length,
  })).filter((r) => r.count > 0);

  // Build genre breakdown
  const genreMap = new Map<string, { count: number; sum: number }>();
  for (const r of allRatings) {
    for (const mg of r.movie.genres) {
      const entry = genreMap.get(mg.genre.name) ?? { count: 0, sum: 0 };
      entry.count++;
      entry.sum += r.ratistRating ?? 0;
      genreMap.set(mg.genre.name, entry);
    }
  }
  const genreBreakdown = [...genreMap.entries()]
    .map(([name, { count, sum }]) => ({ name, count, avg: sum / count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Find similar users + recommendations
  let similarUsers: Awaited<ReturnType<typeof findSimilarUsers>> = [];
  let recommendations: { tmdbId: number; title: string; posterPath: string | null; avgRating: number }[] = [];
  try {
    similarUsers = await findSimilarUsers(user.id, 5);
    if (similarUsers.length > 0) {
      const similarIds = similarUsers.map((s) => s.user.id);
      const ratedByUser = new Set(allRatings.map((r) => r.movieId));
      const topRatings = await prisma.movieRating.findMany({
        where: {
          userId: { in: similarIds },
          ratistRating: { gte: 8.0 },
          movieId: { notIn: [...ratedByUser] },
        },
        include: { movie: { select: { id: true, tmdbId: true, title: true, posterPath: true } } },
        orderBy: { ratistRating: "desc" },
        take: 50,
      });
      const movieMap = new Map<string, { tmdbId: number; title: string; posterPath: string | null; sum: number; count: number }>();
      for (const r of topRatings) {
        const existing = movieMap.get(r.movieId);
        if (existing) { existing.sum += r.ratistRating ?? 0; existing.count++; }
        else movieMap.set(r.movieId, { tmdbId: r.movie.tmdbId, title: r.movie.title, posterPath: r.movie.posterPath, sum: r.ratistRating ?? 0, count: 1 });
      }
      recommendations = [...movieMap.values()]
        .map((m) => ({ ...m, avgRating: m.sum / m.count }))
        .sort((a, b) => b.avgRating - a.avgRating)
        .slice(0, 10);
    }
  } catch { /* DB not ready */ }

  const avgRatingValue = avgRating._avg.ratistRating;

  // Build a tmdbId → ratingStatus map so diary rows can show incomplete status
  const ratingStatusByTmdbId = new Map(
    allRatings.map((r) => [r.movie.tmdbId, getRatingStatus(r)])
  );

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Profile header */}
      <div className="flex items-start gap-6 mb-8">
        <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden bg-[var(--surface-2)] border-2 border-[var(--border)] shrink-0">
          {user.avatarUrl ? (
            <Image src={user.avatarUrl} alt={user.name} fill sizes="96px" className="object-cover" unoptimized />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-white bg-[var(--ratist-red)]">
              {user.name[0]?.toUpperCase()}
            </div>
          )}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white mb-1">{user.name}</h1>
          {user.bio && <p className="text-sm text-[var(--foreground-muted)] mb-3">{user.bio}</p>}
          <div className="flex flex-wrap gap-4 text-sm text-[var(--foreground-muted)]">
            <span><strong className="text-white">{ratingCount}</strong> rated</span>
            <span><strong className="text-white">{seenCount}</strong> seen</span>
            {avgRatingValue && (
              <span>
                Avg:{" "}
                <strong style={{ color: scoreColor(avgRatingValue) }}>
                  {avgRatingValue.toFixed(1)}
                </strong>
              </span>
            )}
            <span>Member since {user.createdAt.getFullYear()}</span>
          </div>
          <div className="mt-3">
            <CompareTasteButton profileFirebaseUid={user.firebaseUid} profileUserId={user.id} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <ProfileTabs
        ratings={allRatings.map((r) => ({
          id: r.id,
          tmdbId: r.movie.tmdbId,
          title: r.movie.title,
          posterPath: r.movie.posterPath,
          ratistRating: r.ratistRating,
          reviewText: r.reviewText,
          createdAt: r.createdAt.toISOString(),
          ratingStatus: getRatingStatus(r),
        }))}
        seenMovies={seenMovies.map((s) => ({
          tmdbId: s.movie.tmdbId,
          title: s.movie.title,
          posterPath: s.movie.posterPath,
          releaseDate: s.movie.releaseDate,
          seenAt: s.createdAt.toISOString(),
          watchedDate: s.watchedDate?.toISOString() ?? null,
          ratistRating: s.movie.ratings[0]?.ratistRating ?? null,
          ratingStatus: ratingStatusByTmdbId.get(s.movie.tmdbId) ?? null,
        }))}
        watchlistMovies={watchlistMovies.map((w) => ({
          tmdbId: w.movie.tmdbId,
          title: w.movie.title,
          posterPath: w.movie.posterPath,
          releaseDate: w.movie.releaseDate,
        }))}
        recommendations={recommendations}
        similarUsers={similarUsers}
        profile={user.profile as Record<string, number> | null}
        stats={{
          ratingCount,
          avgRating: avgRatingValue,
          seenCount,
          watchlistCount,
          ratingDistribution,
          genreBreakdown,
        }}
        componentLabels={COMPONENT_LABELS}
        genreLabels={GENRE_LABELS}
        profileFirebaseUid={user.firebaseUid}
        profileUserId={user.id}
        isPrivate={user.isPrivate}
      />
    </div>
  );
}
