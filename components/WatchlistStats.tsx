"use client";

import { useEffect, useRef, useState } from "react";
import { BarChart3, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface BucketStat { name: string; count: number }
interface Stats {
  totals: { items: number; movies: number; shows: number };
  watched: { count: number; percent: number };
  rated: { count: number; percent: number; avg: number | null; distribution: Record<string, number> };
  rewatched: number;
  runtimeMinutes: number;
  topGenres: BucketStat[];
  topDecades: BucketStat[];
  topDirectors: BucketStat[];
}

function formatRuntime(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

// Ring that fills clockwise from 12 o'clock as `percent` rises 0→100. Built
// from a single SVG circle with stroke-dasharray; circumference = 2πr.
function PercentRing({ percent, label, sub }: { percent: number; label: string; sub?: string }) {
  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  const dash = (percent / 100) * circumference;
  return (
    <div className="flex items-center gap-3">
      <svg width="60" height="60" viewBox="0 0 60 60" className="-rotate-90">
        <circle cx="30" cy="30" r={radius} fill="none" stroke="var(--surface-2)" strokeWidth="6" />
        <circle cx="30" cy="30" r={radius} fill="none" stroke="var(--ratist-red)" strokeWidth="6"
          strokeDasharray={`${dash} ${circumference}`} strokeLinecap="round" />
      </svg>
      <div className="text-left">
        <div className="text-lg font-bold text-white leading-none">{percent}%</div>
        <div className="text-[11px] text-[var(--foreground-muted)] uppercase tracking-wider mt-1">{label}</div>
        {sub && <div className="text-[11px] text-[var(--foreground-muted)] mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

function HorizontalBars({ items, max }: { items: BucketStat[]; max: number }) {
  if (items.length === 0) return <p className="text-xs text-[var(--foreground-muted)] italic">—</p>;
  return (
    <div className="space-y-1.5">
      {items.map((it) => (
        <div key={it.name} className="flex items-center gap-2 text-xs">
          <span className="text-white truncate min-w-0 flex-1">{it.name}</span>
          <div className="w-20 sm:w-32 h-1.5 bg-[var(--surface-2)] rounded-full overflow-hidden shrink-0">
            <div className="h-full bg-[var(--ratist-red)]" style={{ width: `${(it.count / max) * 100}%` }} />
          </div>
          <span className="text-[var(--foreground-muted)] w-6 text-right shrink-0">{it.count}</span>
        </div>
      ))}
    </div>
  );
}

// Mirrors the movie/show RatingDistribution: each bar sits inside a
// fixed-height wrapper (h-16) so the % height resolves against a real
// pixel height instead of collapsing to content.
function RatingDistribution({ distribution }: { distribution: Record<string, number> }) {
  const max = Math.max(1, ...Object.values(distribution));
  const buckets = Array.from({ length: 10 }, (_, i) => i + 1);
  return (
    <div className="flex items-end gap-1">
      {buckets.map((b) => {
        const count = distribution[String(b)] ?? distribution[b] ?? 0;
        const pct = (count / max) * 100;
        const color = b <= 3 ? "bg-red-500" : b <= 5 ? "bg-orange-500" : b <= 7 ? "bg-yellow-500" : "bg-green-500";
        return (
          <div key={b} className="flex-1 flex flex-col items-center gap-1 group relative">
            <div className="w-full flex flex-col items-center justify-end h-16">
              <div className={`w-full rounded-t ${color} transition-all duration-300 min-h-[2px]`}
                style={{ height: `${Math.max(pct, count > 0 ? 3 : 0)}%` }}
                title={`${b}: ${count}`} />
            </div>
            <span className="text-[10px] text-[var(--foreground-muted)] leading-none">{b}</span>
          </div>
        );
      })}
    </div>
  );
}

interface Props {
  watchlistId: string;
  open: boolean;
  onClose: () => void;
}

export default function WatchlistStats({ watchlistId, open, onClose }: Props) {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Track which list the cached `stats` belongs to so opening on a
  // different list refetches.
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (loadedFor.current === watchlistId && stats) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const headers: Record<string, string> = {};
        if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
        const res = await fetch(`/api/watchlist/${watchlistId}/stats`, { headers });
        if (!res.ok) throw new Error(`Failed to load stats (${res.status})`);
        const data = await res.json();
        if (!cancelled) {
          setStats(data);
          loadedFor.current = watchlistId;
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load stats");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, watchlistId]);

  // Invalidate cache when the active list changes so reopening on a
  // different list refetches.
  useEffect(() => {
    if (loadedFor.current && loadedFor.current !== watchlistId) {
      setStats(null);
    }
  }, [watchlistId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-[var(--background)] border border-[var(--border)] rounded-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] sticky top-0 bg-[var(--background)] z-10">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[var(--ratist-red)]" /> Stats
          </h2>
          <button onClick={onClose} className="text-[var(--foreground-muted)] hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-5">
          {loading && <p className="text-xs text-[var(--foreground-muted)]">Loading stats...</p>}
          {error && <p className="text-xs text-red-400">{error}</p>}
          {stats && !loading && (
            <>
              {/* Headline numbers */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                <div>
                  <div className="text-2xl font-bold text-white leading-none">{stats.totals.items}</div>
                  <div className="text-[11px] text-[var(--foreground-muted)] uppercase tracking-wider mt-1">
                    {stats.totals.shows > 0
                      ? `${stats.totals.movies} movies · ${stats.totals.shows} shows`
                      : "items"}
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-white leading-none">{stats.rated.avg?.toFixed(1) ?? "—"}</div>
                  <div className="text-[11px] text-[var(--foreground-muted)] uppercase tracking-wider mt-1">avg rating</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-white leading-none">{stats.rewatched}</div>
                  <div className="text-[11px] text-[var(--foreground-muted)] uppercase tracking-wider mt-1">rewatches</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-white leading-none">{stats.runtimeMinutes > 0 ? formatRuntime(stats.runtimeMinutes) : "—"}</div>
                  <div className="text-[11px] text-[var(--foreground-muted)] uppercase tracking-wider mt-1">total runtime</div>
                </div>
              </div>

              {/* Rings */}
              <div className="flex flex-wrap gap-6">
                <PercentRing percent={stats.watched.percent} label="watched" sub={`${stats.watched.count} of ${stats.totals.items}`} />
                <PercentRing percent={stats.rated.percent} label="rated" sub={`${stats.rated.count} of ${stats.totals.items}`} />
              </div>

              {/* Rating distribution */}
              {stats.rated.count > 0 && (
                <div>
                  <div className="text-[11px] text-[var(--foreground-muted)] uppercase tracking-wider mb-2">Rating distribution</div>
                  <RatingDistribution distribution={stats.rated.distribution} />
                </div>
              )}

              {/* Top genres / decades / directors */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <div className="text-[11px] text-[var(--foreground-muted)] uppercase tracking-wider mb-2">Top genres</div>
                  <HorizontalBars items={stats.topGenres} max={Math.max(1, ...stats.topGenres.map((g) => g.count))} />
                </div>
                <div>
                  <div className="text-[11px] text-[var(--foreground-muted)] uppercase tracking-wider mb-2">Decades</div>
                  <HorizontalBars items={stats.topDecades} max={Math.max(1, ...stats.topDecades.map((d) => d.count))} />
                </div>
                <div>
                  <div className="text-[11px] text-[var(--foreground-muted)] uppercase tracking-wider mb-2">Top directors</div>
                  <HorizontalBars items={stats.topDirectors} max={Math.max(1, ...stats.topDirectors.map((d) => d.count))} />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
