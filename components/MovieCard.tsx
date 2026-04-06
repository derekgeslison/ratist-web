"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Eye, EyeOff, Bookmark, BookmarkCheck, Check } from "lucide-react";
import { posterUrl, type TMDBMovie } from "@/lib/tmdb";
import RatingBadge from "./RatingBadge";
import ProviderLogos, { type ProviderInfo } from "./ProviderLogos";
import { useAuth } from "@/context/AuthContext";
import { useMovieUserState } from "@/hooks/useMovieUserState";

interface Props {
  movie: TMDBMovie;
  characterName?: string;
  streaming?: ProviderInfo[];
  rent?: ProviderInfo[];
}

export default function MovieCard({ movie, characterName, streaming, rent }: Props) {
  const { user } = useAuth();
  const communityScore = movie.vote_average > 0 ? movie.vote_average : null;
  const { seen, watchlisted, ratistRating, estimatedRating, markSeen: persistSeen, markUnseen: persistUnseen, setWatchlistState } = useMovieUserState(movie.id);
  const [markingS, setMarkingS] = useState(false);
  const [markingW, setMarkingW] = useState(false);
  const [seenError, setSeenError] = useState<string | null>(null);

  async function toggleSeen(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    if (!user || markingS) return;
    setMarkingS(true);
    setSeenError(null);
    const token = await user.getIdToken();
    const res = await fetch(`/api/movies/${movie.id}/seen`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: movie.title, poster_path: movie.poster_path, release_date: movie.release_date }),
    }).catch(() => null);
    if (res && !res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.hasRating) { setSeenError("Remove your rating first to un-mark as seen"); setTimeout(() => setSeenError(null), 3000); }
    } else if (res) {
      const data = await res.json().catch(() => ({}));
      if (data.seen) persistSeen(); else persistUnseen();
    }
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
      className="group flex flex-col bg-[var(--surface)] rounded-lg overflow-hidden border border-[var(--border)] hover:border-[var(--ratist-red)] transition-colors relative"
    >
      <div className="relative aspect-[2/3] overflow-hidden bg-[var(--surface-2)]">
        <Image
          src={posterUrl(movie.poster_path)}
          alt={movie.title}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
          className="object-cover group-hover:scale-105 transition-transform duration-300"
        />
        {user && (
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-end gap-2 pb-3">
            {seenError && (
              <div className="absolute top-2 left-2 right-2 bg-red-900/90 text-white text-[10px] rounded-lg px-2 py-1.5 text-center z-20">
                {seenError}
              </div>
            )}
            <button
              onClick={toggleSeen}
              disabled={markingS}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                seen ? "bg-green-600/80 text-white hover:bg-red-600/80" : "bg-white/90 text-black hover:bg-white"
              }`}
            >
              {seen ? <><EyeOff className="w-3.5 h-3.5" /> Unsee</> : <><Eye className="w-3.5 h-3.5" /> {markingS ? "..." : "Mark Seen"}</>}
            </button>
            <button
              onClick={addToWatchlist}
              disabled={markingW || watchlisted}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                watchlisted ? "bg-blue-600/80 text-white cursor-default" : "bg-white/90 text-black hover:bg-white"
              }`}
            >
              {watchlisted ? <><BookmarkCheck className="w-3.5 h-3.5" /> Watchlisted</> : <><Bookmark className="w-3.5 h-3.5" /> {markingW ? "..." : "Watchlist"}</>}
            </button>
          </div>
        )}
      </div>
      <div className="p-2.5 flex flex-col gap-1">
        <p className="text-sm font-medium text-white line-clamp-1 leading-tight">{movie.title}</p>
        {characterName && <p className="text-xs text-[var(--ratist-red)]/70 line-clamp-1">as {characterName}</p>}
        <p className="text-xs text-[var(--foreground-muted)]">{movie.release_date?.slice(0, 4) ?? "—"}</p>
        <div className="flex items-center gap-3 mt-0.5">
          <RatingBadge type="community" score={communityScore} size="sm" />
          <RatingBadge
            type="ratist"
            score={ratistRating ?? estimatedRating}
            isEstimate={ratistRating == null && estimatedRating != null}
            size="sm"
          />
        </div>
        {streaming && streaming.length > 0 ? (
          <div className="mt-0.5"><ProviderLogos providers={streaming} size={18} label="Stream" /></div>
        ) : rent && rent.length > 0 ? (
          <div className="mt-0.5"><ProviderLogos providers={rent} size={18} label="Rent" /></div>
        ) : null}
      </div>
    </Link>
  );
}
