"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Star, Eye, EyeOff, Check, Bookmark, BookmarkCheck, AlertCircle } from "lucide-react";
import type { RatingStatus } from "@/lib/rating-status";
import { useAuth } from "@/context/AuthContext";
import { scoreColor } from "@/lib/ratings";

interface CategoryAvg {
  ratistRating: number | null;
  ratistSum: number | null;
  storyScore: number | null;
  styleScore: number | null;
  emotiveScore: number | null;
  actingScore: number | null;
  entertainScore: number | null;
  count: number;
}

interface UserRating {
  ratistRating: number | null;
  storyScore: number | null;
  styleScore: number | null;
  emotiveScore: number | null;
  actingScore: number | null;
  entertainScore: number | null;
}

interface Props {
  tmdbId: number;
  movieTitle: string;
  posterPath: string | null;
  tmdbScore: number | null;
}

/** Hybrid community rating: TMDB score acts as 50 buffer reviews, replaced 1-for-1 by real Ratist reviews */
function hybridCommunityRating(tmdbScore: number | null, count: number, ratistSum: number | null): number | null {
  if (tmdbScore == null) return null;
  const buffer = Math.max(0, 50 - count);
  const totalWeight = buffer + count;
  if (totalWeight === 0) return null;
  const sum = (tmdbScore * buffer) + (ratistSum ?? 0);
  return Math.round((sum / totalWeight) * 10) / 10;
}

