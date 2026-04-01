"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Heart, ChevronDown, ChevronUp, AlertTriangle, MessageCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { scoreColor } from "@/lib/ratings";
import ReviewComments from "./ReviewComments";

interface ReviewData {
  id: string;
  reviewText: string | null;
  ratistRating: number | null;
  overallRating: number | null;
  storyScore: number | null;
  styleScore: number | null;
  emotiveScore: number | null;
  actingScore: number | null;
  entertainScore: number | null;
  reviewType: string;
  fieldComments: Record<string, string> | null;
  categoryComments: Record<string, string> | null;
  hasSpoilers: boolean;
  commentsDisabled: boolean;
  createdAt: string;
  commentCount: number;
  likeCount: number;
  likedByMe: boolean;
  user: { id: string; firebaseUid: string; name: string; avatarUrl: string | null };
}

interface Props {
  review: ReviewData;
  movieTmdbId?: number;
  /** Compact mode for movie page overview (fewer details) */
  compact?: boolean;
  /** When viewing the dedicated review page — hides redundant links */
  isFullPage?: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  story: "Story", style: "Production & Style", emotive: "Emotive Effect",
  acting: "Acting & Casting", entertainment: "Pure Entertainment",
};

export default function ReviewCard({ review, movieTmdbId, compact = false, isFullPage = false }: Props) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [spoilerRevealed, setSpoilerRevealed] = useState(false);
  const [liked, setLiked] = useState(review.likedByMe);
  const [likeCount, setLikeCount] = useState(review.likeCount);
  const [liking, setLiking] = useState(false);

  const score = review.ratistRating ?? review.overallRating;
  const hasBreakdown = review.storyScore != null || review.styleScore != null;
  const hasCriticComments = review.reviewType === "critic" &&
    ((review.fieldComments && Object.keys(review.fieldComments).length > 0) ||
     (review.categoryComments && Object.keys(review.categoryComments).length > 0));
  const isLongReview = (review.reviewText?.length ?? 0) > 300;

  async function toggleLike() {
    if (!user || liking) return;
    setLiking(true);
    const token = await user.getIdToken();
    const res = await fetch(`/api/reviews/${review.id}/like`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setLiked(data.liked);
      setLikeCount(data.count);
    }
    setLiking(false);
  }

  const showFullText = expanded || !isLongReview;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 p-4 pb-0">
        <Link href={`/profile/${review.user.firebaseUid}`} className="flex items-center gap-2.5 group shrink-0">
          <div className="relative w-8 h-8 rounded-full overflow-hidden bg-[var(--ratist-red)] flex items-center justify-center shrink-0">
            {review.user.avatarUrl ? (
              <Image src={review.user.avatarUrl} alt="" fill sizes="32px" className="object-cover" unoptimized />
            ) : (
              <span className="text-white text-xs font-bold">{review.user.name[0]?.toUpperCase()}</span>
            )}
          </div>
          <div>
            <span className="text-sm font-medium text-white group-hover:text-[var(--ratist-red)] transition-colors block leading-tight">
              {review.user.name}
            </span>
            <span className="text-xs text-[var(--foreground-muted)]">
              {new Date(review.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
          </div>
        </Link>
        <div className="flex items-center gap-3 shrink-0">
          {review.reviewType === "critic" && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">
              Critic
            </span>
          )}
          {score != null && (
            <span className="text-xl font-black" style={{ color: scoreColor(score) }}>
              {score.toFixed(1)}
            </span>
          )}
        </div>
      </div>

      {/* Review body */}
      <div className="px-4 py-3">
        {/* Spoiler gate */}
        {review.hasSpoilers && !spoilerRevealed ? (
          <button
            onClick={() => setSpoilerRevealed(true)}
            className="flex items-center gap-2 text-sm text-orange-400 hover:text-orange-300 transition-colors py-2"
          >
            <AlertTriangle className="w-4 h-4" />
            This review contains spoilers — tap to reveal
          </button>
        ) : (
          <>
            {review.reviewText && (
              <p className={`text-sm text-[var(--foreground-muted)] leading-relaxed whitespace-pre-line ${!showFullText ? "line-clamp-4" : ""}`}>
                {review.reviewText}
              </p>
            )}

            {/* Expand/collapse for long reviews */}
            {isLongReview && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 text-xs text-[var(--ratist-red)] hover:underline mt-2"
              >
                {expanded ? <><ChevronUp className="w-3 h-3" /> Show less</> : <><ChevronDown className="w-3 h-3" /> Read more</>}
              </button>
            )}
          </>
        )}
      </div>

      {/* Category breakdown (if not compact) */}
      {!compact && hasBreakdown && (
        <div className="px-4 pb-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 border-t border-[var(--border)]/30">
            {[
              { label: "Story", score: review.storyScore },
              { label: "Style", score: review.styleScore },
              { label: "Emotion", score: review.emotiveScore },
              { label: "Acting", score: review.actingScore },
              { label: "Fun", score: review.entertainScore },
            ].filter((p) => p.score != null).map((p) => (
              <span key={p.label} className="text-xs text-[var(--foreground-muted)]">
                {p.label}: <span className="font-semibold" style={{ color: scoreColor(p.score!) }}>{p.score!.toFixed(1)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Critic comments (expandable) */}
      {!compact && hasCriticComments && expanded && (
        <div className="px-4 pb-3">
          <div className="border-t border-[var(--border)]/30 pt-3 space-y-3">
            <p className="text-xs font-semibold text-purple-400 uppercase tracking-wider">Critic Commentary</p>
            {review.categoryComments && Object.entries(review.categoryComments).map(([key, comment]) => (
              <div key={key}>
                <p className="text-xs font-semibold text-[var(--foreground-muted)] mb-1">{CATEGORY_LABELS[key] ?? key}</p>
                <p className="text-sm text-[var(--foreground-muted)] leading-relaxed">{comment}</p>
              </div>
            ))}
            {review.fieldComments && Object.entries(review.fieldComments).map(([key, comment]) => (
              <div key={key}>
                <p className="text-xs text-[var(--foreground-muted)]/60 mb-0.5">{key}</p>
                <p className="text-xs text-[var(--foreground-muted)] leading-relaxed">{comment}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer: like button + comment count + links */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--border)]/30">
        <div className="flex items-center gap-4">
          <button
            onClick={toggleLike}
            disabled={!user || liking}
            className={`flex items-center gap-1.5 text-xs transition-colors ${
              liked ? "text-[var(--ratist-red)]" : "text-[var(--foreground-muted)] hover:text-[var(--ratist-red)]"
            } disabled:opacity-40`}
          >
            <Heart className={`w-3.5 h-3.5 ${liked ? "fill-current" : ""}`} />
            {likeCount > 0 && <span>{likeCount}</span>}
            {likeCount === 0 && !liked && <span>Like</span>}
          </button>
          {!review.commentsDisabled && (
            <span className="flex items-center gap-1 text-xs text-[var(--foreground-muted)]">
              <MessageCircle className="w-3.5 h-3.5" />
              {review.commentCount > 0 ? review.commentCount : ""}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {!isFullPage && hasCriticComments && !expanded && (
            <button
              onClick={() => setExpanded(true)}
              className="text-xs text-purple-400 hover:underline"
            >
              View commentary
            </button>
          )}
          {!isFullPage && movieTmdbId && (
            <Link
              href={`/movies/${movieTmdbId}/reviews/${review.id}`}
              className="text-xs text-[var(--foreground-muted)] hover:text-white transition-colors"
            >
              Full review →
            </Link>
          )}
        </div>
      </div>

      {/* Comments section — shown on full page and non-compact views */}
      {!compact && !review.commentsDisabled && (
        <ReviewComments reviewId={review.id} />
      )}
    </div>
  );
}
