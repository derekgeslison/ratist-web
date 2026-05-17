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
import { useTouchReveal } from "@/hooks/useTouchReveal";
import { useWatchlistFlow } from "./WatchlistFlow";

interface Props {
  movie: TMDBMovie;
  characterName?: string;
  streaming?: ProviderInfo[];
  rent?: ProviderInfo[];
  certification?: string | null;
}

export default function MovieCard({ movie, characterName, streaming, rent, certification }: Props) {
  const { user } = useAuth();
  const communityScore = movie.vote_average > 0 ? movie.vote_average : null;
  const { seen, watchlisted, ratistRating, estimatedRating, markSeen: persistSeen, markUnseen: persistUnseen, setWatchlistState } = useMovieUserState(movie.id);
  const [markingS, setMarkingS] = useState(false);
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

  // Watchlist click flow: 0/1 lists → toggle directly; 2+ → open
  // picker. Replaces the old "always add to default" behavior so a
  // user with a "Want to watch" + "Date night" + "With dad" doesn't
  // get the wrong list silently.
  const watchlistFlow = useWatchlistFlow({
    tmdbId: movie.id,
    mediaType: "movie",
    title: movie.title,
    posterPath: movie.poster_path,
    releaseDate: movie.release_date,
    onWatchlistedChange: setWatchlistState,
  });
  // Long-press reveal on touch + hover reveal on desktop. The
  // group-hover variants are gated behind [@media(hover:hover)] so
  // touch devices don't fire `:hover` on tap (the long-known sticky-
  // hover quirk that defeated the prior version of this fix).
  const touch = useTouchReveal();
  const overlayClass = `tile-hover-overlay${touch.revealed ? " revealed" : ""}`;

  return (
    <Link
      href={`/movies/${movie.id}`}
      {...touch.containerProps}
      className="tile-hover-parent group flex flex-col bg-[var(--surface)] rounded-lg overflow-hidden border border-[var(--border)] hover:border-[var(--ratist-red)] transition-colors relative"
      data-seen-filter-id={`movie-${movie.id}`}
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
          <div className={`${overlayClass} absolute inset-0 z-20 bg-black/50 flex flex-col items-center justify-end gap-2 pb-3`}>
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
              onClick={watchlistFlow.handleClick}
              disabled={watchlistFlow.busy}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors disabled:opacity-60 ${
                watchlisted ? "bg-blue-600/80 text-white hover:bg-blue-600" : "bg-white/90 text-black hover:bg-white"
              }`}
            >
              {watchlisted ? <><BookmarkCheck className="w-3.5 h-3.5" /> Watchlisted</> : <><Bookmark className="w-3.5 h-3.5" /> {watchlistFlow.busy ? "..." : "Watchlist"}</>}
            </button>
            {watchlistFlow.picker}
          </div>
        )}
        {certification && (
          <span className="absolute bottom-2 right-2 bg-black/70 border border-white/20 text-white text-[10px] font-bold px-1.5 py-0.5 rounded z-10">
            {certification}
          </span>
        )}
      </div>
      {/* flex-1 makes this fill the height the grid stretched the
         tile to; mt-auto on the ratings row pushes the ratings (and
         the streaming/rent row that follows) to the bottom so a tile
         whose title fits on one line still has its badges aligned
         with neighboring tiles whose title wrapped to two lines. */}
      <div className="p-2.5 flex flex-col gap-1 flex-1">
        <p className="text-sm font-medium text-white line-clamp-2 leading-tight" title={movie.title}>{movie.title}</p>
        {characterName && <p className="text-xs text-[var(--ratist-red)]/70 line-clamp-2" title={characterName}>as {characterName}</p>}
        <p className="text-xs text-[var(--foreground-muted)]">{movie.release_date?.slice(0, 4) || "TBA"}</p>
        <div className="flex items-center gap-3 mt-auto pt-1">
          <RatingBadge type="community" score={communityScore} size="sm" />
          <RatingBadge
            type="ratist"
            score={ratistRating ?? estimatedRating}
            isEstimate={ratistRating == null && estimatedRating != null}
            size="sm"
          />
        </div>
        {streaming && streaming.length > 0 ? (
          <div className="mt-0.5"><ProviderLogos providers={streaming} size={18} label="Stream" contentTitle={movie.title} contentType="movie" /></div>
        ) : rent && rent.length > 0 ? (
          <div className="mt-0.5"><ProviderLogos providers={rent} size={18} label="Rent" contentTitle={movie.title} contentType="movie" /></div>
        ) : null}
      </div>
    </Link>
  );
}
