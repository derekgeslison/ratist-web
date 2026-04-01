"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Eye, Bookmark, BookmarkCheck } from "lucide-react";
import { posterUrl, type TMDBMovie } from "@/lib/tmdb";
import RatingBadge from "./RatingBadge";
import { useAuth } from "@/context/AuthContext";
import { useMovieUserState } from "@/hooks/useMovieUserState";

interface Props {
  movie: TMDBMovie;
}

export default function MovieListItem({ movie }: Props) {
  const { user } = useAuth();
  const communityScore = movie.vote_average > 0 ? movie.vote_average : null;
  const { seen, watchlisted, ratistRating, estimatedRating, markSeen: persistSeen, setWatchlistState } = useMovieUserState(movie.id);
  const [markingS, setMarkingS] = useState(false);
  const [markingW, setMarkingW] = useState(false);

  async function markSeen(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    if (!user || markingS || seen) return;
    setMarkingS(true);
    const token = await user.getIdToken();
    await fetch(`/api/movies/${movie.id}/seen`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: movie.title, poster_path: movie.poster_path, release_date: movie.release_date }),
    }).catch(() => null);
    persistSeen();
    setMarkingS(false);
  }

  async function addToWatchlist(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    if (!user || markingW || watchlisted) return;
    setMarkingW(true);
    const token = await user.getIdToken();
    const res = await fetch(`/api/movies/${movie.id}/watchlist`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: movie.title, poster_path: movie.poster_path, release_date: movie.release_date }),
    }).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setWatchlistState(data.watchlisted ?? true);
    }
    setMarkingW(false);
  }

  return (
    <Link
      href={`/movies/${movie.id}`}
      className="flex items-center gap-4 py-4 hover:bg-[var(--surface)] px-3 -mx-3 rounded-lg transition-colors group"
    >
      <div className="relative w-14 h-20 shrink-0 rounded overflow-hidden bg-[var(--surface-2)]">
        <Image src={posterUrl(movie.poster_path, "w92")} alt={movie.title} fill sizes="56px" className="object-cover" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-medium text-white group-hover:text-[var(--ratist-red)] transition-colors line-clamp-1">{movie.title}</p>
        <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
          {movie.release_date?.slice(0, 4)} · {movie.popularity.toFixed(0)} popularity
        </p>
        <p className="text-xs text-[var(--foreground-muted)] mt-1 line-clamp-2 hidden sm:block">{movie.overview}</p>
      </div>

      {/* Seen / Watchlist — left of ratings, expand on row hover */}
      {user && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={markSeen}
            disabled={markingS}
            title={seen ? "Already seen" : "Mark as seen"}
            className={`flex items-center overflow-hidden transition-all duration-200 text-xs font-semibold pl-2 pr-0 group-hover:pr-2 py-1.5 rounded-full border gap-0 group-hover:gap-1.5 ${
              seen
                ? "border-green-500/50 text-green-400 bg-green-500/10 w-[26px] group-hover:w-[104px]"
                : "border-[var(--border)] text-[var(--foreground-muted)] hover:border-green-500/50 hover:text-green-400 w-[26px] group-hover:w-[104px]"
            }`}
          >
            <Eye className="w-3.5 h-3.5 shrink-0" />
            <span className="whitespace-nowrap overflow-hidden w-0 group-hover:w-auto transition-all duration-200">
              {seen ? "Seen!" : markingS ? "..." : "Mark Seen"}
            </span>
          </button>

          <button
            onClick={addToWatchlist}
            disabled={markingW || watchlisted}
            title={watchlisted ? "In your watchlist" : "Add to watchlist"}
            className={`flex items-center overflow-hidden transition-all duration-200 text-xs font-semibold pl-2 pr-0 group-hover:pr-2 py-1.5 rounded-full border gap-0 group-hover:gap-1.5 ${
              watchlisted
                ? "border-blue-500/50 text-blue-400 bg-blue-500/10 w-[26px] group-hover:w-[118px] cursor-default"
                : "border-[var(--border)] text-[var(--foreground-muted)] hover:border-blue-400 hover:text-blue-300 w-[26px] group-hover:w-[118px]"
            }`}
          >
            {watchlisted ? <BookmarkCheck className="w-3.5 h-3.5 shrink-0" /> : <Bookmark className="w-3.5 h-3.5 shrink-0" />}
            <span className="whitespace-nowrap overflow-hidden w-0 group-hover:w-auto transition-all duration-200">
              {watchlisted ? "Watchlisted" : markingW ? "..." : "+ Watchlist"}
            </span>
          </button>
        </div>
      )}

      {/* Ratings — rightmost */}
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <RatingBadge type="community" score={communityScore} size="sm" />
        <RatingBadge
          type="ratist"
          score={ratistRating ?? estimatedRating}
          isEstimate={ratistRating == null && estimatedRating != null}
          size="sm"
        />
      </div>
    </Link>
  );
}
