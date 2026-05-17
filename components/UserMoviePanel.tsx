"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SignInLink from "@/components/SignInLink";
import Image from "next/image";
import { Star, Eye, EyeOff, Check, Bookmark, BookmarkCheck, AlertCircle, Share2, RotateCcw, CalendarDays } from "lucide-react";
import type { RatingStatus } from "@/lib/rating-status";
import { useAuth } from "@/context/AuthContext";
import { scoreColor } from "@/lib/score-color";
import ShareButton from "./ShareButton";
import TextareaWithEmoji from "./TextareaWithEmoji";
import { useWatchlistFlow } from "./WatchlistFlow";

interface CategoryAvg {
  ratistRating: number | null;
  ratistSum: number | null;
  storyScore: number | null;
  styleScore: number | null;
  emotiveScore: number | null;
  actingScore: number | null;
  entertainScore: number | null;
  count: number;
  fields?: Record<string, number | null>;
}

interface UserRating {
  ratistRating: number | null;
  overallRating: number | null;
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

/** Hybrid community rating: TMDB score acts as 50 buffer reviews, replaced 1-for-1 by real Ratist reviews.
 *  When TMDB has no score (obscure titles, very new releases), we drop the buffer and return the pure
 *  Ratist average directly — otherwise the badge stays blank even when our own community has rated. */
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

export default function UserMoviePanel({ tmdbId, movieTitle, posterPath, tmdbScore }: Props) {
  const { user, loading: authLoading } = useAuth();
  const [seen, setSeen] = useState(false);
  const [userRating, setUserRating] = useState<UserRating | null>(null);
  const [ratingStatus, setRatingStatus] = useState<RatingStatus | null>(null);
  const [communityAvg, setCommunityAvg] = useState<CategoryAvg | null>(null);
  const [watchlisted, setWatchlisted] = useState(false);
  const [estimatedRating, setEstimatedRating] = useState<number | null>(null);
  const [togglingSeeen, setTogglingSeeen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showRewatchModal, setShowRewatchModal] = useState(false);
  const [rewatchNotes, setRewatchNotes] = useState("");
  const [rewatchDate, setRewatchDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rewatchSaved, setRewatchSaved] = useState(false);
  const [loggingRewatch, setLoggingRewatch] = useState(false);

  // Shared watchlist flow: provides the click handler + the full-width
  // mobile picker modal that MovieCard / ShowCard use. Replaces the
  // anchored popup that was getting cut off on the right edge of mobile
  // viewports.
  const watchlistFlow = useWatchlistFlow({
    tmdbId,
    mediaType: "movie",
    title: movieTitle,
    posterPath,
    onWatchlistedChange: setWatchlisted,
  });

  useEffect(() => {
    // Don't mark loaded until Firebase auth has initialized
    if (authLoading) return;
    if (!user) { setLoaded(true); return; }
    user.getIdToken().then((token) => {
      fetch(`/api/movies/${tmdbId}/seen`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((data) => {
          setSeen(data.seen ?? false);
          if (data.watchedDate) setSeenDate(String(data.watchedDate).slice(0, 10));
          setWatchlisted(data.watchlisted ?? false);
          setUserRating(data.rating ?? null);
          setRatingStatus(data.ratingStatus ?? null);
          setCommunityAvg(data.communityAvg ?? null);
          setEstimatedRating(data.estimatedRating ?? null);
          setLoaded(true);
        })
        .catch(() => setLoaded(true));
    });
  }, [user, tmdbId, authLoading]);

  const [seenError, setSeenError] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [seenDate, setSeenDate] = useState("");
  const [savingDate, setSavingDate] = useState(false);

  async function saveSeenDate(date: string) {
    if (!user || !date) return;
    setSavingDate(true);
    const token = await user.getIdToken();
    await fetch(`/api/movies/${tmdbId}/seen`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ watchedDate: date }),
    }).catch(() => null);
    setSeenDate(date);
    setShowDatePicker(false);
    setSavingDate(false);
  }

  async function toggleSeen() {
    if (!user) return;
    setTogglingSeeen(true);
    setSeenError(null);
    const token = await user.getIdToken();
    const res = await fetch(`/api/movies/${tmdbId}/seen`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: movieTitle, poster_path: posterPath }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.hasRating) { setSeenError("You can't un-mark this as seen because you have a rating for it. Delete your rating first."); setTimeout(() => setSeenError(null), 5000); }
    } else {
      const data = await res.json();
      setSeen(data.seen ?? !seen);
      // Reflect the server-set watch date (today if autoDateOnSeen,
      // null otherwise) so the calendar opens to the right value.
      // On un-mark, watchedDate isn't returned — clear local state.
      if (data.seen) {
        setSeenDate(data.watchedDate ? String(data.watchedDate).slice(0, 10) : "");
      } else {
        setSeenDate("");
      }
    }
    setTogglingSeeen(false);
  }

  const ratistScore = userRating?.ratistRating ?? null;
  const overallScore = userRating?.overallRating ?? null;
  const displayScore = ratistScore ?? overallScore; // Show ratist score, or overall if imported
  const isImported = ratingStatus === "imported";
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

      {/* Personal rating or estimate — always show R badge */}
      {loaded && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider">
            {ratistScore != null ? "Your Rating" : isImported ? "Your Rating" : estimatedRating != null ? "Your Score Estimate" : "Ratist Rating"}
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
              <span className="text-lg font-bold text-[var(--foreground-muted)]">—</span>
            )}
            {isImported && (
              <span className="text-xs text-blue-400 cursor-help" title="Complete the full Ratist review for better taste matching">
                <svg className="w-4 h-4 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              </span>
            )}
          </div>
          {displayScore == null && estimatedRating != null && (
            <span className="text-xs text-[var(--foreground-muted)]">Rate this movie to get your real score</span>
          )}
        </div>
      )}

      {/* Action buttons */}
      {loaded && (
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/movies/${tmdbId}/rate`}
            className={`flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-full transition-colors ${
              ratingStatus === "incomplete" || ratingStatus === "imported"
                ? "border border-orange-400 text-orange-400 hover:bg-orange-400 hover:text-white"
                : "border border-[var(--ratist-red)] text-[var(--ratist-red)] hover:bg-[var(--ratist-red)] hover:text-white"
            }`}
          >
            {ratingStatus === "complete" ? (
              <><Check className="w-4 h-4" /> Edit Rating</>
            ) : ratingStatus === "incomplete" || ratingStatus === "imported" ? (
              <><AlertCircle className="w-4 h-4" /> Complete Rating</>
            ) : (
              <><Star className="w-4 h-4" /> Rate Movie</>
            )}
          </Link>

          {user && (
            <>
              <div className="relative flex items-center gap-1">
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
                {seen && (
                  <button
                    onClick={() => setShowDatePicker(!showDatePicker)}
                    title="Set watched date"
                    className="p-1 text-[var(--foreground-muted)] hover:text-white transition-colors"
                  >
                    <CalendarDays className="w-3.5 h-3.5" />
                  </button>
                )}
                {seenError && (
                  <div className="absolute top-full left-0 mt-2 z-30 w-64 bg-[var(--surface)] border border-red-500/50 rounded-lg px-3 py-2 shadow-xl text-xs text-red-400">
                    {seenError}
                  </div>
                )}
                {showDatePicker && (
                  <div className="absolute top-full left-0 mt-2 z-30 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 shadow-xl">
                    <p className="text-xs text-[var(--foreground-muted)] mb-2">When did you watch this?</p>
                    <input
                      type="date"
                      value={seenDate}
                      onChange={(e) => setSeenDate(e.target.value)}
                      max={new Date().toISOString().slice(0, 10)}
                      className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)] mb-2 w-full"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveSeenDate(seenDate)}
                        disabled={!seenDate || savingDate}
                        className="px-3 py-1 bg-[var(--ratist-red)] text-white text-xs font-semibold rounded-lg disabled:opacity-50"
                      >
                        {savingDate ? "..." : "Save"}
                      </button>
                      <button onClick={() => setShowDatePicker(false)} className="px-3 py-1 text-xs text-[var(--foreground-muted)] hover:text-white">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
              <button
                onClick={watchlistFlow.handleClick}
                disabled={watchlistFlow.busy}
                className={`flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-full transition-colors ${
                  watchlisted
                    ? "bg-[var(--surface-2)] border border-blue-500/50 text-blue-400 hover:text-blue-300"
                    : "bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-muted)] hover:border-blue-400 hover:text-white"
                }`}
              >
                {watchlisted ? (
                  <><BookmarkCheck className="w-4 h-4" /> Watchlisted</>
                ) : (
                  <><Bookmark className="w-4 h-4" /> Watchlist</>
                )}
              </button>
              {watchlistFlow.picker}
              {/* Log Rewatch — only when already seen */}
              {seen && (
                <button
                  onClick={() => setShowRewatchModal(true)}
                  className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-full bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-muted)] hover:border-[var(--ratist-red)] hover:text-white transition-colors"
                >
                  <RotateCcw className="w-4 h-4" /> Log Rewatch
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Rewatch modal */}
      {showRewatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setShowRewatchModal(false); }}>
          <div className="w-full max-w-sm bg-[var(--background)] border border-[var(--border)] rounded-2xl p-6 mx-4">
            <h3 className="text-base font-semibold text-white mb-1">Log Rewatch</h3>
            <p className="text-xs text-[var(--foreground-muted)] mb-4">{movieTitle}</p>
            {rewatchSaved ? (
              <div className="text-center py-4">
                <p className="text-sm text-green-400 font-semibold mb-3">Rewatch logged!</p>
                <div className="flex flex-col gap-2">
                  <Link href={`/movies/${tmdbId}/rate`} className="text-sm text-[var(--ratist-red)] hover:underline">
                    Update your rating →
                  </Link>
                  <button onClick={() => { setShowRewatchModal(false); setRewatchSaved(false); setRewatchNotes(""); setRewatchDate(new Date().toISOString().slice(0, 10)); }} className="text-sm text-[var(--foreground-muted)] hover:text-white transition-colors">
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="mb-3">
                  <label className="block text-xs font-medium text-[var(--foreground-muted)] mb-1">Date watched</label>
                  <input
                    type="date"
                    value={rewatchDate}
                    onChange={(e) => setRewatchDate(e.target.value)}
                    max={new Date().toISOString().slice(0, 10)}
                    className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)]"
                  />
                </div>
                <TextareaWithEmoji
                  value={rewatchNotes}
                  onChange={(e) => setRewatchNotes(e.target.value)}
                  placeholder="Any thoughts on this rewatch? (optional)"
                  rows={3}
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] resize-none mb-4"
                />
                <div className="flex gap-3">
                  <button
                    onClick={async () => {
                      if (!user) return;
                      setLoggingRewatch(true);
                      const token = await user.getIdToken();
                      await fetch(`/api/movies/${tmdbId}/rewatch`, {
                        method: "POST",
                        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                        body: JSON.stringify({ notes: rewatchNotes, watchedDate: rewatchDate }),
                      });
                      setLoggingRewatch(false);
                      setRewatchSaved(true);
                    }}
                    disabled={loggingRewatch}
                    className="flex-1 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50"
                  >
                    {loggingRewatch ? "Saving..." : "Log Rewatch"}
                  </button>
                  <button onClick={() => setShowRewatchModal(false)} className="px-4 border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white rounded-xl transition-colors">
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Share rating — links to public rating page with OG image */}
      {(ratingStatus === "complete" || ratingStatus === "imported") && displayScore != null && user && (
        <div>
          <ShareButton
            label="Share my rating"
            text={`I rated ${movieTitle} ${displayScore!.toFixed(1)}/10 on The Ratist.`}
            url={`${process.env.NEXT_PUBLIC_SITE_URL ?? "https://theratist.com"}/profile/${user.uid}/rating/${tmdbId}`}
            cardImageUrl={`/api/og/rating?userId=${encodeURIComponent(user.uid)}&tmdbId=${tmdbId}`}
          />
        </div>
      )}

      {/* Community breakdown moved out of this panel — now rendered
          full-width below the poster+details row by the page so the
          bars aren't squeezed into the narrow right column on mobile.
          See <CommunityBreakdown /> on /movies/[id]/page.tsx. */}

      {/* Sign-in prompt */}
      {!user && loaded && (
        <p className="text-xs text-[var(--foreground-muted)]">
          <SignInLink className="text-[var(--ratist-red)] hover:underline">Sign in</SignInLink> to rate this movie and get your personal Ratist score.
        </p>
      )}
    </div>
  );
}
