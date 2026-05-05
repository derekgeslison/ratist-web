"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { X, Tv, List, Check, Loader2, CheckCircle2 } from "lucide-react";

interface Props {
  showTmdbId: number;
  showName: string;
  posterPath: string | null;
  seasons: { season_number: number; name: string; episode_count: number }[];
  onClose: () => void;
  onComplete: (showSeen: boolean) => void;
}

export default function MarkSeenModal({
  showTmdbId,
  showName,
  posterPath,
  seasons,
  onClose,
  onComplete,
}: Props) {
  const { user } = useAuth();
  const [mode, setMode] = useState<"pick" | "seasons">("pick");
  const [selectedSeasons, setSelectedSeasons] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);

  // Filter out specials (season 0)
  const regularSeasons = seasons.filter((s) => s.season_number > 0);
  const totalEpisodes = regularSeasons.reduce((sum, s) => sum + s.episode_count, 0);

  const toggleSeason = (num: number) => {
    setSelectedSeasons((prev) => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num);
      else next.add(num);
      return next;
    });
  };

  const markSeries = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/shows/${showTmdbId}/episodes/seen`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ mode: "series", showName, posterPath }),
      });
      if (!res.ok) throw new Error("Failed to mark series as seen");
      onComplete(true);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const markSeasons = async () => {
    if (!user || selectedSeasons.size === 0) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      for (const seasonNumber of Array.from(selectedSeasons).sort((a, b) => a - b)) {
        const res = await fetch(`/api/shows/${showTmdbId}/episodes/seen`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ mode: "season", seasonNumber, showName, posterPath }),
        });
        if (!res.ok) throw new Error(`Failed to mark season ${seasonNumber} as seen`);
      }
      onComplete(true);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md mx-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
        >
          <X size={20} />
        </button>

        {/* Title — show is already marked seen by the time this opens.
            Modal acts as confirmation + optional follow-ups. */}
        <div className="flex items-start gap-2 pr-8 mb-1">
          <CheckCircle2 size={20} className="text-green-400 shrink-0 mt-0.5" />
          <h2 className="text-lg font-semibold text-white">Marked &ldquo;{showName}&rdquo; as seen</h2>
        </div>
        <p className="text-sm text-gray-400 mb-5">
          Want to also track individual episodes? You can mark the full series or pick specific seasons — both optional.
        </p>

        {mode === "pick" && (
          <div className="space-y-3">
            {/* Mark entire series */}
            <button
              onClick={markSeries}
              disabled={loading}
              className="w-full flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left hover:border-[var(--ratist-red)] transition-colors disabled:opacity-60"
            >
              {loading ? (
                <Loader2 size={22} className="text-[var(--ratist-red)] animate-spin shrink-0" />
              ) : (
                <Tv size={22} className="text-[var(--ratist-red)] shrink-0" />
              )}
              <div>
                <p className="text-white font-medium">Mark all aired episodes as seen</p>
                <p className="text-sm text-gray-400">
                  Up to {totalEpisodes} episodes across {regularSeasons.length} season
                  {regularSeasons.length !== 1 ? "s" : ""}. Future-scheduled episodes are skipped.
                </p>
              </div>
            </button>

            {/* Choose seasons */}
            <button
              onClick={() => setMode("seasons")}
              disabled={loading}
              className="w-full flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left hover:border-[var(--ratist-red)] transition-colors disabled:opacity-60"
            >
              <List size={22} className="text-[var(--ratist-red)] shrink-0" />
              <div>
                <p className="text-white font-medium">Choose seasons...</p>
                <p className="text-sm text-gray-400">Aired episodes from the seasons you pick</p>
              </div>
            </button>

            {/* Done — closing leaves the show marked seen. */}
            <div className="pt-2 text-center">
              <button
                onClick={onClose}
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {mode === "seasons" && (
          <div className="space-y-3">
            {/* Season checkboxes */}
            <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
              {regularSeasons.map((s) => {
                const checked = selectedSeasons.has(s.season_number);
                return (
                  <button
                    key={s.season_number}
                    onClick={() => toggleSeason(s.season_number)}
                    className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                      checked
                        ? "border-green-500/60 bg-green-500/10"
                        : "border-[var(--border)] hover:border-[var(--ratist-red)]"
                    }`}
                  >
                    <div
                      className={`flex items-center justify-center w-5 h-5 rounded shrink-0 border transition-colors ${
                        checked
                          ? "bg-green-500 border-green-500"
                          : "border-gray-500"
                      }`}
                    >
                      {checked && <Check size={14} className="text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{s.name}</p>
                      <p className="text-xs text-gray-400">
                        {s.episode_count} episode{s.episode_count !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Confirm + Back */}
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setMode("pick")}
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                Back
              </button>
              <button
                onClick={markSeasons}
                disabled={loading || selectedSeasons.size === 0}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-40"
                style={{ backgroundColor: "var(--ratist-red)" }}
              >
                {loading && <Loader2 size={16} className="animate-spin" />}
                Confirm ({selectedSeasons.size} season{selectedSeasons.size !== 1 ? "s" : ""})
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
