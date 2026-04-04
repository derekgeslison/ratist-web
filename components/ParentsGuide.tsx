"use client";

import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";

interface CategoryData {
  category: string;
  severity: "none" | "mild" | "moderate" | "severe";
  triggers: string[];
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

export default function ParentsGuide({ tmdbId, title }: { tmdbId: number; title: string }) {
  const [data, setData] = useState<GuideData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/movies/${tmdbId}/parents-guide?title=${encodeURIComponent(title)}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [tmdbId, title]);

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
        return (
          <div key={cat.category} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-white">{cat.category}</span>
              <span className={`text-xs font-bold ${config.color}`}>{config.label}</span>
            </div>
            {/* Severity bar */}
            <div className="h-1.5 bg-[var(--surface-2)] rounded-full overflow-hidden mb-2">
              <div
                className={`h-full rounded-full ${config.bg} transition-all duration-500`}
                style={{ width: `${config.barPct}%` }}
              />
            </div>
            {/* Trigger labels */}
            {cat.triggers.length > 0 && (
              <p className="text-xs text-[var(--foreground-muted)] leading-relaxed">
                {cat.triggers.join(", ")}
              </p>
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
