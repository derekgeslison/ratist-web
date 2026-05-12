"use client";

import { useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { ShieldAlert, Search, Ban, XCircle, CheckCircle, Undo2, Users, Film, AlertTriangle, UserX } from "lucide-react";

interface FlagEvidence {
  sharedCount?: number;
  matchRate?: number;
  totalA?: number;
  totalB?: number;
  sampleMatches?: string[];
  recentCount?: number;
  extremeLowCount?: number;
  extremeHighCount?: number;
  extremeRate?: number;
  direction?: "low" | "high";
  windowDays?: number;
  ratings?: { userId: string; rating: number; date: string; movieId?: string }[];
  ratingCount?: number;
  allExtreme?: boolean;
  accountAgeDays?: number | null;
  // Season / episode review-bomb flags carry the scope here so the
  // admin display can show "Season 2" or "S2E5" alongside the title.
  seasonNumber?: number;
  episodeNumber?: number;
  showTmdbId?: number;
}

interface FraudFlag {
  id: string;
  type: string;
  status: string;
  severity: string;
  userIds: string[];
  targetType: string | null;
  targetId: string | null;
  evidence: FlagEvidence;
  createdAt: string;
  resolvedAt: string | null;
}

interface UserInfo {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  bannedAt: string | null;
}

interface TargetInfo {
  title: string;
  tmdbId: number;
}

export default function FraudPage() {
  const { user } = useAuth();
  const [flags, setFlags] = useState<FraudFlag[]>([]);
  const [userMap, setUserMap] = useState<Record<string, UserInfo>>({});
  const [targetMap, setTargetMap] = useState<Record<string, TargetInfo>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [statusFilter, setStatusFilter] = useState("open");
  const [scanning, setScanning] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const fetchFlags = useCallback(async (status = statusFilter) => {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch(`/api/admin/fraud?status=${status}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setFlags(data.flags);
      setUserMap(data.userMap);
      setTargetMap(data.targetMap);
      setCounts(data.counts);
      setLoaded(true);
    }
  }, [user, statusFilter]);

  // Load on first render
  if (!loaded && user) fetchFlags();

  async function runScan(action: string, label: string) {
    if (!user) return;
    setScanning(action);
    setScanResult(null);
    const token = await user.getIdToken();
    const res = await fetch("/api/admin/fraud", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action }),
    });
    if (res.ok) {
      const data = await res.json();
      setScanResult(`${label}: found ${data.found} new flag${data.found === 1 ? "" : "s"}`);
      fetchFlags();
    }
    setScanning(null);
  }

  async function takeAction(action: string, flagId: string) {
    if (!user) return;
    setActing(flagId);
    const token = await user.getIdToken();
    await fetch("/api/admin/fraud", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, flagId }),
    });
    setActing(null);
    fetchFlags();
  }

  const typeIcon = (type: string) => {
    if (type === "duplicate_cluster") return <Users className="w-4 h-4" />;
    if (type === "review_bomb") return <Film className="w-4 h-4" />;
    return <UserX className="w-4 h-4" />;
  };

  const typeLabel = (type: string) => {
    if (type === "duplicate_cluster") return "Duplicate Cluster";
    if (type === "review_bomb") return "Review Bomb";
    return "Thin Account";
  };

  const severityColor = (s: string) => {
    if (s === "high") return "text-red-400 bg-red-400/10 border-red-400/30";
    if (s === "medium") return "text-yellow-400 bg-yellow-400/10 border-yellow-400/30";
    return "text-blue-400 bg-blue-400/10 border-blue-400/30";
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <ShieldAlert className="w-6 h-6 text-[var(--ratist-red)]" />
        <h2 className="text-lg font-bold text-white">Fraud Detection</h2>
      </div>

      {/* Scan buttons */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 mb-6">
        <p className="text-sm font-medium text-white mb-3">Run Detection Scans</p>
        <p className="text-xs text-[var(--foreground-muted)] mb-4">
          Scans analyze rating patterns and surface suspicious activity as flags. Nothing is auto-excluded — you review each flag and decide.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => runScan("scan_duplicates", "Duplicate scan")}
            disabled={!!scanning}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm text-white hover:border-[var(--ratist-red)] transition-colors disabled:opacity-50"
          >
            <Users className="w-4 h-4" />
            {scanning === "scan_duplicates" ? "Scanning..." : "Duplicate Clusters"}
          </button>
          <button
            onClick={() => runScan("scan_bombing", "Bombing scan")}
            disabled={!!scanning}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm text-white hover:border-[var(--ratist-red)] transition-colors disabled:opacity-50"
          >
            <AlertTriangle className="w-4 h-4" />
            {scanning === "scan_bombing" ? "Scanning..." : "Review Bombing"}
          </button>
          <button
            onClick={() => runScan("scan_thin", "Thin account scan")}
            disabled={!!scanning}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm text-white hover:border-[var(--ratist-red)] transition-colors disabled:opacity-50"
          >
            <UserX className="w-4 h-4" />
            {scanning === "scan_thin" ? "Scanning..." : "Thin Accounts"}
          </button>
        </div>
        {scanResult && (
          <p className="mt-3 text-sm text-green-400">{scanResult}</p>
        )}
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-2 mb-4">
        {(["open", "excluded", "dismissed"] as const).map((s) => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); fetchFlags(s); }}
            className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
              statusFilter === s
                ? "border-[var(--ratist-red)] bg-[var(--ratist-red)]/10 text-white"
                : "border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
            {counts[s] ? ` (${counts[s]})` : ""}
          </button>
        ))}
      </div>

      {/* Flags list */}
      {flags.length === 0 && loaded && (
        <p className="text-[var(--foreground-muted)] text-sm py-10 text-center">
          No {statusFilter} flags. {statusFilter === "open" ? "Run a scan above to check for suspicious activity." : ""}
        </p>
      )}

      <div className="space-y-4">
        {flags.map((flag) => (
          <div key={flag.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                {typeIcon(flag.type)}
                <div>
                  <p className="text-sm font-medium text-white">{typeLabel(flag.type)}</p>
                  <p className="text-xs text-[var(--foreground-muted)]">
                    {new Date(flag.createdAt).toLocaleDateString()} · {flag.userIds.length} user{flag.userIds.length === 1 ? "" : "s"}
                    {flag.targetId && targetMap[flag.targetId] && (
                      <> · <span className="text-white">
                        {targetMap[flag.targetId].title}
                        {flag.targetType === "show_season" && flag.evidence?.seasonNumber != null && (
                          <span className="text-[var(--foreground-muted)]"> — Season {flag.evidence.seasonNumber}</span>
                        )}
                        {flag.targetType === "show_episode" && flag.evidence?.seasonNumber != null && flag.evidence?.episodeNumber != null && (
                          <span className="text-[var(--foreground-muted)]"> — S{flag.evidence.seasonNumber}E{flag.evidence.episodeNumber}</span>
                        )}
                      </span></>
                    )}
                  </p>
                </div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full border ${severityColor(flag.severity)}`}>
                {flag.severity}
              </span>
            </div>

            {/* Evidence */}
            <div className="bg-[var(--background)] rounded-lg p-3 mb-3 text-xs space-y-1.5">
              {flag.type === "duplicate_cluster" && (
                <>
                  <p className="text-[var(--foreground-muted)]">
                    <span className="text-white font-medium">{flag.evidence.matchRate}%</span> identical ratings across{" "}
                    <span className="text-white font-medium">{flag.evidence.sharedCount}</span> shared movies
                  </p>
                  <p className="text-[var(--foreground-muted)]">
                    User A: {flag.evidence.totalA} total ratings · User B: {flag.evidence.totalB} total ratings
                  </p>
                </>
              )}
              {flag.type === "review_bomb" && (
                <>
                  <p className="text-[var(--foreground-muted)]">
                    <span className="text-white font-medium">{flag.evidence.recentCount}</span> ratings in last{" "}
                    {flag.evidence.windowDays} days · <span className="text-white font-medium">{flag.evidence.extremeRate}%</span>{" "}
                    are extreme {flag.evidence.direction === "low" ? "lows (≤2)" : "highs (≥9)"}
                  </p>
                  <p className="text-[var(--foreground-muted)]">
                    {flag.evidence.extremeLowCount} low · {flag.evidence.extremeHighCount} high
                  </p>
                </>
              )}
              {flag.type === "thin_account" && (
                <>
                  <p className="text-[var(--foreground-muted)]">
                    Only <span className="text-white font-medium">{flag.evidence.ratingCount}</span> rating{flag.evidence.ratingCount === 1 ? "" : "s"}, all extreme scores
                    {flag.evidence.accountAgeDays !== null && (
                      <> · Account age: <span className="text-white font-medium">{flag.evidence.accountAgeDays}</span> days</>
                    )}
                  </p>
                </>
              )}
            </div>

            {/* Users involved */}
            <div className="mb-3">
              <p className="text-xs text-[var(--foreground-muted)] mb-1.5">Users:</p>
              <div className="flex flex-wrap gap-2">
                {flag.userIds.map((uid) => {
                  const u = userMap[uid];
                  return (
                    <a
                      key={uid}
                      href={`/admin/users/${uid}`}
                      className="flex items-center gap-1.5 px-2 py-1 rounded bg-[var(--surface-2)] text-xs text-white hover:bg-[var(--ratist-red)]/10 transition-colors"
                    >
                      {u?.bannedAt && <Ban className="w-3 h-3 text-red-400" />}
                      {u?.name ?? uid.slice(0, 8)}
                      <span className="text-[var(--foreground-muted)]">{u?.email}</span>
                    </a>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            {flag.status === "open" && (
              <div className="flex items-center gap-2 pt-2 border-t border-[var(--border)]">
                <button
                  onClick={() => takeAction("exclude", flag.id)}
                  disabled={acting === flag.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Exclude Ratings
                </button>
                <button
                  onClick={() => takeAction("ban_cluster", flag.id)}
                  disabled={acting === flag.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                >
                  <Ban className="w-3.5 h-3.5" />
                  Ban & Exclude
                </button>
                <button
                  onClick={() => takeAction("dismiss", flag.id)}
                  disabled={acting === flag.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white transition-colors disabled:opacity-50"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  Dismiss
                </button>
              </div>
            )}
            {flag.status === "excluded" && (
              <div className="flex items-center gap-2 pt-2 border-t border-[var(--border)]">
                <span className="text-xs text-red-400">Ratings excluded</span>
                <button
                  onClick={() => takeAction("undo_exclude", flag.id)}
                  disabled={acting === flag.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white transition-colors disabled:opacity-50"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  Undo
                </button>
              </div>
            )}
            {flag.status === "dismissed" && (
              <p className="text-xs text-[var(--foreground-muted)] pt-2 border-t border-[var(--border)]">
                Dismissed {flag.resolvedAt ? `on ${new Date(flag.resolvedAt).toLocaleDateString()}` : ""}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
