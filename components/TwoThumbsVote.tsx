"use client";

/**
 * Two Thumbs vote bar — thumbs-up vs thumbs-down poll on a Two Thumbs
 * post. Mirrors the forum debate poll shape: vote your side, see the
 * split, change your mind by re-voting or clearing.
 */

import { useEffect, useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import SignInLink from "@/components/SignInLink";
import { useAuth } from "@/context/AuthContext";

interface Tally {
  up: number;
  down: number;
  total: number;
  myVote: "up" | "down" | null;
}

interface Props {
  slug: string;
}

export default function TwoThumbsVote({ slug }: Props) {
  const { user } = useAuth();
  const [tally, setTally] = useState<Tally | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const headers: Record<string, string> = {};
      if (user) {
        const token = await user.getIdToken();
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch(`/api/two-thumbs/${slug}/vote`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (!cancelled) setTally(data);
      }
    })();
    return () => { cancelled = true; };
  }, [slug, user]);

  async function castVote(vote: "up" | "down") {
    if (!user || submitting) return;
    setSubmitting(true);
    const token = await user.getIdToken();
    // Toggle off if clicking the same side again
    const sameAsCurrent = tally?.myVote === vote;
    const res = await fetch(`/api/two-thumbs/${slug}/vote`, {
      method: sameAsCurrent ? "DELETE" : "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: sameAsCurrent ? undefined : JSON.stringify({ vote }),
    });
    if (res.ok) {
      const data = await res.json();
      setTally(data);
    }
    setSubmitting(false);
  }

  if (!tally) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 my-8">
        <p className="text-xs text-[var(--foreground-muted)]">Loading vote…</p>
      </div>
    );
  }

  const upPct = tally.total > 0 ? Math.round((tally.up / tally.total) * 100) : 0;
  const downPct = tally.total > 0 ? 100 - upPct : 0;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 my-8">
      <p className="text-sm font-semibold text-white mb-1">Which side do you agree with?</p>
      <p className="text-xs text-[var(--foreground-muted)] mb-4">
        {tally.total === 0
          ? "Be the first to weigh in."
          : `${tally.total.toLocaleString()} vote${tally.total === 1 ? "" : "s"} so far.`}
      </p>

      {!user ? (
        <p className="text-xs text-[var(--foreground-muted)] mb-4">
          <SignInLink className="text-[var(--ratist-red)] hover:underline">Sign in</SignInLink> to vote.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        {/* Thumbs up */}
        <button
          onClick={() => castVote("up")}
          disabled={!user || submitting}
          className={`group relative overflow-hidden rounded-lg border p-4 text-left transition-colors ${
            tally.myVote === "up"
              ? "border-emerald-500/60 bg-emerald-500/10"
              : "border-[var(--border)] bg-[var(--surface-2)] hover:border-emerald-500/40"
          } disabled:cursor-not-allowed disabled:opacity-60`}
        >
          <div className="flex items-center justify-between mb-2 relative z-10">
            <div className="flex items-center gap-2">
              <ThumbsUp className={`w-4 h-4 ${tally.myVote === "up" ? "text-emerald-400" : "text-[var(--foreground-muted)]"}`} />
              <span className="text-sm font-medium text-white">Thumbs up</span>
            </div>
            <span className={`text-xs font-bold ${tally.myVote === "up" ? "text-emerald-400" : "text-[var(--foreground-muted)]"}`}>
              {upPct}%
            </span>
          </div>
          <div className="h-1.5 bg-[var(--surface)] rounded-full overflow-hidden relative z-10">
            <div className="h-full bg-emerald-500/70 rounded-full transition-all duration-300" style={{ width: `${upPct}%` }} />
          </div>
          <p className="text-[10px] text-[var(--foreground-muted)] mt-2 relative z-10">{tally.up.toLocaleString()} vote{tally.up === 1 ? "" : "s"}</p>
        </button>

        {/* Thumbs down */}
        <button
          onClick={() => castVote("down")}
          disabled={!user || submitting}
          className={`group relative overflow-hidden rounded-lg border p-4 text-left transition-colors ${
            tally.myVote === "down"
              ? "border-red-500/60 bg-red-500/10"
              : "border-[var(--border)] bg-[var(--surface-2)] hover:border-red-500/40"
          } disabled:cursor-not-allowed disabled:opacity-60`}
        >
          <div className="flex items-center justify-between mb-2 relative z-10">
            <div className="flex items-center gap-2">
              <ThumbsDown className={`w-4 h-4 ${tally.myVote === "down" ? "text-red-400" : "text-[var(--foreground-muted)]"}`} />
              <span className="text-sm font-medium text-white">Thumbs down</span>
            </div>
            <span className={`text-xs font-bold ${tally.myVote === "down" ? "text-red-400" : "text-[var(--foreground-muted)]"}`}>
              {downPct}%
            </span>
          </div>
          <div className="h-1.5 bg-[var(--surface)] rounded-full overflow-hidden relative z-10">
            <div className="h-full bg-red-500/70 rounded-full transition-all duration-300" style={{ width: `${downPct}%` }} />
          </div>
          <p className="text-[10px] text-[var(--foreground-muted)] mt-2 relative z-10">{tally.down.toLocaleString()} vote{tally.down === 1 ? "" : "s"}</p>
        </button>
      </div>

      {tally.myVote && (
        <p className="text-[10px] text-[var(--foreground-muted)] mt-3">
          You voted <strong className={tally.myVote === "up" ? "text-emerald-400" : "text-red-400"}>{tally.myVote === "up" ? "thumbs up" : "thumbs down"}</strong>. Click the same side again to clear your vote.
        </p>
      )}
    </div>
  );
}
