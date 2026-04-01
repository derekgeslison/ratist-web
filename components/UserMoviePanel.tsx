"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Star, Eye, EyeOff, Check, Bookmark, BookmarkCheck, AlertCircle, Share2, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import type { RatingStatus } from "@/lib/rating-status";
import { useAuth } from "@/context/AuthContext";
import { scoreColor } from "@/lib/ratings";
import ShareButton from "./ShareButton";

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

const CATEGORY_FIELDS: { label: string; scoreKey: string; fields: { key: string; label: string }[] }[] = [
  { label: "Story", scoreKey: "storyScore", fields: [
    { key: "plot", label: "Plot" }, { key: "premiseOriginality", label: "Originality" },
    { key: "storytelling", label: "Storytelling" }, { key: "characterDev", label: "Character Dev" },
    { key: "pacingClimax", label: "Pacing" },
  ]},
  { label: "Style", scoreKey: "styleScore", fields: [
    { key: "cinematography", label: "Cinematography" }, { key: "locationCost", label: "Location & Costume" },
    { key: "artisticEffect", label: "Artistic Effect" }, { key: "visualEffects", label: "Visual Effects" },
    { key: "musicSound", label: "Music & Sound" },
  ]},
  { label: "Emotive", scoreKey: "emotiveScore", fields: [
    { key: "overallEmotion", label: "Emotion" }, { key: "relatability", label: "Relatability" },
    { key: "meaning", label: "Meaning" }, { key: "movingness", label: "Movingness" },
  ]},
  { label: "Acting", scoreKey: "actingScore", fields: [
    { key: "casting", label: "Casting" }, { key: "actingQuality", label: "Acting Quality" },
    { key: "dialogueScripting", label: "Dialogue" }, { key: "blockingChoreo", label: "Blocking & Choreo" },
  ]},
  { label: "Entertainment", scoreKey: "entertainScore", fields: [
    { key: "appeal", label: "Appeal" }, { key: "superficialAllure", label: "Superficial Allure" },
    { key: "choreography", label: "Choreography" },
  ]},
];

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
  const [estimatedRating, setEstimatedRating] = useState<number | null>(null);
  const [togglingSeeen, setTogglingSeeen] = useState(false);
  const [togglingWatchlist, setTogglingWatchlist] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [showRewatchModal, setShowRewatchModal] = useState(false);
  const [rewatchNotes, setRewatchNotes] = useState("");
  const [rewatchSaved, setRewatchSaved] = useState(false);
  const [loggingRewatch, setLoggingRewatch] = useState(false);

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
          setEstimatedRating(data.estimatedRating ?? null);
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

      {/* Personal rating or estimate */}
      {(displayScore != null || estimatedRating != null) && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider">
            {ratistScore != null ? "Your Rating" : isImported ? "Your Rating" : "Your Score Estimate"}
          </span>
          <div className="flex items-center gap-2">
            <Image src="/logo.png" alt="R" width={16} height={16} className="w-4 h-4 opacity-80" />
            {displayScore != null ? (
              <span className="text-lg font-bold" style={{ color: scoreColor(displayScore) }}>
                {displayScore.toFixed(1)}
              </span>
            ) : (
              <span className="text-lg font-bold italic" style={{ color: scoreColor(estimatedRating!) }}>
                ~{estimatedRating!.toFixed(1)}
              </span>
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
                  <button onClick={() => { setShowRewatchModal(false); setRewatchSaved(false); setRewatchNotes(""); }} className="text-sm text-[var(--foreground-muted)] hover:text-white transition-colors">
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <>
                <textarea
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
                        body: JSON.stringify({ notes: rewatchNotes }),
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

      {/* Community breakdown bars — expandable */}
      {communityAvg && communityAvg.count > 0 && (
        <div className="mt-2">
          <p className="text-xs text-[var(--foreground-muted)] mb-2">
            Community breakdown
          </p>
          {CATEGORY_FIELDS.map(({ label, scoreKey, fields }) => {
            const catScore = (communityAvg as unknown as Record<string, number | null>)[scoreKey];
            if (catScore == null) return null;
            const isExpanded = expandedCats.has(label);
            const fieldData = communityAvg.fields ?? {};
            const hasFields = fields.some((f) => fieldData[f.key] != null);
            return (
              <div key={label} className="mb-1">
                <button
                  onClick={() => hasFields && setExpandedCats((prev) => {
                    const next = new Set(prev);
                    if (next.has(label)) next.delete(label); else next.add(label);
                    return next;
                  })}
                  className={`flex items-center gap-2 w-full group ${hasFields ? "cursor-pointer" : "cursor-default"}`}
                >
                  <span className="text-xs text-[var(--foreground-muted)] w-24 shrink-0 text-left">{label}</span>
                  <div className="flex-1 h-1.5 bg-[var(--surface-2)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(catScore / 10) * 100}%`, backgroundColor: scoreColor(catScore) }} />
                  </div>
                  <span className="text-xs font-semibold w-7 text-right" style={{ color: scoreColor(catScore) }}>{catScore.toFixed(1)}</span>
                  {hasFields && (
                    isExpanded
                      ? <ChevronUp className="w-3 h-3 text-[var(--foreground-muted)]" />
                      : <ChevronDown className="w-3 h-3 text-[var(--foreground-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </button>
                {isExpanded && (
                  <div className="ml-6 mt-1 mb-2 space-y-1">
                    {fields.map(({ key, label: fLabel }) => {
                      const val = fieldData[key];
                      if (val == null) return null;
                      return (
                        <div key={key} className="flex items-center gap-2">
                          <span className="text-[10px] text-[var(--foreground-muted)] w-20 shrink-0">{fLabel}</span>
                          <div className="flex-1 h-1 bg-[var(--surface-2)] rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${(val / 10) * 100}%`, backgroundColor: scoreColor(val) }} />
                          </div>
                          <span className="text-[10px] font-semibold w-6 text-right" style={{ color: scoreColor(val) }}>{val.toFixed(1)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
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
