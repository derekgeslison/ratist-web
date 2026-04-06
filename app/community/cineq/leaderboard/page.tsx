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

const MEDIA_TYPES = [
  { value: "movie", label: "Movies", icon: Film, color: "text-[var(--ratist-red)]" },
  { value: "tv", label: "TV Shows", icon: Tv, color: "text-blue-400" },
  { value: "both", label: "Both", icon: Monitor, color: "text-purple-400" },
];
const DIFFICULTIES = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

export default function CineQLeaderboardPage() {
  const [mediaType, setMediaType] = useState("movie");
  const [difficulty, setDifficulty] = useState("easy");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState("");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/cineq/leaderboard?mediaType=${mediaType}&difficulty=${difficulty}`)
      .then((r) => r.json())
      .then((data) => {
        setEntries(data.entries ?? []);
        setDate(data.date ?? "");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [mediaType, difficulty]);

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <Link href="/community/cineq" className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Cine-Q
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <Trophy className="w-6 h-6 text-yellow-400" />
        <h1 className="text-2xl font-bold text-white">Daily Leaderboard</h1>
      </div>
      {date && <p className="text-sm text-[var(--foreground-muted)] mb-6">{new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-3">
        {MEDIA_TYPES.map(({ value, label, icon: Icon, color }) => (
          <button
            key={value}
            onClick={() => setMediaType(value)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
              mediaType === value ? `border-[var(--ratist-red)] bg-[var(--ratist-red)]/10 text-white` : "border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"
            }`}
          >
            <Icon className={`w-3 h-3 ${mediaType === value ? color : ""}`} /> {label}
          </button>
        ))}
      </div>
      <div className="flex gap-2 mb-6">
        {DIFFICULTIES.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setDifficulty(value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
              difficulty === value ? "border-[var(--ratist-red)] bg-[var(--ratist-red)]/10 text-white" : "border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-[var(--foreground-muted)] text-center py-20">Loading...</p>
      ) : entries.length === 0 ? (
        <p className="text-[var(--foreground-muted)] text-center py-20">No one has played this quiz yet today. Be the first!</p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div key={entry.rank} className={`flex items-center gap-3 p-3 rounded-xl border ${entry.rank <= 3 ? "border-yellow-500/30 bg-yellow-500/5" : "border-[var(--border)] bg-[var(--surface)]"}`}>
              <span className={`text-lg font-bold w-8 text-center ${entry.rank === 1 ? "text-yellow-400" : entry.rank === 2 ? "text-gray-300" : entry.rank === 3 ? "text-orange-400" : "text-[var(--foreground-muted)]"}`}>
                {entry.rank}
              </span>
              <div className="relative w-8 h-8 rounded-full overflow-hidden bg-[var(--surface-2)] shrink-0">
                {entry.user.avatarUrl ? (
                  <Image src={entry.user.avatarUrl} alt="" fill sizes="32px" className="object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs font-bold text-white bg-[var(--ratist-red)]">
                    {(entry.user.name || "?")[0].toUpperCase()}
                  </div>
                )}
              </div>
              <Link href={`/profile/${entry.user.firebaseUid}`} className="flex-1 min-w-0 text-sm font-medium text-white hover:text-[var(--ratist-red)] truncate">
                {entry.user.name}
              </Link>
              <span className="text-sm font-bold text-white">{entry.rawScore.toFixed(1)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