export default function UserMoviePanel({ tmdbId, movieTitle, posterPath, tmdbScore }: Props) {
  const { user, loading: authLoading } = useAuth();
  const [seen, setSeen] = useState(false);
  const [userRating, setUserRating] = useState<UserRating | null>(null);
  const [ratingStatus, setRatingStatus] = useState<RatingStatus | null>(null);
  const [communityAvg, setCommunityAvg] = useState<CategoryAvg | null>(null);
  const [watchlisted, setWatchlisted] = useState(false);
  const [togglingSeeen, setTogglingSeeen] = useState(false);
  const [togglingWatchlist, setTogglingWatchlist] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Don't mark loaded until Firebase auth has initialized
    if (authLoading) return;
    if (!user) { setLoaded(true); return; }
    user.getIdToken().then((token) => {
      fetch(`/api/movies/${tmdbId}/seen`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((data) => {
          setSeen(data.seen ?? false);
          setWatchlisted(data.watchlisted ?? false);
          setUserRating(data.rating ?? null);
          setRatingStatus(data.ratingStatus ?? null);
          setCommunityAvg(data.communityAvg ?? null);
          setLoaded(true);
        })
        .catch(() => setLoaded(true));
    });
  }, [user, tmdbId, authLoading]);

  async function toggleSeen() {
    if (!user) return;
    setTogglingSeeen(true);
    const token = await user.getIdToken();
    const res = await fetch(`/api/movies/${tmdbId}/seen`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: movieTitle, poster_path: posterPath }),
    });
    const data = await res.json();
    setSeen(data.seen ?? !seen);
    setTogglingSeeen(false);
  }

  async function toggleWatchlist() {
    if (!user) return;
    setTogglingWatchlist(true);
    const token = await user.getIdToken();
    const res = await fetch(`/api/movies/${tmdbId}/watchlist`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: movieTitle, poster_path: posterPath }),
    });
    const data = await res.json();
    setWatchlisted(data.watchlisted ?? !watchlisted);
    setTogglingWatchlist(false);
  }

  const ratistScore = userRating?.ratistRating ?? null;
  const count = communityAvg?.count ?? 0;
  const communityHybrid = hybridCommunityRating(tmdbScore, count, communityAvg?.ratistSum ?? null);

  return (
    <div className="space-y-4">
      {/* Community hybrid rating */}
      {communityHybrid != null && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider">
            Ratist Community Rating
            {count > 0 && <span className="ml-1 normal-case">· {count} Ratist review{count !== 1 ? "s" : ""}</span>}
          </span>
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4" style={{ color: scoreColor(communityHybrid) }} />
            <span className="text-lg font-bold" style={{ color: scoreColor(communityHybrid) }}>
              {communityHybrid.toFixed(1)}
            </span>
          </div>
        </div>
      )}

      {/* Personal rating */}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider flex items-center gap-1">
          <Image src="/logo.png" alt="R" width={12} height={12} className="w-3 h-3 opacity-70" />
          {ratistScore != null ? "Your Rating" : "Your Ratist Score Estimate"}
        </span>
        <div className="flex items-center gap-2">
          {ratistScore != null ? (
            <span className="text-base font-bold" style={{ color: scoreColor(ratistScore) }}>
              {ratistScore.toFixed(1)}
            </span>
          ) : (
            <span className="text-base font-bold text-[var(--foreground-muted)]">—</span>
          )}
        </div>
      </div>

      {/* Action buttons */}
      {loaded && (
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/movies/${tmdbId}/rate`}
            className={`flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-full transition-colors ${
              ratingStatus === "incomplete"
                ? "border border-orange-400 text-orange-400 hover:bg-orange-400 hover:text-white"
                : "border border-[var(--ratist-red)] text-[var(--ratist-red)] hover:bg-[var(--ratist-red)] hover:text-white"
            }`}
          >
            {ratingStatus === "complete" ? (
              <><Check className="w-4 h-4" /> Edit Rating</>
            ) : ratingStatus === "incomplete" ? (
              <><AlertCircle className="w-4 h-4" /> Complete Rating</>
            ) : (
              <><Star className="w-4 h-4" /> Rate Movie</>
            )}
          </Link>

          {user && (
            <>
              <button
                onClick={toggleSeen}
                disabled={togglingSeeen}
                className={`flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-full transition-colors ${
                  seen
                    ? "bg-[var(--surface-2)] border border-green-500/50 text-green-400 hover:border-red-500/50 hover:text-red-400"
                    : "bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-muted)] hover:border-[var(--ratist-red)] hover:text-white"
                }`}
              >
                {seen ? (
                  <><Eye className="w-4 h-4" /> Seen It</>
                ) : (
                  <><EyeOff className="w-4 h-4" /> Mark Seen</>
                )}
              </button>
              <button
                onClick={toggleWatchlist}
                disabled={togglingWatchlist}
                className={`flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-full transition-colors ${
                  watchlisted
                    ? "bg-[var(--surface-2)] border border-blue-500/50 text-blue-400 hover:border-red-500/50 hover:text-red-400"
                    : "bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-muted)] hover:border-blue-400 hover:text-white"
                }`}
              >
                {watchlisted ? (
                  <><BookmarkCheck className="w-4 h-4" /> Watchlisted</>
                ) : (
                  <><Bookmark className="w-4 h-4" /> Watchlist</>
                )}
              </button>
            </>
          )}
        </div>
      )}

      {/* Community breakdown bars */}
      {communityAvg && communityAvg.count > 0 && (
        <div className="mt-2">
          <p className="text-xs text-[var(--foreground-muted)] mb-2">
            Community breakdown
          </p>
          {[
            { label: "Story", score: communityAvg.storyScore },
            { label: "Style", score: communityAvg.styleScore },
            { label: "Emotive", score: communityAvg.emotiveScore },
            { label: "Acting", score: communityAvg.actingScore },
            { label: "Entertainment", score: communityAvg.entertainScore },
          ].map(({ label, score }) =>
            score != null ? (
              <div key={label} className="flex items-center gap-2 mb-1.5">
                <span className="text-xs text-[var(--foreground-muted)] w-24 shrink-0">{label}</span>
                <div className="flex-1 h-1.5 bg-[var(--surface-2)] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${(score / 10) * 100}%`, backgroundColor: scoreColor(score) }}
                  />
                </div>
                <span className="text-xs font-semibold w-7 text-right" style={{ color: scoreColor(score) }}>
                  {score.toFixed(1)}
                </span>
              </div>
            ) : null
          )}
        </div>
      )}

      {/* Sign-in prompt */}
      {!user && loaded && (
        <p className="text-xs text-[var(--foreground-muted)]">
          <Link href="/auth/signin" className="text-[var(--ratist-red)] hover:underline">Sign in</Link> to rate this movie and get your personal Ratist score.
        </p>
      )}
    </div>
  );
}
