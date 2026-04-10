"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

interface Debater {
  id: string;
  firebaseUid: string;
  name: string;
  avatarUrl: string | null;
  _count?: { userBadges: number; ratings: number };
}

interface Props {
  threadSlug: string;
  op: Debater;
  opponent: Debater | null;
  voteCounts: { op: number; opponent: number } | null;
  userVote: string | null;
  onJoin?: () => void;
}

export default function DebateView({ threadSlug, op, opponent, voteCounts, userVote: initialVote, onJoin }: Props) {
  const { user } = useAuth();
  const [userVote, setUserVote] = useState(initialVote);
  const [counts, setCounts] = useState(voteCounts ?? { op: 0, opponent: 0 });
  const [voting, setVoting] = useState(false);
  const [joining, setJoining] = useState(false);

  const isDebater = user && (user.uid === op.firebaseUid || user.uid === opponent?.firebaseUid);

  async function castVote(side: "op" | "opponent") {
    if (!user || voting || isDebater) return;
    setVoting(true);
    const token = await user.getIdToken();
    const res = await fetch(`/api/forum/threads/${threadSlug}/debate/vote`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ side }),
    }).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setCounts({ op: data.op, opponent: data.opponent });
      setUserVote(data.userVote);
    }
    setVoting(false);
  }

  async function joinDebate() {
    if (!user || joining) return;
    setJoining(true);
    const token = await user.getIdToken();
    const res = await fetch(`/api/forum/threads/${threadSlug}/debate/join`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => null);
    if (res?.ok) {
      onJoin?.();
    }
    setJoining(false);
  }

  const total = counts.op + counts.opponent;
  const opPct = total > 0 ? Math.round((counts.op / total) * 100) : 50;

  function DebaterCard({ debater, label, side }: { debater: Debater; label: string; side: "op" | "opponent" }) {
    const isVoted = userVote === side;
    return (
      <div className={`flex-1 bg-[var(--surface)] border rounded-xl p-4 text-center transition-colors ${isVoted ? "border-[var(--ratist-red)]" : "border-[var(--border)]"}`}>
        <div className="relative w-12 h-12 rounded-full overflow-hidden mx-auto mb-2 bg-[var(--surface-2)]">
          {debater.avatarUrl ? (
            <Image src={debater.avatarUrl} alt="" fill sizes="48px" className="object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-lg font-bold text-white bg-[var(--ratist-red)]">{debater.name[0]}</div>
          )}
        </div>
        <Link href={`/profile/${debater.firebaseUid}`} className="text-sm font-semibold text-white hover:text-[var(--ratist-red)]">{debater.name}</Link>
        <p className="text-[10px] text-[var(--foreground-muted)]">{label}</p>
        {debater._count && (
          <p className="text-[10px] text-[var(--foreground-muted)] mb-2">{debater._count.ratings} ratings · {debater._count.userBadges} badges</p>
        )}
        {opponent && !isDebater && user && (
          <button
            onClick={() => castVote(side)}
            disabled={voting}
            className={`text-xs font-semibold px-3 py-1 rounded-full border transition-colors ${
              isVoted ? "border-[var(--ratist-red)] bg-[var(--ratist-red)]/20 text-[var(--ratist-red)]" : "border-[var(--border)] text-[var(--foreground-muted)] hover:border-white hover:text-white"
            }`}
          >
            {isVoted ? "Voted" : "Vote"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mb-4">
      <div className="flex gap-3 mb-3">
        <DebaterCard debater={op} label="Proposer" side="op" />
        {opponent ? (
          <DebaterCard debater={opponent} label="Challenger" side="opponent" />
        ) : (
          <div className="flex-1 bg-[var(--surface)] border border-dashed border-[var(--border)] rounded-xl p-4 text-center">
            <p className="text-sm text-[var(--foreground-muted)] mb-2">Waiting for a challenger...</p>
            {user && user.uid !== op.firebaseUid && (
              <button
                onClick={joinDebate}
                disabled={joining}
                className="text-xs font-semibold px-4 py-1.5 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white rounded-full transition-colors disabled:opacity-40"
              >
                {joining ? "Joining..." : "Accept Challenge"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Vote tally bar */}
      {opponent && total > 0 && (
        <div className="mb-3">
          <div className="h-2 bg-[var(--surface-2)] rounded-full overflow-hidden flex">
            <div className="bg-[var(--ratist-red)] transition-all duration-500" style={{ width: `${opPct}%` }} />
            <div className="bg-blue-500 transition-all duration-500" style={{ width: `${100 - opPct}%` }} />
          </div>
          <div className="flex justify-between text-xs text-[var(--foreground-muted)] mt-1">
            <span>{counts.op} vote{counts.op !== 1 ? "s" : ""}</span>
            <span>{counts.opponent} vote{counts.opponent !== 1 ? "s" : ""}</span>
          </div>
        </div>
      )}
    </div>
  );
}
