import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Bookmark, Lock, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { posterUrl } from "@/lib/tmdb";
import RatingBadge from "@/components/RatingBadge";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const watchlist = await prisma.watchlist.findUnique({
    where: { id },
    include: { user: { select: { name: true } } },
  });
  if (!watchlist) return { title: "List Not Found" };
  return {
    title: `${watchlist.name} — ${watchlist.user.name} | The Ratist`,
    description: watchlist.description ?? `${watchlist.name} watchlist by ${watchlist.user.name}`,
  };
}

export default async function PublicWatchlistPage({ params }: Props) {
  const { id } = await params;

  const watchlist = await prisma.watchlist.findUnique({
    where: { id },
    include: {
      user: { select: { name: true, firebaseUid: true, avatarUrl: true } },
      collaborators: { include: { user: { select: { name: true, firebaseUid: true } } } },
      movies: {
        include: {
          movie: {
            select: {
              tmdbId: true, title: true, posterPath: true, releaseDate: true, voteAverage: true,
            },
          },
        },
        orderBy: { addedAt: "desc" },
      },
    },
  });

  if (!watchlist) notFound();
  if (watchlist.isPrivate) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <Lock className="w-12 h-12 mx-auto mb-4 text-[var(--foreground-muted)] opacity-30" />
        <h1 className="text-xl font-bold text-white mb-2">Private List</h1>
        <p className="text-[var(--foreground-muted)]">This watchlist is private and can only be viewed by its owner and collaborators.</p>
      </div>
    );
  }

  const checkedCount = watchlist.movies.filter((m) => m.isChecked).length;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-start gap-3 mb-1">
        <Bookmark className="w-6 h-6 text-[var(--ratist-red)] mt-0.5 shrink-0" />
        <div>
          <h1 className="text-2xl font-bold text-white">{watchlist.name}</h1>
          {watchlist.description && (
            <p className="text-sm text-[var(--foreground-muted)] mt-1">{watchlist.description}</p>
          )}
        </div>
      </div>

      {/* Owner + stats */}
      <div className="flex flex-wrap items-center gap-4 mt-3 mb-6 text-sm text-[var(--foreground-muted)]">
        <Link href={`/profile/${watchlist.user.firebaseUid}`} className="flex items-center gap-2 hover:text-white transition-colors">
          {watchlist.user.avatarUrl ? (
            <Image src={watchlist.user.avatarUrl} alt={watchlist.user.name} width={24} height={24} className="rounded-full" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-[var(--surface-2)] flex items-center justify-center text-[10px]">
              {watchlist.user.name.charAt(0).toUpperCase()}
            </div>
          )}
          {watchlist.user.name}
        </Link>
        <span>{watchlist.movies.length} movie{watchlist.movies.length !== 1 ? "s" : ""}</span>
        {checkedCount > 0 && <span className="text-green-400">{checkedCount} watched</span>}
        {watchlist.collaborators.length > 0 && (
          <span className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5" /> {watchlist.collaborators.length + 1} contributors
          </span>
        )}
      </div>

      {/* Movies grid */}
      {watchlist.movies.length === 0 ? (
        <p className="text-center py-16 text-[var(--foreground-muted)]">This list is empty.</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
          {watchlist.movies.map((entry) => (
            <Link key={entry.id} href={`/movies/${entry.movie.tmdbId}`} className={`group flex flex-col ${entry.isChecked ? "opacity-60" : ""}`}>
              <div className={`relative aspect-[2/3] rounded-lg overflow-hidden bg-[var(--surface-2)] border transition-colors mb-1.5 ${
                entry.isChecked ? "border-green-500/30" : "border-[var(--border)] group-hover:border-[var(--ratist-red)]"
              }`}>
                {entry.movie.posterPath ? (
                  <Image src={posterUrl(entry.movie.posterPath, "w185")} alt={entry.movie.title} fill sizes="120px" className="object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm text-[var(--foreground-muted)]">?</div>
                )}
              </div>
              <p className={`text-xs font-medium line-clamp-1 transition-colors ${
                entry.isChecked ? "text-[var(--foreground-muted)] line-through" : "text-white group-hover:text-[var(--ratist-red)]"
              }`}>{entry.movie.title}</p>
              <p className="text-xs text-[var(--foreground-muted)]">{entry.movie.releaseDate?.slice(0, 4)}</p>
              <div className="flex items-center gap-2 flex-wrap mt-0.5">
                {entry.movie.voteAverage != null && entry.movie.voteAverage > 0 && (
                  <RatingBadge type="community" score={entry.movie.voteAverage} size="sm" />
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
