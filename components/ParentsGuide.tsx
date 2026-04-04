"use client";

import { useEffect, useState } from "react";
import { ShieldAlert, ChevronDown, ChevronUp } from "lucide-react";

interface TopicDetail {
  label: string;
  yes: number;
  no: number;
}

interface CategoryData {
  category: string;
  severity: "none" | "mild" | "moderate" | "severe";
  triggers: string[];
  details: TopicDetail[];
  totalVotes: number;
}

interface GuideData {
  categories: CategoryData[] | null;
  totalVoters?: number;
  source?: string;
  message?: string;
}

const SEVERITY_CONFIG = {
  none: { label: "None", color: "text-green-400", bg: "bg-green-400", barPct: 0 },
  mild: { label: "Mild", color: "text-blue-400", bg: "bg-blue-400", barPct: 25 },
  moderate: { label: "Moderate", color: "text-yellow-400", bg: "bg-yellow-400", barPct: 60 },
  severe: { label: "Severe", color: "text-red-400", bg: "bg-red-400", barPct: 100 },
};

function VoteBar({ yes, no }: { yes: number; no: number }) {
  const total = yes + no;
  if (total === 0) return null;
  const pct = Math.round((yes / total) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-[var(--surface-2)] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${pct >= 70 ? "bg-red-400" : pct >= 40 ? "bg-yellow-400" : "bg-green-400"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] text-[var(--foreground-muted)] w-16 text-right shrink-0">
        {yes} yes · {no} no
      </span>
    </div>
  );
}

export default function ParentsGuide({ tmdbId, title }: { tmdbId: number; title: string }) {
  const [data, setData] = useState<GuideData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch(`/api/movies/${tmdbId}/parents-guide?title=${encodeURIComponent(title)}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [tmdbId, title]);

  function toggleExpand(category: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category); else next.add(category);
      return next;
    });
  }

  if (loading) {
    return <p className="text-[var(--foreground-muted)] text-sm py-8 text-center">Loading content guide...</p>;
  }

  if (!data?.categories || data.categories.length === 0) {
    return (
      <div className="text-center py-8 text-[var(--foreground-muted)]">
        <ShieldAlert className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No parents&apos; guide data available for this title.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.categories.map((cat) => {
        const config = SEVERITY_CONFIG[cat.severity];
        const isExpanded = expanded.has(cat.category);
        const hasDetails = cat.details.length > 0;

        return (
          <div key={cat.category} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
            {/* Collapsed view */}
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-white">{cat.category}</span>
                <span className={`text-xs font-bold ${config.color}`}>{config.label}</span>
              </div>
              <div className="h-1.5 bg-[var(--surface-2)] rounded-full overflow-hidden mb-2">
                <div
                  className={`h-full rounded-full ${config.bg} transition-all duration-500`}
                  style={{ width: `${config.barPct}%` }}
                />
              </div>
              {cat.triggers.length > 0 && (
                <p className="text-xs text-[var(--foreground-muted)] leading-relaxed mb-2">
                  {cat.triggers.join(", ")}
                </p>
              )}
              {hasDetails && (
                <button
                  onClick={() => toggleExpand(cat.category)}
                  className="flex items-center gap-1 text-[11px] text-[var(--ratist-red)] hover:underline"
                >
                  {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {isExpanded ? "Show less" : `Show details (${cat.details.length})`}
                </button>
              )}
            </div>

            {/* Expanded detail view */}
            {isExpanded && hasDetails && (
              <div className="border-t border-[var(--border)] px-4 py-3 space-y-2.5 bg-[var(--surface-2)]/30">
                {cat.details.map((d) => (
                  <div key={d.label}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs text-white">{d.label}</span>
                    </div>
                    <VoteBar yes={d.yes} no={d.no} />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Attribution */}
      <div className="flex items-center justify-between pt-2">
        <p className="text-[10px] text-[var(--foreground-muted)]">
          Community-sourced data from{" "}
          <a href="https://www.doesthedogdie.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-white transition-colors">
            DoesTheDogDie.com
          </a>
        </p>
        {data.totalVoters != null && data.totalVoters > 0 && (
          <p className="text-[10px] text-[var(--foreground-muted)]">{data.totalVoters}+ votes</p>
        )}
      </div>
    </div>
  );
}
