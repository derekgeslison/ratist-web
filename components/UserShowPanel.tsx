"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Star, Eye, Check, Bookmark, BookmarkCheck, AlertCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { scoreColor } from "@/lib/score-color";
import MarkSeenModal from "./MarkSeenModal";
import { useWatchlistFlow } from "./WatchlistFlow";

interface UserRating {
  ratistRating: number | null;
  overallRating: number | null;
  storyScore: number | null;
  styleScore: number | null;
  emotiveScore: number | null;
  actingScore: number | null;
  entertainScore: number | null;
}

interface CommunityAvg {
  ratistRating: number | null;
  ratistSum: number | null;
  storyScore: number | null;
  styleScore: number | null;
  emotiveScore: number | null;
  actingScore: number | null;
  entertainScore: number | null;
  count: number;
}

interface Props {
  tmdbId: number;
  showName: string;
  posterPath: string | null;
  tmdbScore: number | null;
  seasons?: { season_number: number; name: string; episode_count: number }[];
}

/** Hybrid community rating: TMDB score acts as 50 buffer reviews, replaced 1-for-1 by real Ratist reviews.
 *  When TMDB has no score, drop the buffer and return the pure Ratist average directly. */
function hybridCommunityRating(tmdbScore: number | null, count: number, ratistSum: number | null): number | null {
  if (tmdbScore == null) {
    if (count === 0 || ratistSum == null) return null;
    return Math.round((ratistSum / count) * 10) / 10;
  }
  const buffer = Math.max(0, 50 - count);
  const totalWeight = buffer + count;
  if (totalWeight === 0) return null;
  const sum = (tmdbScore * buffer) + (ratistSum ?? 0);
  return Math.round((sum / totalWeight) * 10) / 10;
}

