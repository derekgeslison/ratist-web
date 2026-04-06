import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Trophy } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { posterUrl } from "@/lib/tmdb";
import { scoreColor } from "@/lib/ratings";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ userId: string; listKey: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { userId, listKey } = await params;
  const user = await prisma.user.findFirst({
    where: { OR: [{ id: userId }, { firebaseUid: userId }] },
    select: { name: true },
  });
  if (!user) return { title: "Rankings" };
  const label = listKey === "all-time" ? "All-Time" : listKey;
  return {
    title: `${user.name}'s ${label} Rankings | The Ratist`,
    description: `${user.name}'s top movie rankings on The Ratist`,
  };
}

export default async function PublicRankingsPage({ params }: Props) {
  const { userId, listKey } = await params;

  const user = await prisma.user.findFirst({
    where: { OR: [{ id: userId }, { firebaseUid: userId }] },
    select: { id: true, name: true, avatarUrl: true, firebaseUid: true, isPrivate: true },
  });
  if (!user) notFound();

  // Check saved rankings
  const savedRankings = await prisma.userMovieRanking.findMany({
    where: { userId: user.id, listKey },
    include: { movie: { select: { id: true, tmdbId: true, title: true, posterPath: true, releaseDate: true } } },
    orderBy: { sortOrder: "asc" },
  });

  // Get ratings for score display
  const movieIds = savedRankings.filter((r) => r.movieId).map((r) => r.movieId!);
  const ratings = movieIds.length > 0
    ? await prisma.movieRating.findMany({
        where: { userId: user.id, movieId: { in: movieIds } },
        select: { movieId: true, ratistRating: true },
      })
    : [];
  const ratingMap = new Map(ratings.map((r) => [r.movieId, r.ratistRating]));

  // If no saved rankings, fall back to rating-sorted
  let movies: { tmdbId: number; title: string; posterPath: string | null; year: string; ratistRating: number | null }[];

  if (savedRankings.length > 0) {
    movies = savedRankings.filter((r) => r.movie).map((r) => ({
      tmdbId: r.movie!.tmdbId,
      title: r.movie!.title,
      posterPath: r.movie!.posterPath,
      year: r.movie!.releaseDate?.slice(0, 4) ?? "",
      ratistRating: ratingMap.get(r.movieId!) ?? null,
    }));
  } else {
    const allRatings = await prisma.movieRating.findMany({
      where: { userId: user.id, ratistRating: { not: null } },
      select: {
        ratistRating: true,
        movie: { select: { tmdbId: true, title: true, posterPath: true, releaseDate: true } },
      },
      orderBy: { ratistRating: "desc" },
    });
    let filtered = allRatings.map((r) => ({
      tmdbId: r.movie.tmdbId,
      title: r.movie.title,
      posterPath: r.movie.posterPath,
      year: r.movie.releaseDate?.slice(0, 4) ?? "",
      ratistRating: r.ratistRating,
    }));
    if (listKey !== "all-time") {
      filtered = filtered.filter((m) => m.year === listKey);
    }
    movies = filtered;
  }

  const label = listKey === "all-time" ? "All-Time Rankings" : `${listKey} Rankings`;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <Trophy className="w-6 h-6 text-[var(--ratist-red)]" />
        <h1 className="text-2xl font-bold text-white">{label}</h1>
      </div>

      {/* User info */}
      <Link href={`/profile/${user.firebaseUid}`} className="flex items-center gap-2 mb-6 text-sm text-[var(--foreground-muted)] hover:text-white transition-colors">
        {user.avatarUrl ? (
          <Image src={user.avatarUrl} alt={user.name} width={24} height={24} className="rounded-full" />
        ) : (
          <div className="w-6 h-6 rounded-full bg-[var(--surface-2)] flex items-center justify-center text-[10px]">
            {user.name.charAt(0).toUpperCase()}
          </div>
        )}
        {user.name}
      </Link>

      {movies.length === 0 ? (
        <div className="text-center py-16 text-[var(--foreground-muted)]">
          <Trophy className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p>No rankings yet for this list.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {movies.map((m, i) => (
            <Link
              key={i}
              href={`/movies/${m.tmdbId}`}
              className="flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-lg hover:bg-[var(--surface)] transition-colors group"
            >
              <span className="text-base font-bold text-[var(--foreground-muted)] w-8 text-right shrink-0">{i + 1}</span>
              <div className="relative w-10 h-14 shrink-0 rounded overflow-hidden bg-[var(--surface-2)]">
                {m.posterPath ? (
                  <Image src={posterUrl(m.posterPath, "w92")} alt={m.title} fill sizes="40px" className="object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-[var(--foreground-muted)]">?</div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white group-hover:text-[var(--ratist-red)] transition-colors line-clamp-1">{m.title}</p>
                <p className="text-xs text-[var(--foreground-muted)]">{m.year}</p>
              </div>
              {m.ratistRating != null && (
                <span className="text-sm font-bold shrink-0" style={{ color: scoreColor(m.ratistRating) }}>
                  {m.ratistRating.toFixed(1)}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
