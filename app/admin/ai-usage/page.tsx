"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/context/AuthContext";
import { Cpu, Ban, Check, AlertCircle } from "lucide-react";

type WindowKey = "24h" | "7d" | "30d";

interface TopUser {
  userId: string;
  name: string;
  firebaseUid: string | null;
  email: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  aiDisabled: boolean;
  hasPass: boolean;
  subscriptionStatus: string | null;
  totalCalls: number;
  lastCall: string | null;
  byFeature: Record<string, number>;
}

interface UsageResponse {
  window: WindowKey;
  feature: string | null;
  totalCalls: number;
  uniqueUsers: number;
  byFeature: { feature: string; count: number }[];
  topUsers: TopUser[];
}

const WINDOW_OPTIONS: { key: WindowKey; label: string }[] = [
  { key: "24h", label: "Last 24 hours" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
];

export default function AdminAiUsagePage() {
  const { user } = useAuth();
  const [windowKey, setWindowKey] = useState<WindowKey>("7d");
  const [featureFilter, setFeatureFilter] = useState<string>("");
  const [data, setData] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    const token = await user.getIdToken();
    const params = new URLSearchParams({ window: windowKey });
    if (featureFilter) params.set("feature", featureFilter);
    const res = await fetch(`/api/admin/ai-usage?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { setError("Access denied or failed to load."); setLoading(false); return; }
    setData(await res.json());
    setLoading(false);
  }, [user, windowKey, featureFilter]);

  useEffect(() => { load(); }, [load]);

  async function toggleAiDisabled(target: TopUser) {
    if (!user) return;
    const next = !target.aiDisabled;
    const action = next ? "disable" : "re-enable";
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} AI features for ${target.name}?`)) return;
    setTogglingId(target.userId);
    const token = await user.getIdToken();
    const res = await fetch("/api/admin/ai-usage", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ userId: target.userId, aiDisabled: next }),
    });
    setTogglingId(null);
    if (res.ok) load();
    else setError("Failed to update user.");
  }

  if (loading) return <p className="text-[var(--foreground-muted)]">Loading…</p>;
  if (error) return <p className="text-red-400">{error}</p>;
  if (!data) return null;

  const allFeatures = data.byFeature.map((f) => f.feature);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Cpu className="w-5 h-5 text-[var(--ratist-red)]" />
        <h2 className="text-lg font-semibold text-white">AI Usage</h2>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center border border-[var(--border)] rounded-lg overflow-hidden">
          {WINDOW_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setWindowKey(key)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${windowKey === key ? "bg-[var(--ratist-red)] text-white" : "text-[var(--foreground-muted)] hover:text-white"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center border border-[var(--border)] rounded-lg overflow-hidden">
          <button
            onClick={() => setFeatureFilter("")}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${!featureFilter ? "bg-[var(--ratist-red)] text-white" : "text-[var(--foreground-muted)] hover:text-white"}`}
          >
            All features
          </button>
          {allFeatures.map((f) => (
            <button
              key={f}
              onClick={() => setFeatureFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${featureFilter === f ? "bg-[var(--ratist-red)] text-white" : "text-[var(--foreground-muted)] hover:text-white"}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
          <p className="text-xs text-[var(--foreground-muted)] mb-1">Total AI calls</p>
          <p className="text-2xl font-bold text-white">{data.totalCalls.toLocaleString()}</p>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
          <p className="text-xs text-[var(--foreground-muted)] mb-1">Users shown</p>
          <p className="text-2xl font-bold text-white">{data.topUsers.length}</p>
          <p className="text-[10px] text-[var(--foreground-muted)] mt-0.5">top 50 by usage</p>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
          <p className="text-xs text-[var(--foreground-muted)] mb-1">By feature</p>
          <div className="space-y-0.5 mt-1">
            {data.byFeature.length === 0 && <p className="text-xs text-[var(--foreground-muted)]">No activity</p>}
            {data.byFeature.map((b) => (
              <p key={b.feature} className="text-xs text-white">
                {b.feature}: <span className="text-[var(--foreground-muted)]">{b.count}</span>
              </p>
            ))}
          </div>
        </div>
      </div>

      {/* Top users table */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <h3 className="font-semibold text-white">Top users by AI usage</h3>
          <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
            Click Ban to disable AI features for a specific user. Disabled users can&apos;t use any AI-powered tool.
          </p>
        </div>
        {data.topUsers.length === 0 ? (
          <p className="text-sm text-[var(--foreground-muted)] px-5 py-8 text-center">No AI usage in this window.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left">
                <th className="px-5 py-3 text-xs text-[var(--foreground-muted)] font-medium uppercase tracking-wider">User</th>
                <th className="px-4 py-3 text-xs text-[var(--foreground-muted)] font-medium uppercase tracking-wider">Plan</th>
                <th className="px-4 py-3 text-xs text-[var(--foreground-muted)] font-medium uppercase tracking-wider">Calls</th>
                <th className="px-4 py-3 text-xs text-[var(--foreground-muted)] font-medium uppercase tracking-wider">Breakdown</th>
                <th className="px-4 py-3 text-xs text-[var(--foreground-muted)] font-medium uppercase tracking-wider">Last call</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {data.topUsers.map((u, i) => (
                <tr key={u.userId} className={`border-b border-[var(--border)]/40 ${i % 2 === 0 ? "bg-[var(--surface-2)]/30" : ""} ${u.aiDisabled ? "opacity-60" : ""}`}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      {u.avatarUrl && (
                        <Image src={u.avatarUrl} alt="" width={24} height={24} className="rounded-full w-6 h-6 object-cover" />
                      )}
                      <div className="min-w-0">
                        {u.firebaseUid ? (
                          <Link href={`/profile/${u.firebaseUid}`} target="_blank" className="text-white hover:text-[var(--ratist-red)] transition-colors text-sm">
                            {u.name}
                          </Link>
                        ) : (
                          <span className="text-sm text-white">{u.name}</span>
                        )}
                        {u.email && <p className="text-[10px] text-[var(--foreground-muted)]">{u.email}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {u.isAdmin && <span className="text-[10px] px-2 py-0.5 rounded-full border border-purple-500/50 text-purple-400 bg-purple-500/10">Admin</span>}
                      {u.hasPass && !u.isAdmin && <span className="text-[10px] px-2 py-0.5 rounded-full border border-amber-400/50 text-amber-400 bg-amber-400/10">Backstage</span>}
                      {!u.isAdmin && !u.hasPass && <span className="text-[10px] px-2 py-0.5 rounded-full border border-[var(--border)] text-[var(--foreground-muted)]">Free</span>}
                      {u.aiDisabled && <span className="text-[10px] px-2 py-0.5 rounded-full border border-red-500/50 text-red-400 bg-red-500/10">AI disabled</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-white font-semibold">{u.totalCalls.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <div className="space-y-0.5">
                      {Object.entries(u.byFeature).map(([feat, count]) => (
                        <p key={feat} className="text-[10px] text-[var(--foreground-muted)]">
                          {feat}: <span className="text-white">{count}</span>
                        </p>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--foreground-muted)]">
                    {u.lastCall ? new Date(u.lastCall).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => toggleAiDisabled(u)}
                      disabled={togglingId === u.userId || u.isAdmin}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border transition-colors ml-auto disabled:opacity-40 disabled:cursor-not-allowed ${
                        u.aiDisabled
                          ? "border-green-500/50 text-green-400 hover:bg-green-500/10"
                          : "border-red-500/50 text-red-400 hover:bg-red-500/10"
                      }`}
                      title={u.isAdmin ? "Admins can't be disabled here" : u.aiDisabled ? "Re-enable AI" : "Disable AI"}
                    >
                      {u.aiDisabled ? <><Check className="w-3 h-3" /> Re-enable</> : <><Ban className="w-3 h-3" /> Disable AI</>}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-[var(--foreground-muted)] mt-0.5 shrink-0" />
        <div className="text-xs text-[var(--foreground-muted)] space-y-1">
          <p><strong className="text-white">Caps in place:</strong> Free users are limited to 10 AI calls per hour per feature. Backstage Pass members bypass hourly limits but are capped at 50 per day per feature.</p>
          <p>Users flagged as <strong className="text-white">AI disabled</strong> cannot use any AI feature regardless of plan. Admins bypass all caps.</p>
        </div>
      </div>
    </div>
  );
}
