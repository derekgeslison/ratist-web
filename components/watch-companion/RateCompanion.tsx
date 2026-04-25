"use client";

import { useEffect, useState } from "react";
import { ThumbsUp, ThumbsDown, Check, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface Props {
  companionId: string;
}

interface Rating {
  vote: 1 | -1;
  comment: string | null;
}

/**
 * Per-companion thumbs-up / thumbs-down with an optional comment box.
 * Counts are admin-only — this widget never shows aggregates so a
 * brigaded show can't visibly trash a companion before the moderator
 * gets a chance to fix it. Voting is immediate (single tap) and the
 * comment is a follow-up the user can submit later, change, or skip.
 *
 * Hidden when the user isn't signed in. We don't even render the
 * sign-in prompt here — the rest of the companion already gates write
 * actions, and adding another nudge at the very top would crowd the
 * sticky header.
 */
export default function RateCompanion({ companionId }: Props) {
  const { user } = useAuth();
  const [rating, setRating] = useState<Rating | null>(null);
  const [comment, setComment] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState<"up" | "down" | "comment" | null>(null);
  const [commentSaved, setCommentSaved] = useState(false);
  const [error, setError] = useState("");

  // Fetch existing rating on mount so the user sees their previous
  // vote highlighted when they revisit the page.
  useEffect(() => {
    if (!user) { setLoaded(true); return; }
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/watch-companion/${companionId}/rate`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) return;
        const data = await res.json() as { rating: Rating | null };
        if (cancelled) return;
        setRating(data.rating);
        if (data.rating?.comment) setComment(data.rating.comment);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [user, companionId]);

  if (!user) return null;
  if (!loaded) return null; // brief flicker is preferable to a wrong-state widget

  async function vote(next: 1 | -1) {
    if (!user) return;
    setError("");
    setSaving(next === 1 ? "up" : "down");
    // Optimistic — flip the highlight before the network round-trip
    // resolves. A failed save reverts in the catch block.
    const previous = rating;
    setRating({ vote: next, comment: rating?.comment ?? null });
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/watch-companion/${companionId}/rate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ vote: next }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error ?? "Couldn't save your rating.");
        setRating(previous);
        return;
      }
    } catch {
      setError("Network error — please try again.");
      setRating(previous);
    } finally {
      setSaving(null);
    }
  }

  async function submitComment() {
    if (!user || !rating) return;
    setError("");
    setSaving("comment");
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/watch-companion/${companionId}/rate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ vote: rating.vote, comment: comment.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error ?? "Couldn't save your comment.");
        return;
      }
      setRating({ vote: rating.vote, comment: comment.trim() || null });
      setCommentSaved(true);
      setTimeout(() => setCommentSaved(false), 2000);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 -mt-2">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs text-[var(--foreground-muted)]">Was this companion helpful?</span>
        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={() => vote(1)}
            disabled={saving !== null}
            aria-label="Thumbs up"
            aria-pressed={rating?.vote === 1}
            className={`p-1.5 rounded-full border transition-colors disabled:opacity-50 ${
              rating?.vote === 1
                ? "bg-green-500/15 border-green-500/50 text-green-400"
                : "bg-[var(--surface-2)] border-[var(--border)] text-[var(--foreground-muted)] hover:text-green-400 hover:border-green-500/40"
            }`}
          >
            {saving === "up" ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsUp className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => vote(-1)}
            disabled={saving !== null}
            aria-label="Thumbs down"
            aria-pressed={rating?.vote === -1}
            className={`p-1.5 rounded-full border transition-colors disabled:opacity-50 ${
              rating?.vote === -1
                ? "bg-red-500/15 border-red-500/50 text-red-400"
                : "bg-[var(--surface-2)] border-[var(--border)] text-[var(--foreground-muted)] hover:text-red-400 hover:border-red-500/40"
            }`}
          >
            {saving === "down" ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Comment box appears once the user has voted — keeps the initial
         widget compact and rewards a tap with "tell us more". The user
         can change their mind on the comment and resubmit; the textarea
         stays in sync with the saved value. */}
      {rating && (
        <div className="mt-2 pt-2 border-t border-[var(--border)]/40 space-y-2">
          <textarea
            value={comment}
            onChange={(e) => { setComment(e.target.value.slice(0, 1000)); setCommentSaved(false); }}
            rows={2}
            placeholder={
              rating.vote === 1
                ? "Optional — what worked for you?"
                : "Optional — what's off about this companion? Inaccurate beats, missing characters, anything."
            }
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1.5 text-xs text-white placeholder:text-[var(--foreground-muted)]/50 focus:outline-none focus:border-[var(--ratist-red)] resize-y"
            maxLength={1000}
          />
          <div className="flex items-center justify-end gap-2 text-[10px] text-[var(--foreground-muted)]">
            {commentSaved && (
              <span className="text-green-400 inline-flex items-center gap-1"><Check className="w-3 h-3" /> Saved</span>
            )}
            <span className="text-[var(--foreground-muted)]/60">{comment.length}/1000</span>
            <button
              type="button"
              onClick={submitComment}
              disabled={saving !== null || comment === (rating.comment ?? "")}
              className="px-2.5 py-1 rounded bg-[var(--ratist-red)] text-white text-[10px] font-semibold hover:bg-[var(--ratist-red)]/80 transition-colors disabled:opacity-40"
            >
              {saving === "comment" ? "Saving…" : (rating.comment ? "Update comment" : "Submit comment")}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-2 text-[11px] text-red-400">{error}</p>
      )}
    </div>
  );
}
