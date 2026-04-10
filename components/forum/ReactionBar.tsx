"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";

const REACTIONS = [
  { type: "great-take", emoji: "👏", label: "Great Take" },
  { type: "mind-blown", emoji: "🤯", label: "Mind Blown" },
  { type: "disagree", emoji: "🤔", label: "Disagree" },
  { type: "funny", emoji: "😂", label: "Funny" },
];

interface Props {
  postId: string;
  threadSlug: string;
  counts: Record<string, number>;
  userReactions: string[];
}

export default function ReactionBar({ postId, threadSlug, counts: initialCounts, userReactions: initialUserReactions }: Props) {
  const { user } = useAuth();
  const [counts, setCounts] = useState(initialCounts);
  const [userReactions, setUserReactions] = useState(initialUserReactions);

  async function toggleReaction(reactionType: string) {
    if (!user) return;
    const wasActive = userReactions.includes(reactionType);

    // Optimistic update
    setCounts((prev) => ({
      ...prev,
      [reactionType]: (prev[reactionType] ?? 0) + (wasActive ? -1 : 1),
    }));
    setUserReactions((prev) =>
      wasActive ? prev.filter((r) => r !== reactionType) : [...prev, reactionType]
    );

    const token = await user.getIdToken();
    const res = await fetch(`/api/forum/threads/${threadSlug}/react`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ postId, reactionType }),
    }).catch(() => null);

    if (res?.ok) {
      const data = await res.json();
      setCounts(data.counts);
      setUserReactions(data.userReactions);
    }
  }

  const hasAny = REACTIONS.some((r) => (counts[r.type] ?? 0) > 0);

  return (
    <div className="flex items-center gap-1 mt-2">
      {REACTIONS.map((r) => {
        const count = counts[r.type] ?? 0;
        const active = userReactions.includes(r.type);
        if (!user && count === 0) return null;
        return (
          <button
            key={r.type}
            onClick={() => toggleReaction(r.type)}
            disabled={!user}
            title={r.label}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-colors ${
              active
                ? "border-[var(--ratist-red)]/40 bg-[var(--ratist-red)]/10 text-white"
                : "border-[var(--border)] bg-transparent text-[var(--foreground-muted)] hover:border-[var(--foreground-muted)]"
            } ${!user ? "opacity-50 cursor-default" : "cursor-pointer"}`}
          >
            <span>{r.emoji}</span>
            {count > 0 && <span>{count}</span>}
          </button>
        );
      })}
      {!hasAny && user && (
        <div className="flex items-center gap-1">
          {REACTIONS.map((r) => (
            <button
              key={r.type}
              onClick={() => toggleReaction(r.type)}
              title={r.label}
              className="text-sm opacity-40 hover:opacity-100 transition-opacity"
            >
              {r.emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
