"use client";

import { useState, useEffect } from "react";
import { Trophy, Award, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import type { AwardBodyGroup } from "@/lib/awards";

interface Props {
  awards: AwardBodyGroup[];
  entityType?: "movie" | "tvshow" | "celebrity";
  tmdbId?: number;
}

export default function AwardsTab({ awards, entityType, tmdbId }: Props) {
  const totalWins = awards.reduce((s, g) => s + g.winCount, 0);
  const totalNoms = awards.reduce((s, g) => s + g.nomCount, 0);
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    user.getIdToken().then((token) =>
      fetch("/api/auth/admin-check", { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((d) => setIsAdmin(d.isAdmin === true))
        .catch(() => {})
    );
  }, [user]);

  async function handleRefresh() {
    if (!user || !entityType || !tmdbId) return;
    setRefreshing(true);
    setRefreshResult(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/awards-refresh", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, tmdbId }),
      });
      const data = await res.json();
      if (res.ok) {
        setRefreshResult(`Synced ${data.count} awards. Reload to see updates.`);
      } else {
        setRefreshResult(data.error || "Refresh failed");
      }
    } catch {
      setRefreshResult("Refresh failed");
    }
    setRefreshing(false);
  }

  if (awards.length === 0) {
    return (
      <div className="text-center py-16 text-[var(--foreground-muted)]">
        <Award className="w-12 h-12 mx-auto mb-4 opacity-40" />
        <p>No awards data available yet.</p>
        <p className="text-sm mt-1">Awards data is being synced — try refreshing the page in a moment.</p>
        {isAdmin && entityType && tmdbId && (
          <div className="mt-4">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-xs text-[var(--foreground-muted)] hover:text-white hover:border-[var(--ratist-red)] transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Syncing..." : "Refresh Awards"}
            </button>
            {refreshResult && <p className="text-xs mt-2">{refreshResult}</p>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-16">
      {/* Summary */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-amber-400">
            <Trophy className="w-5 h-5" />
            <span className="font-semibold">{totalWins} {totalWins === 1 ? "win" : "wins"}</span>
          </div>
          <span className="text-[var(--foreground-muted)]">&middot;</span>
          <div className="text-[var(--foreground-muted)]">
            {totalNoms} {totalNoms === 1 ? "nomination" : "nominations"} total
          </div>
        </div>
        {isAdmin && entityType && tmdbId && (
          <div className="flex items-center gap-2">
            {refreshResult && <span className="text-xs text-[var(--foreground-muted)]">{refreshResult}</span>}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-xs text-[var(--foreground-muted)] hover:text-white hover:border-[var(--ratist-red)] transition-colors disabled:opacity-50"
              title="Re-sync awards from Wikidata"
            >
              <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Syncing..." : "Refresh"}
            </button>
          </div>
        )}
      </div>

      {/* Award body sections */}
      {awards.map((group) => (
        <AwardBodySection key={group.slug} group={group} />
      ))}
    </div>
  );
}

function AwardBodySection({ group }: { group: AwardBodyGroup }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="border border-[var(--border)] rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-[var(--card-hover)] transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-base font-semibold text-white">
            {group.name}
            {group.shortName && !group.name.toLowerCase().includes(group.shortName.toLowerCase()) && (
              <span className="text-sm font-normal text-[var(--foreground-muted)] ml-1.5">({group.shortName}s)</span>
            )}
          </span>
          <span className="text-sm text-[var(--foreground-muted)]">
            {group.winCount > 0 && (
              <span className="text-amber-400">{group.winCount} {group.winCount === 1 ? "win" : "wins"}</span>
            )}
            {group.winCount > 0 && group.nomCount > 0 && (
              <span> &middot; </span>
            )}
            <span>{group.nomCount} {group.nomCount === 1 ? "nomination" : "nominations"}</span>
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-[var(--foreground-muted)]" />
        ) : (
          <ChevronDown className="w-4 h-4 text-[var(--foreground-muted)]" />
        )}
      </button>

      {/* Nominations list */}
      {expanded && (
        <div className="border-t border-[var(--border)]">
          {group.nominations.map((nom) => (
            <div
              key={nom.id}
              className="flex items-start gap-3 px-5 py-3 border-b border-[var(--border)] last:border-b-0"
            >
              {/* Win/nom indicator */}
              {nom.isWinner ? (
                <Trophy className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              ) : (
                <Award className="w-4 h-4 text-[var(--foreground-muted)] mt-0.5 shrink-0 opacity-50" />
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className={`text-sm font-medium ${nom.isWinner ? "text-amber-400" : "text-white"}`}>
                    {nom.categoryName}
                  </span>
                  {nom.year && (
                    <span className="text-xs text-[var(--foreground-muted)]">
                      ({nom.year})
                    </span>
                  )}
                </div>
                {nom.person && (
                  <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
                    {nom.person.name}
                  </p>
                )}
                {nom.forWork && (
                  <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
                    for <span className="italic">{nom.forWork.title}</span>
                  </p>
                )}
                {nom.ceremony && (
                  <p className="text-xs text-[var(--foreground-muted)] opacity-60 mt-0.5">
                    {nom.ceremony}
                  </p>
                )}
              </div>

              {/* Winner badge */}
              {nom.isWinner && (
                <span className="text-xs font-medium text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded shrink-0">
                  Won
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
