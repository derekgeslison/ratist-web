"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";

interface Props {
  tmdbId: number;
  mediaType: "movie" | "tv";
}

interface Fact {
  label: string;
  value: string;
}

// Format a budget or revenue number like Cine-Q does. Keeps numbers human-
// readable on a small card ("$158M" beats "158,420,000").
function formatMoney(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${Math.round(n / 1_000_000)}M`;
  if (n >= 1000) return `$${Math.round(n / 1000)}K`;
  return `$${n}`;
}

// Yyyy from a "YYYY-MM-DD" string — tolerates missing values.
function yearOf(date?: string | null): string | null {
  if (!date || date.length < 4) return null;
  return date.slice(0, 4);
}

/**
 * A fun-facts carousel that entertains users while the AI generation runs.
 * Fetches movie/show details from the public TMDB proxy and cycles through
 * whichever fields come back populated. Fields that are missing or zero
 * (budget=0, no tagline, etc.) don't render a card — same filter pattern
 * Cine-Q uses.
 */
export default function FunFactsCarousel({ tmdbId, mediaType }: Props) {
  const [raw, setRaw] = useState<Record<string, unknown> | null>(null);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/watch-companion/fun-facts?tmdbId=${tmdbId}&mediaType=${mediaType}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setRaw(data);
      } catch { /* silent — carousel just won't render */ }
    })();
    return () => { cancelled = true; };
  }, [tmdbId, mediaType]);

  const facts: Fact[] = useMemo(() => {
    if (!raw) return [];
    const out: Fact[] = [];

    if (mediaType === "movie") {
      const m = raw as {
        tagline?: string; budget?: number; revenue?: number;
        runtime?: number; release_date?: string;
        original_language?: string;
        belongs_to_collection?: { name?: string } | null;
        credits?: { cast?: Array<{ name?: string }>; crew?: Array<{ name?: string; job?: string }> };
      };
      if (m.tagline) out.push({ label: "Tagline", value: `“${m.tagline}”` });
      if (m.budget && m.budget > 0) out.push({ label: "Budget", value: formatMoney(m.budget) });
      if (m.revenue && m.revenue > 0) out.push({ label: "Box office", value: formatMoney(m.revenue) });
      if (m.runtime && m.runtime > 0) {
        const h = Math.floor(m.runtime / 60);
        const mm = m.runtime % 60;
        out.push({ label: "Runtime", value: h > 0 ? `${h}h ${mm}m` : `${mm}m` });
      }
      const releaseYear = yearOf(m.release_date);
      if (releaseYear) out.push({ label: "Released", value: releaseYear });
      if (m.original_language && m.original_language !== "en") {
        out.push({ label: "Original language", value: m.original_language.toUpperCase() });
      }
      if (m.belongs_to_collection?.name) {
        out.push({ label: "Franchise", value: m.belongs_to_collection.name });
      }
      const director = m.credits?.crew?.find((c) => c?.job === "Director")?.name;
      if (director) out.push({ label: "Directed by", value: director });
      const topCast = m.credits?.cast?.slice(0, 3).map((c) => c.name).filter(Boolean) as string[] | undefined;
      if (topCast && topCast.length > 0) {
        out.push({ label: "Starring", value: topCast.join(", ") });
      }
    } else {
      const s = raw as {
        tagline?: string; number_of_seasons?: number; number_of_episodes?: number;
        episode_run_time?: number[]; first_air_date?: string; last_air_date?: string;
        status?: string; original_language?: string;
        networks?: Array<{ name?: string }>;
        created_by?: Array<{ name?: string }>;
        aggregate_credits?: { cast?: Array<{ name?: string }> };
        credits?: { cast?: Array<{ name?: string }> };
      };
      if (s.tagline) out.push({ label: "Tagline", value: `“${s.tagline}”` });
      if (s.number_of_seasons && s.number_of_seasons > 0) {
        out.push({ label: "Seasons", value: `${s.number_of_seasons}` });
      }
      if (s.number_of_episodes && s.number_of_episodes > 0) {
        out.push({ label: "Total episodes", value: `${s.number_of_episodes}` });
      }
      const runtime = Array.isArray(s.episode_run_time) ? s.episode_run_time[0] : null;
      if (runtime && runtime > 0) out.push({ label: "Typical episode", value: `${runtime} minutes` });
      const startYear = yearOf(s.first_air_date);
      const endYear = yearOf(s.last_air_date);
      if (startYear) {
        const isEnded = s.status === "Ended" || s.status === "Canceled";
        out.push({
          label: "Air years",
          value: isEnded && endYear && endYear !== startYear ? `${startYear}–${endYear}` : `${startYear}–present`,
        });
      }
      if (s.status && s.status !== "Ended" && s.status !== "Returning Series") {
        // Usually interesting only for non-default statuses ("Canceled" etc.)
        out.push({ label: "Status", value: s.status });
      }
      const network = s.networks?.[0]?.name;
      if (network) out.push({ label: "Network", value: network });
      const creators = (s.created_by ?? []).map((c) => c?.name).filter(Boolean) as string[];
      if (creators.length > 0) out.push({ label: "Created by", value: creators.slice(0, 3).join(", ") });
      if (s.original_language && s.original_language !== "en") {
        out.push({ label: "Original language", value: s.original_language.toUpperCase() });
      }
      const topCast = (s.aggregate_credits?.cast ?? s.credits?.cast ?? [])
        .slice(0, 3).map((c) => c?.name).filter(Boolean) as string[];
      if (topCast.length > 0) out.push({ label: "Starring", value: topCast.join(", ") });
    }

    return out;
  }, [raw, mediaType]);

  // Auto-rotate every 5s. The Hook intentionally depends on facts.length so
  // we don't rotate before data lands, and reset when the fact count changes.
  useEffect(() => {
    if (facts.length <= 1) return;
    const interval = setInterval(() => {
      setIdx((i) => (i + 1) % facts.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [facts.length]);

  if (facts.length === 0) return null;
  const current = facts[idx];

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3 text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] font-semibold">
        <Sparkles className="w-3 h-3 text-[var(--ratist-red)]" />
        While you wait — fun facts
      </div>
      <div className="flex items-center gap-3 min-h-[60px]">
        {facts.length > 1 && (
          <button
            type="button"
            onClick={() => setIdx((i) => (i - 1 + facts.length) % facts.length)}
            className="p-1 text-[var(--foreground-muted)] hover:text-white transition-colors shrink-0"
            aria-label="Previous fact"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] font-semibold mb-0.5">
            {current.label}
          </p>
          <p className="text-sm text-white leading-snug">{current.value}</p>
        </div>
        {facts.length > 1 && (
          <button
            type="button"
            onClick={() => setIdx((i) => (i + 1) % facts.length)}
            className="p-1 text-[var(--foreground-muted)] hover:text-white transition-colors shrink-0"
            aria-label="Next fact"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
      {facts.length > 1 && (
        <div className="flex items-center justify-center gap-1 mt-3">
          {facts.map((_, i) => (
            <span
              key={i}
              className={`w-1 h-1 rounded-full transition-colors ${i === idx ? "bg-[var(--ratist-red)]" : "bg-[var(--foreground-muted)]/30"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
