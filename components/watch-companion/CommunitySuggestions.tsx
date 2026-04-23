"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { ThumbsUp, ThumbsDown, MessageSquare } from "lucide-react";

interface Suggestion {
  id: string;
  action: string;
  targetType: string;
  rationale: string | null;
  payload: Record<string, unknown> | null;
  upvoteScore: number;
  voteCount: number;
  createdAt: string;
  submitter: { id: string; name: string; avatarUrl: string | null };
}

export default function CommunitySuggestions({ companionId }: { companionId: string }) {
  const { user } = useAuth();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [myVotes, setMyVotes] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const headers: HeadersInit = {};
      if (user) headers["Authorization"] = `Bearer ${await user.getIdToken()}`;
      const res = await fetch(`/api/watch-companion/${companionId}/suggestions?status=pending`, { headers });
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions ?? []);
        setMyVotes(data.myVotes ?? {});
      }
      setLoading(false);
    })();
  }, [companionId, user]);

  async function vote(suggestionId: string, v: 1 | -1) {
    if (!user) return;
    const currentVote = myVotes[suggestionId] ?? 0;
    const nextVote = currentVote === v ? 0 : v; // tap the active button again to clear

    // Optimistic update
    setMyVotes((m) => ({ ...m, [suggestionId]: nextVote }));

    const token = await user.getIdToken();
    const res = await fetch(`/api/watch-companion/suggestions/${suggestionId}/vote`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ vote: nextVote }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      // Roll back on failure
      setMyVotes((m) => ({ ...m, [suggestionId]: currentVote }));
      return;
    }

    // Refresh list if auto-resolved; else update score for this one
    if (data?.autoResolved) {
      setSuggestions((s) => s.filter((x) => x.id !== suggestionId));
    } else if (data?.score) {
      setSuggestions((s) => s.map((x) =>
        x.id === suggestionId ? { ...x, upvoteScore: data.score.upvoteScore, voteCount: data.score.voteCount } : x,
      ));
    }
  }

  if (loading) return null;
  if (suggestions.length === 0) return null;

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="w-4 h-4 text-[var(--foreground-muted)]" />
        <h2 className="text-base font-semibold text-white">Community suggestions</h2>
        <span className="text-xs text-[var(--foreground-muted)]">({suggestions.length} pending)</span>
      </div>
      <p className="text-xs text-[var(--foreground-muted)] mb-3 leading-relaxed">
        Suggestions from the community. Vote to help surface the good ones — high-voted ones get applied automatically.
      </p>
      <div className="space-y-2">
        {suggestions.map((s) => {
          const mine = myVotes[s.id] ?? 0;
          return (
            <div key={s.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 flex gap-3">
              <div className="flex flex-col items-center gap-1 shrink-0">
                <button
                  onClick={() => vote(s.id, 1)}
                  disabled={!user}
                  className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${
                    mine === 1 ? "bg-green-500/20 text-green-400" : "text-[var(--foreground-muted)] hover:text-green-400 hover:bg-green-500/10"
                  }`}
                  aria-label="Upvote suggestion"
                >
                  <ThumbsUp className="w-4 h-4" />
                </button>
                <span className={`text-sm font-bold ${s.upvoteScore > 0 ? "text-green-400" : s.upvoteScore < 0 ? "text-red-400" : "text-[var(--foreground-muted)]"}`}>
                  {s.upvoteScore > 0 ? "+" : ""}{s.upvoteScore}
                </span>
                <button
                  onClick={() => vote(s.id, -1)}
                  disabled={!user}
                  className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${
                    mine === -1 ? "bg-red-500/20 text-red-400" : "text-[var(--foreground-muted)] hover:text-red-400 hover:bg-red-500/10"
                  }`}
                  aria-label="Downvote suggestion"
                >
                  <ThumbsDown className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-[10px] uppercase tracking-wider text-[var(--ratist-red)] font-semibold">
                    {s.action} {s.targetType.replace(/([A-Z])/g, " $1").toLowerCase()}
                  </span>
                  <span className="text-[10px] text-[var(--foreground-muted)]">by {s.submitter.name}</span>
                </div>
                {s.rationale && (
                  <p className="text-sm text-white leading-relaxed">{s.rationale}</p>
                )}
                {s.payload && Object.keys(s.payload).length > 0 && (
                  <details className="mt-1">
                    <summary className="text-[10px] text-[var(--foreground-muted)] cursor-pointer hover:text-white">details</summary>
                    <pre className="text-[10px] text-[var(--foreground-muted)] bg-[var(--surface-2)] rounded p-2 mt-1 overflow-x-auto">{JSON.stringify(s.payload, null, 2)}</pre>
                  </details>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
