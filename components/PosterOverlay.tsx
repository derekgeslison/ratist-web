"use client";

import { useState } from "react";
import { Eye, Bookmark, BookmarkCheck, Check } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useMovieUserState } from "@/hooks/useMovieUserState";
import RatingBadge from "./RatingBadge";

interface Props {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  releaseDate?: string | null;
  voteAverage?: number | null;
  showRatings?: boolean;
  children: React.ReactNode;
}

export default function PosterOverlay({ tmdbId, title, posterPath, releaseDate, voteAverage, showRatings = false, children }: Props) {
  const { user } = useAuth();
  const { seen, watchlisted, ratistRating, estimatedRating, markSeen: persistSeen, setWatchlistState } = useMovieUserState(tmdbId);
  const [markingS, setMarkingS] = useState(false);
  const [markingW, setMarkingW] = useState(false);

  const communityScore = voteAverage && voteAverage > 0 ? voteAverage : null;

  async function markSeen(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    if (!user || markingS || seen) return;
    setMarkingS(true);
    const token = await user.getIdToken();
    await fetch(`/api/movies/${tmdbId}/seen`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title, poster_path: posterPath, release_date: releaseDate }),
    }).catch(() => null);
    persistSeen();
    setMarkingS(false);
  }

  async function addToWatchlist(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    if (!user || markingW || watchlisted) return;
    setMarkingW(true);
    const token = await user.getIdToken();
    const res = await fetch(`/api/movies/${tmdbId}/watchlist`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title, poster_path: posterPath, release_date: releaseDate }),
    }).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setWatchlistState(data.watchlisted ?? true);
    }
    setMarkingW(false);
  }

  return (
    <div className="relative group/poster">
      {children}
      {user && (
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/poster:opacity-100 transition-opacity flex flex-col items-center justify-end gap-1.5 pb-2 rounded-lg">
          <button
            onClick={markSeen}
            disabled={markingS || seen}
            className={`flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full transition-colors ${
              seen ? "bg-green-600/80 text-white cursor-default" : "bg-white/90 text-black hover:bg-white"
            }`}
          >
            {seen ? <><Check className="w-3 h-3" /> Seen</> : <><Eye className="w-3 h-3" /> {markingS ? "..." : "Seen"}</>}
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
