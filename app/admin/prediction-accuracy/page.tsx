"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { TrendingUp, Target, Activity } from "lucide-react";

interface AccuracyData {
  totalRatings: number;
  evaluable: number;
  unevaluable: number;
  mae: number | null;
  pctWithinHalf: number | null;
  pctWithinOne: number | null;
  histogram: { bucket: string; count: number }[];
  monthly: { month: string; mae: number; count: number }[];
  worst: {
    ratingId: string;
    mediaType: "movie" | "tv";
    tmdbId: number;
    title: string;
    predicted: number;
    actual: number;
    absError: number;
    createdAt: string;
  }[];
}

export default function PredictionAccuracyPage() {
  const { user } = useAuth();
  const [data, setData] = useState<AccuracyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/prediction-accuracy", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  if (!user) return <div className="p-6 text-[var(--foreground-muted)]">Sign in required.</div>;
  if (loading) return <div className="p-6 text-[var(--foreground-muted)]">Computing leave-one-out predictions…</div>;
  if (error) return <div className="p-6 text-red-400">Error: {error}</div>;
  if (!data) return null;

  const maxHistCount = Math.max(1, ...data.histogram.map((b) => b.count));
  const maxMonthMae = Math.max(0.01, ...data.monthly.map((m) => m.mae));

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Prediction Accuracy</h1>
        <p className="text-sm text-[var(--foreground-muted)] mt-1">
          Leave-one-out comparison of predicted ratistRating vs actual user ratings.
          Every Fanatics rating is recomputed against community averages with that
          user&apos;s own rating excluded — a fair test of what the system would have
          predicted before the user rated.
        </p>
      </div>

      {data.evaluable === 0 ? (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 text-center">
          <p className="text-sm text-[var(--foreground-muted)]">
            No evaluable predictions yet. Need at least one Fanatics rating on a title
            that ALSO has another user&apos;s Fanatics rating (so the leave-one-out has
            a peer to compare against).
          </p>
          <p className="text-xs text-[var(--foreground-muted)] mt-2">
            {data.totalRatings} total Fanatics ratings in DB, {data.unevaluable} unevaluable.
          </p>
        </div>
      ) : (
        <>
          {/* Headline stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              icon={Target}
              label="Mean abs error"
              value={data.mae != null ? data.mae.toFixed(2) : "—"}
              sub="on a 1–10 scale"
            />
            <StatCard
              icon={Activity}
              label="Within ±0.5"
              value={data.pctWithinHalf != null ? `${data.pctWithinHalf.toFixed(0)}%` : "—"}
              sub="of actual"
            />
            <StatCard
              icon={Activity}
              label="Within ±1.0"
              value={data.pctWithinOne != null ? `${data.pctWithinOne.toFixed(0)}%` : "—"}
              sub="of actual"
            />
            <StatCard
              icon={TrendingUp}
              label="Evaluable"
              value={data.evaluable.toString()}
              sub={`${data.unevaluable} unevaluable / ${data.totalRatings} total`}
            />
          </div>

          {/* Error histogram */}
          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
            <h2 className="text-sm font-semibold text-white mb-1">Error distribution</h2>
            <p className="text-xs text-[var(--foreground-muted)] mb-4">
              How far off each prediction was from the user&apos;s actual ratistRating.
            </p>
            <div className="space-y-2">
              {data.histogram.map((b) => (
                <div key={b.bucket} className="flex items-center gap-3">
                  <span className="text-xs text-[var(--foreground-muted)] w-16 shrink-0 text-right tabular-nums">
                    {b.bucket}
                  </span>
                  <div className="flex-1 bg-[var(--surface-2)] rounded h-6 overflow-hidden">
                    <div
                      className="h-full bg-[var(--ratist-red)] transition-all"
                      style={{ width: `${(b.count / maxHistCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-white w-12 shrink-0 tabular-nums">{b.count}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Monthly MAE — the "are we improving" chart */}
          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
            <h2 className="text-sm font-semibold text-white mb-1">Mean absolute error over time</h2>
            <p className="text-xs text-[var(--foreground-muted)] mb-4">
              Monthly MAE — should trend down as data grows. Tooltip shows the rating count
              behind each bar so you can see when a month had a thin sample.
            </p>
            {data.monthly.length === 0 ? (
              <p className="text-xs text-[var(--foreground-muted)]">No monthly buckets yet.</p>
            ) : (
              <div className="space-y-2">
                {data.monthly.map((m) => (
                  <div key={m.month} className="flex items-center gap-3" title={`${m.count} rating${m.count === 1 ? "" : "s"}`}>
                    <span className="text-xs text-[var(--foreground-muted)] w-20 shrink-0 tabular-nums">
                      {m.month}
                    </span>
                    <div className="flex-1 bg-[var(--surface-2)] rounded h-6 overflow-hidden">
                      <div
                        className="h-full bg-amber-500 transition-all"
                        style={{ width: `${(m.mae / maxMonthMae) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-white w-16 shrink-0 tabular-nums">
                      {m.mae.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-[var(--foreground-muted)] w-10 shrink-0 tabular-nums">
                      n={m.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Worst predictions — diagnostic */}
          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
            <h2 className="text-sm font-semibold text-white mb-1">Worst 25 predictions</h2>
            <p className="text-xs text-[var(--foreground-muted)] mb-4">
              Where the system was most wrong. Useful for diagnosing which kinds of titles
              the algorithm struggles on.
            </p>
            {data.worst.length === 0 ? (
              <p className="text-xs text-[var(--foreground-muted)]">Nothing to show yet.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[var(--foreground-muted)] border-b border-[var(--border)]">
                    <th className="py-2 font-medium">Title</th>
                    <th className="py-2 font-medium text-right">Predicted</th>
                    <th className="py-2 font-medium text-right">Actual</th>
                    <th className="py-2 font-medium text-right">|Δ|</th>
                  </tr>
                </thead>
                <tbody>
                  {data.worst.map((w) => {
                    const href = w.mediaType === "movie" ? `/movies/${w.tmdbId}` : `/shows/${w.tmdbId}`;
                    return (
                      <tr key={w.ratingId} className="border-b border-[var(--border)]/30">
                        <td className="py-2">
                          <Link href={href} className="text-white hover:text-[var(--ratist-red)] hover:underline">
                            {w.title}
                          </Link>
                          <span className="text-[10px] text-[var(--foreground-muted)] ml-2 uppercase">{w.mediaType}</span>
                        </td>
                        <td className="py-2 text-right tabular-nums text-[var(--foreground-muted)]">{w.predicted.toFixed(1)}</td>
                        <td className="py-2 text-right tabular-nums text-white">{w.actual.toFixed(1)}</td>
                        <td className="py-2 text-right tabular-nums font-semibold text-amber-400">{w.absError.toFixed(1)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

      <button
        onClick={load}
        className="text-xs text-[var(--ratist-red)] hover:underline"
      >
        Recompute
      </button>
    </div>
  );
}

function StatCard({
  icon: Icon, label, value, sub,
}: { icon: typeof Target; label: string; value: string; sub: string }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
      <div className="flex items-center gap-2 text-[var(--foreground-muted)] mb-2">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-xs uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
      <p className="text-xs text-[var(--foreground-muted)] mt-1">{sub}</p>
    </div>
  );
}
