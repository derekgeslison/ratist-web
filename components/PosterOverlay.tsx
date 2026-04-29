"use client";

import { useState } from "react";
import { Eye, EyeOff, Bookmark, BookmarkCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useMovieUserState } from "@/hooks/useMovieUserState";
import { useShowUserState } from "@/hooks/useShowUserState";
import { useTouchReveal } from "@/hooks/useTouchReveal";
import { useWatchlistFlow } from "./WatchlistFlow";
import RatingBadge from "./RatingBadge";

interface Props {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  releaseDate?: string | null;
  voteAverage?: number | null;
  showRatings?: boolean;
  mediaType?: "movie" | "tv";
  /** Hide the Seen button — for tiles where "seen" doesn't apply
   *  (e.g. upcoming releases). Watchlist still shows. */
  watchlistOnly?: boolean;
  children: React.ReactNode;
}

export default function PosterOverlay({ tmdbId, title, posterPath, releaseDate, voteAverage, showRatings = false, mediaType = "movie", watchlistOnly = false, children }: Props) {
  const { user } = useAuth();
  const movieState = useMovieUserState(mediaType === "movie" ? tmdbId : 0);
  const showState = useShowUserState(mediaType === "tv" ? tmdbId : 0);

  const state = mediaType === "movie" ? movieState : showState;
  const { seen, watchlisted, markSeen: persistSeen, markUnseen: persistUnseen, setWatchlistState } = state;
  const ratistRating = mediaType === "movie" ? movieState.ratistRating : null;
  const estimatedRating = mediaType === "movie" ? movieState.estimatedRating : null;

  const [markingS, setMarkingS] = useState(false);
  const [seenError, setSeenError] = useState<string | null>(null);

  const communityScore = voteAverage && voteAverage > 0 ? voteAverage : null;

  // Watchlist click flow goes through the shared hook so the picker
  // modal, autoAddToDefault setting, and create-list inline form are
  // all consistent with MovieCard / ShowCard / list rows. Without the
  // hook this overlay was the odd one out — direct POST that ignored
  // the user's autoAdd preference and never opened a picker.
  const watchlistFlow = useWatchlistFlow({
    tmdbId,
    mediaType,
    title,
    posterPath,
    releaseDate,
    onWatchlistedChange: setWatchlistState,
  });

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

  const touch = useTouchReveal();
  const overlayClass = `tile-hover-overlay${touch.revealed ? " revealed" : ""}`;

  return (
    <div className="tile-hover-parent group/poster" {...touch.containerProps}>
      <div className="relative">
        {children}
        {user && (
          <div className={`${overlayClass} absolute inset-0 bg-black/50 flex flex-col items-center justify-end gap-2 pb-3 rounded-lg z-10`}>
            {seenError && (
              <div className="absolute top-2 left-2 right-2 bg-red-900/90 text-white text-[10px] rounded-lg px-2 py-1.5 text-center z-20">
                {seenError}
              </div>
            )}
            {!watchlistOnly && (
              <button
                onClick={toggleSeen}
                disabled={markingS}
                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                  seen ? "bg-green-600/80 text-white hover:bg-red-600/80" : "bg-white/90 text-black hover:bg-white"
                }`}
              >
                {seen ? <><EyeOff className="w-3.5 h-3.5" /> Unsee</> : <><Eye className="w-3.5 h-3.5" /> {markingS ? "..." : "Mark Seen"}</>}
              </button>
            )}
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
