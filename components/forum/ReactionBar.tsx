"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";

const REACTIONS = [
  { type: "thumbs-up", emoji: "👍", label: "Thumbs Up" },
  { type: "thumbs-down", emoji: "👎", label: "Thumbs Down" },
  { type: "applause", emoji: "👏", label: "Applause" },
  { type: "hot-take", emoji: "🔥", label: "Hot Take" },
  { type: "insightful", emoji: "💡", label: "Insightful" },
  { type: "popcorn", emoji: "🍿", label: "Popcorn" },
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

  // Sync with parent on auto-refresh
  useEffect(() => { setCounts(initialCounts); }, [initialCounts]);
  useEffect(() => { setUserReactions(initialUserReactions); }, [initialUserReactions]);

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

  return (
    <div className="flex items-center gap-1 mt-2">
      {REACTIONS.map((r) => {
        const count = counts[r.type] ?? 0;
        const active = userReactions.includes(r.type);
        return (
          <button
            key={r.type}
            onClick={() => toggleReaction(r.type)}
            disabled={!user}
            title={r.label}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-colors ${
              active
                ? "border-[var(--ratist-red)]/40 bg-[var(--ratist-red)]/10 text-white"
                : count > 0
                  ? "border-[var(--border)] bg-transparent text-[var(--foreground-muted)] hover:border-[var(--foreground-muted)]"
                  : "border-transparent text-[var(--foreground-muted)] opacity-40 hover:opacity-100"
            } ${!user ? "opacity-50 cursor-default" : "cursor-pointer"}`}
          >
            <span>{r.emoji}</span>
            {count > 0 && <span>{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
