"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";

interface PollOption {
  id: string;
  label: string;
  _count?: { votes: number };
  votes?: number;
}

interface Props {
  threadSlug: string;
  options: PollOption[];
  userVote: string | null;
}

export default function PollDisplay({ threadSlug, options: initialOptions, userVote: initialUserVote }: Props) {
  const { user } = useAuth();
  const [options, setOptions] = useState(initialOptions);
  const [userVote, setUserVote] = useState(initialUserVote);
  const [voting, setVoting] = useState(false);

  // Sync with parent when props update (auto-refresh)
  useEffect(() => { setOptions(initialOptions); }, [initialOptions]);
  useEffect(() => { setUserVote(initialUserVote); }, [initialUserVote]);

  const totalVotes = options.reduce((s, o) => s + (o._count?.votes ?? o.votes ?? 0), 0);
  const hasVoted = !!userVote;

  async function castVote(optionId: string) {
    if (!user || voting) return;
    setVoting(true);
    const token = await user.getIdToken();
    const res = await fetch(`/api/forum/threads/${threadSlug}/poll/vote`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ optionId }),
    }).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setOptions(data.options.map((o: { id: string; label: string; votes: number }) => ({
        id: o.id, label: o.label, _count: { votes: o.votes },
      })));
      setUserVote(data.userVote);
    }
    setVoting(false);
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-4">
      <p className="text-sm font-semibold text-white mb-3">Poll</p>
      <div className="space-y-2">
        {options.map((o) => {
          const votes = o._count?.votes ?? o.votes ?? 0;
          const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
          const isSelected = userVote === o.id;
          return (
            <button
              key={o.id}
              onClick={() => castVote(o.id)}
              disabled={!user || voting}
              className={`w-full text-left rounded-lg border px-4 py-2.5 transition-colors relative overflow-hidden ${
                isSelected
                  ? "border-[var(--ratist-red)] bg-[var(--ratist-red)]/10"
                  : "border-[var(--border)] hover:border-[var(--foreground-muted)]"
              } ${!user ? "cursor-default" : "cursor-pointer"}`}
            >
              {hasVoted && (
                <div
                  className="absolute inset-y-0 left-0 bg-white/5 transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              )}
              <div className="relative flex items-center justify-between">
                <span className="text-sm text-white">{o.label}</span>
                {hasVoted && (
                  <span className="text-xs text-[var(--foreground-muted)]">
                    {votes} vote{votes !== 1 ? "s" : ""} ({pct}%)
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-[var(--foreground-muted)] mt-2">{totalVotes} total vote{totalVotes !== 1 ? "s" : ""}</p>
    </div>
  );
}
