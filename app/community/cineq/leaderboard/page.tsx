"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Brain, Trophy, Film, Tv, Monitor } from "lucide-react";

interface LeaderboardEntry {
  rank: number;
  user: { firebaseUid: string; name: string; avatarUrl: string | null };
  rawScore: number;
  weightedScore: number;
  completedAt: string;
}

interface SectionData {
  entries: LeaderboardEntry[];
  loading: boolean;
}

const MEDIA_TYPES = [
  { value: "movie", label: "Movies", icon: Film, color: "text-[var(--ratist-red)]" },
  { value: "tv", label: "TV Shows", icon: Tv, color: "text-blue-400" },
  { value: "both", label: "Both", icon: Monitor, color: "text-purple-400" },
];
const DIFFS = ["easy", "medium", "hard"];

export default function CineQLeaderboardPage() {
  const [data, setData] = useState<Record<string, SectionData>>({});

  useEffect(() => {
    // Fetch all 9 leaderboards in parallel
    const fetches: Promise<void>[] = [];
    for (const mt of MEDIA_TYPES) {
      for (const diff of DIFFS) {
        const key = `${mt.value}-${diff}`;
        fetches.push(
          fetch(`/api/cineq/leaderboard?mediaType=${mt.value}&difficulty=${diff}`)
            .then((r) => r.json())
            .then((d) => setData((prev) => ({ ...prev, [key]: { entries: d.entries ?? [], loading: false } })))
            .catch(() => setData((prev) => ({ ...prev, [key]: { entries: [], loading: false } })))
        );
        setData((prev) => ({ ...prev, [key]: { entries: [], loading: true } }));
      }
    }
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <Link href="/community/cineq" className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-pink-400 mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Cine-Q
      </Link>

      <div className="flex items-center gap-3 mb-8">
        <Trophy className="w-6 h-6 text-yellow-400" />
        <h1 className="text-2xl font-bold text-white">Daily Leaderboard</h1>
      </div>

      {MEDIA_TYPES.map(({ value: mt, label, icon: Icon, color }) => {
        const hasAnyEntries = DIFFS.some((d) => (data[`${mt}-${d}`]?.entries.length ?? 0) > 0);
        const totalParticipants = new Set(DIFFS.flatMap((d) => (data[`${mt}-${d}`]?.entries ?? []).map((e) => e.user.firebaseUid))).size;
        const allScores = DIFFS.flatMap((d) => (data[`${mt}-${d}`]?.entries ?? []).map((e) => e.weightedScore));
        const avgScore = allScores.length > 0 ? (allScores.reduce((a, b) => a + b, 0) / allScores.length) : 0;

        return (
          <section key={mt} className="mb-10">
            <div className="flex items-center gap-2 mb-4">
              <Icon className={`w-5 h-5 ${color}`} />
              <h2 className="text-lg font-semibold text-white">{label}</h2>
              {totalParticipants > 0 && (
                <span className="text-xs text-[var(--foreground-muted)] ml-auto">
                  {totalParticipants} participant{totalParticipants !== 1 ? "s" : ""} · avg {avgScore.toFixed(1)}
                </span>
              )}
            </div>

            {!hasAnyEntries ? (
              <p className="text-sm text-[var(--foreground-muted)] py-4">No one has played this quiz type today yet.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-3">
                {DIFFS.map((diff) => {
                  const key = `${mt}-${diff}`;
                  const section = data[key];
                  const entries = section?.entries ?? [];
                  const diffAvg = entries.length > 0 ? (entries.reduce((s, e) => s + e.weightedScore, 0) / entries.length).toFixed(1) : "–";
                  return (
                    <div key={diff} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-white capitalize">{diff}</h3>
                        <span className="text-[10px] text-[var(--foreground-muted)]">{entries.length} player{entries.length !== 1 ? "s" : ""} · avg {diffAvg}</span>
                      </div>
                      {section?.loading ? (
                        <p className="text-xs text-[var(--foreground-muted)]">Loading...</p>
                      ) : entries.length === 0 ? (
                        <p className="text-xs text-[var(--foreground-muted)]">No entries yet</p>
                      ) : (
                        <div className="space-y-2">
                          {entries.slice(0, 10).map((entry) => (
                            <div key={entry.rank} className="flex items-center gap-2">
                              <span className={`text-xs font-bold w-5 text-center ${entry.rank === 1 ? "text-yellow-400" : entry.rank === 2 ? "text-gray-300" : entry.rank === 3 ? "text-orange-400" : "text-[var(--foreground-muted)]"}`}>
                                {entry.rank}
                              </span>
                              <div className="relative w-5 h-5 rounded-full overflow-hidden bg-[var(--surface-2)] shrink-0">
                                {entry.user.avatarUrl ? (
                                  <Image src={entry.user.avatarUrl} alt="" fill sizes="20px" className="object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-[8px] font-bold text-white bg-pink-600">
                                    {(entry.user.name || "?")[0].toUpperCase()}
                                  </div>
                                )}
                              </div>
                              <Link href={`/profile/${entry.user.firebaseUid}`} className="flex-1 text-xs text-white hover:text-pink-400 truncate">
                                {entry.user.name}
                              </Link>
                              <span className="text-xs font-bold text-white">{entry.weightedScore.toFixed(1)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
