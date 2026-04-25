"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { ExternalLink, Download } from "lucide-react";

interface ProviderTotal {
  provider: string;
  clicks: number;
}

interface TopTitle {
  tmdbId: number;
  mediaType: string | null;
  clicks: number;
  title: string | null;
}

interface ReportData {
  days: number;
  since: string;
  totalClicks: number;
  providers: ProviderTotal[];
  topByProvider: Record<string, TopTitle[]>;
}

const PROVIDER_LABELS: Record<string, string> = {
  netflix: "Netflix",
  amazon: "Amazon Prime Video",
  disney: "Disney+",
  hulu: "Hulu",
  apple_tv: "Apple TV+",
  max: "Max",
  paramount: "Paramount+",
  peacock: "Peacock",
  starz: "Starz",
  showtime: "Showtime",
  amc_plus: "AMC+",
  shudder: "Shudder",
  mubi: "MUBI",
  criterion: "Criterion Channel",
  britbox: "BritBox",
  fandango: "Fandango",
  spotify: "Spotify",
  google_play: "Google Play",
  youtube: "YouTube",
  vudu: "Vudu / Fandango at Home",
  microsoft: "Microsoft Store",
  rent_buy: "Rent / Buy (other)",
  other: "Other",
};

const WINDOWS = [
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
  { value: 365, label: "Last year" },
];

export default function AffiliateClicksPage() {
  const { user } = useAuth();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/admin/affiliate-clicks?days=${days}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          if (!cancelled) setError("Access denied or request failed.");
          return;
        }
        const json = (await res.json()) as ReportData;
        if (!cancelled) setData(json);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, days]);

  function exportCsv() {
    if (!data) return;
    const lines = ["provider,clicks,top_titles"];
    for (const p of data.providers) {
      const top = (data.topByProvider[p.provider] ?? [])
        .map((t) => `${t.title ?? "Unknown"} (${t.clicks})`)
        .join(" | ")
        .replace(/"/g, '""');
      lines.push(`${PROVIDER_LABELS[p.provider] ?? p.provider},${p.clicks},"${top}"`);
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `affiliate-clicks-${days}d-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (loading) return <p className="text-[var(--foreground-muted)]">Loading…</p>;
  if (error) return <p className="text-red-400">{error}</p>;
  if (!data) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <ExternalLink className="w-5 h-5 text-[var(--ratist-red)]" />
            Affiliate Clicks
          </h2>
          <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
            Outbound clicks to streaming providers, Fandango, Spotify, etc. Use this for partnership negotiations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value, 10))}
            className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)]"
          >
            {WINDOWS.map((w) => (
              <option key={w.value} value={w.value}>{w.label}</option>
            ))}
          </select>
          <button
            onClick={exportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] text-white rounded-lg text-sm font-semibold hover:border-[var(--ratist-red)] transition-colors"
          >
            <Download className="w-4 h-4" /> CSV
          </button>
        </div>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 mb-6">
        <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider font-semibold mb-1">
          Total clicks · last {data.days} days
        </p>
        <p className="text-4xl font-bold text-white tabular-nums">{data.totalClicks.toLocaleString()}</p>
      </div>

      {data.providers.length === 0 ? (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-12 text-center">
          <p className="text-sm text-[var(--foreground-muted)]">No clicks recorded in this window yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.providers.map((p) => {
            const top = data.topByProvider[p.provider] ?? [];
            const label = PROVIDER_LABELS[p.provider] ?? p.provider;
            const pct = data.totalClicks > 0 ? (p.clicks / data.totalClicks) * 100 : 0;
            return (
              <div key={p.provider} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-base font-semibold text-white">{label}</h3>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-white tabular-nums">{p.clicks.toLocaleString()}</p>
                    <p className="text-[10px] text-[var(--foreground-muted)]">{pct.toFixed(1)}% of total</p>
                  </div>
                </div>
                {top.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-[var(--border)]/40">
                    <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] font-semibold mb-2">Top titles</p>
                    <ul className="space-y-1">
                      {top.map((t) => (
                        <li key={`${t.mediaType}-${t.tmdbId}`} className="flex items-center justify-between text-sm">
                          <Link
                            href={t.mediaType === "tv" ? `/shows/${t.tmdbId}` : `/movies/${t.tmdbId}`}
                            className="text-white hover:text-[var(--ratist-red)] transition-colors truncate pr-2"
                          >
                            {t.title ?? `(unknown ${t.mediaType ?? ""} #${t.tmdbId})`}
                          </Link>
                          <span className="text-[var(--foreground-muted)] tabular-nums shrink-0">{t.clicks}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