export default function UserShowPanel({ tmdbId, showName, posterPath, tmdbScore, seasons }: Props) {
  const { user, loading: authLoading } = useAuth();
  const [seen, setSeen] = useState(false);
  const [watchlisted, setWatchlisted] = useState(false);
  const [userRating, setUserRating] = useState<UserRating | null>(null);
  const [ratingStatus, setRatingStatus] = useState<string | null>(null);
  const [communityAvg, setCommunityAvg] = useState<CommunityAvg | null>(null);
  const [estimatedRating, setEstimatedRating] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [markingSeen, setMarkingSeen] = useState(false);
  const [showSeenModal, setShowSeenModal] = useState(false);

  // Shared watchlist flow — see UserMoviePanel for rationale.
  const watchlistFlow = useWatchlistFlow({
    tmdbId,
    mediaType: "tv",
    title: showName,
    posterPath,
    onWatchlistedChange: setWatchlisted,
  });

  const count = communityAvg?.count ?? 0;
  const communityHybrid = hybridCommunityRating(tmdbScore, count, communityAvg?.ratistSum ?? null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoaded(true); setSeen(false); setWatchlisted(false); return; }
    let cancelled = false;
    user.getIdToken().then((token) =>
      fetch(`/api/shows/${tmdbId}/seen`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).then((r) => r.json())
    .then((data) => {
      if (cancelled) return;
      setSeen(!!data.seen);
      setWatchlisted(!!data.watchlisted);
      setUserRating(data.rating ?? null);
      setRatingStatus(data.ratingStatus ?? null);
      setCommunityAvg(data.communityAvg ?? null);
      setEstimatedRating(data.estimatedRating ?? null);
    })
    .catch(() => {})
    .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [user, tmdbId, authLoading]);

  const [seenError, setSeenError] = useState<string | null>(null);

  async function toggleSeen() {
    if (!user || markingSeen) return;
    setMarkingSeen(true);
    setSeenError(null);
    const token = await user.getIdToken();
    const res = await fetch(`/api/shows/${tmdbId}/seen`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: showName, poster_path: posterPath }),
    }).catch(() => null);
    if (res && !res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.hasRating) {
        setSeenError("You can't un-mark this as seen because you have a rating for it. Delete your rating first.");
        setTimeout(() => setSeenError(null), 5000);
      } else if (data.hasEpisodes) {
        setSeenError(data.error ?? "You have episodes marked as seen. Remove them first.");
        setTimeout(() => setSeenError(null), 6000);
      }
      setMarkingSeen(false);
      return false;
    } else if (res?.ok) {
      const data = await res.json();
      setSeen(data.seen);
      setMarkingSeen(false);
      return data.seen as boolean;
    }
    setMarkingSeen(false);
    return false;
  }

  async function handleSeenClick() {
    if (!user || markingSeen) return;
    if (seen) { toggleSeen(); return; }
    // Tap when not seen: mark show as seen FIRST, then surface the
    // optional series/seasons follow-up modal. Closing the modal
    // (X / click-away) leaves the show marked seen.
    const nowSeen = await toggleSeen();
    if (nowSeen && seasons && seasons.length > 0) {
      setShowSeenModal(true);
    }
  }

  const ratistScore = userRating?.ratistRating ?? null;
  const overallScore = userRating?.overallRating ?? null;
  const displayScore = ratistScore ?? overallScore;

  return (
    <div className="space-y-4">
      {/* Ratist Community Rating */}
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

      {/* Personal rating or estimate */}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider">
          {displayScore != null ? "Your Rating" : estimatedRating != null ? "Your Score Estimate" : "Ratist Rating"}
        </span>
        <div className="flex items-center gap-2">
          <Image src="/logo.png" alt="R" width={16} height={16} className="w-4 h-4 opacity-80" />
          {displayScore != null ? (
            <span className="text-lg font-bold" style={{ color: scoreColor(displayScore) }}>
              {displayScore.toFixed(1)}
            </span>
          ) : estimatedRating != null ? (
            <span className="text-lg font-bold italic" style={{ color: scoreColor(estimatedRating) }}>
              ~{estimatedRating.toFixed(1)}
            </span>
          ) : (
            <span className="text-lg font-bold text-[var(--foreground-muted)] cursor-help" title="Not enough Ratist data yet to generate a personalized estimate">
              –
            </span>
          )}
        </div>
        {displayScore == null && estimatedRating != null && (
          <span className="text-xs text-[var(--foreground-muted)] italic">Estimated for you · rate to lock it in</span>
        )}
        {displayScore == null && estimatedRating == null && (
          <span className="text-xs text-[var(--foreground-muted)]">Rate this show to get your real score</span>
        )}
      </div>

      {/* Action buttons */}
      {loaded && (
        <>
          {user ? (<>
            <div className="flex flex-wrap items-start gap-2">
              <div>
                <Link
                  href={`/shows/${tmdbId}/rate`}
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
                    <><Star className="w-4 h-4" /> Rate Show</>
                  )}
                </Link>
                <p className="text-[10px] text-[var(--foreground-muted)] mt-1 text-center">Series, seasons, or both</p>
              </div>
              <div className="relative">
                <button
                  onClick={handleSeenClick}
                  disabled={markingSeen}
                  className={`flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-full border transition-colors ${
                    seen
                      ? "border-green-500/40 bg-green-500/10 text-green-400 hover:bg-green-500/20"
                      : "border-[var(--border)] bg-[var(--surface-2)] text-white hover:border-[var(--ratist-red)]"
                  }`}
                >
                  {seen ? <><Check className="w-4 h-4" /> Seen</> : <><Eye className="w-4 h-4" /> {markingSeen ? "..." : "Mark Seen"}</>}
                </button>
                {seenError && (
                  <div className="absolute top-full left-0 mt-2 z-30 w-64 bg-[var(--surface)] border border-red-500/50 rounded-lg px-3 py-2 shadow-xl text-xs text-red-400">
                    {seenError}
                  </div>
                )}
              </div>
              <button
                onClick={watchlistFlow.handleClick}
                disabled={watchlistFlow.busy}
                className={`flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-full border transition-colors ${
                  watchlisted
                    ? "border-blue-500/40 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
                    : "border-[var(--border)] bg-[var(--surface-2)] text-white hover:border-[var(--ratist-red)]"
                }`}
              >
                {watchlisted ? <><BookmarkCheck className="w-4 h-4" /> Watchlisted</> : <><Bookmark className="w-4 h-4" /> {watchlistFlow.busy ? "..." : "Watchlist"}</>}
              </button>
              {watchlistFlow.picker}
            </div>
          </>) : (
            <p className="text-sm text-[var(--foreground-muted)]">
              <a href="/auth/signin" className="text-[var(--ratist-red)] hover:underline">Sign in</a>{" "}to track shows you&apos;ve watched.
            </p>
          )}
        </>
      )}
      {showSeenModal && seasons && (
        <MarkSeenModal
          showTmdbId={tmdbId}
          showName={showName}
          posterPath={posterPath}
          seasons={seasons}
          onClose={() => setShowSeenModal(false)}
          onComplete={(showSeen) => setSeen(showSeen)}
        />
      )}
    </div>
  );
}
