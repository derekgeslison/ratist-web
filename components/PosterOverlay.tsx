"use client";

import { useState } from "react";
import { Eye, EyeOff, Bookmark, BookmarkCheck, Check } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useMovieUserState } from "@/hooks/useMovieUserState";
import { useShowUserState } from "@/hooks/useShowUserState";
import { useTouchReveal } from "@/hooks/useTouchReveal";
import RatingBadge from "./RatingBadge";

interface Props {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  releaseDate?: string | null;
  voteAverage?: number | null;
  showRatings?: boolean;
  mediaType?: "movie" | "tv";
  children: React.ReactNode;
}

export default function PosterOverlay({ tmdbId, title, posterPath, releaseDate, voteAverage, showRatings = false, mediaType = "movie", children }: Props) {
  const { user } = useAuth();
  const movieState = useMovieUserState(mediaType === "movie" ? tmdbId : 0);
  const showState = useShowUserState(mediaType === "tv" ? tmdbId : 0);

  const state = mediaType === "movie" ? movieState : showState;
  const { seen, watchlisted, markSeen: persistSeen, markUnseen: persistUnseen, setWatchlistState } = state;
  const ratistRating = mediaType === "movie" ? movieState.ratistRating : null;
  const estimatedRating = mediaType === "movie" ? movieState.estimatedRating : null;

  const [markingS, setMarkingS] = useState(false);
  const [markingW, setMarkingW] = useState(false);
  const [seenError, setSeenError] = useState<string | null>(null);

  const communityScore = voteAverage && voteAverage > 0 ? voteAverage : null;

  const apiBase = mediaType === "movie" ? `/api/movies/${tmdbId}` : `/api/shows/${tmdbId}`;
  const bodyPayload = mediaType === "movie"
    ? { title, poster_path: posterPath, release_date: releaseDate }
    : { name: title, poster_path: posterPath, first_air_date: releaseDate };

  async function toggleSeen(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    if (!user || markingS) return;
    setMarkingS(true);
    setSeenError(null);
    const token = await user.getIdToken();
    const res = await fetch(`${apiBase}/seen`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(bodyPayload),
    }).catch(() => null);
    if (res && !res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.hasRating) { setSeenError("Remove your rating first"); setTimeout(() => setSeenError(null), 3000); }
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
    const res = await fetch(`${apiBase}/watchlist`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(bodyPayload),
    }).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setWatchlistState(data.watchlisted ?? true);
    }
    setMarkingW(false);
  }

  const touch = useTouchReveal();
  const overlayClass = touch.isTouch
    ? (touch.revealed ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none")
    : "opacity-0 pointer-events-none group-hover/poster:opacity-100 group-hover/poster:pointer-events-auto";

  return (
    <div className="group/poster" {...touch.containerProps}>
      <div className="relative">
        {children}
        {user && (
          <div className={`absolute inset-0 bg-black/50 transition-opacity flex flex-col items-center justify-end gap-1.5 pb-2 rounded-lg z-10 ${overlayClass}`}>
            {seenError && (
              <div className="absolute top-1 left-1 right-1 bg-red-900/90 text-white text-[9px] rounded px-1.5 py-1 text-center z-20">
                {seenError}
              </div>
            )}
            <button
              onClick={toggleSeen}
              disabled={markingS}
              className={`flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full transition-colors ${
                seen ? "bg-green-600/80 text-white hover:bg-red-600/80" : "bg-white/90 text-black hover:bg-white"
              }`}
            >
              {seen ? <><EyeOff className="w-3 h-3" /> Unsee</> : <><Eye className="w-3 h-3" /> {markingS ? "..." : "Seen"}</>}
            </button>
            <button
              onClick={addToWatchlist}
              disabled={markingW || watchlisted}
              className={`flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full transition-colors ${
                watchlisted ? "bg-blue-600/80 text-white cursor-default" : "bg-white/90 text-black hover:bg-white"
              }`}
            >
              {watchlisted ? <><BookmarkCheck className="w-3 h-3" /> Listed</> : <><Bookmark className="w-3 h-3" /> {markingW ? "..." : "Watchlist"}</>}
            </button>
          </div>
        )}
      </div>
      {showRatings && (
        <div className="flex items-center gap-2 mt-0.5">
          <RatingBadge type="community" score={communityScore} size="sm" />
          <RatingBadge
            type="ratist"
            score={ratistRating ?? estimatedRating}
            isEstimate={ratistRating == null && estimatedRating != null}
            size="sm"
          />
        </div>
      )}
    </div>
  );
}
