"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";

interface Props {
  tmdbId: number;
  mediaType: "movie" | "tv";
}

// Format a budget or revenue number like Cine-Q does. Keeps numbers human-
// readable on a small card ("$158M" beats "158,420,000").
function formatMoney(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)} billion`;
  if (n >= 1_000_000) return `$${Math.round(n / 1_000_000)} million`;
  if (n >= 1000) return `$${Math.round(n / 1000)}K`;
  return `$${n}`;
}

// Yyyy from a "YYYY-MM-DD" string — tolerates missing values.
function yearOf(date?: string | null): string | null {
  if (!date || date.length < 4) return null;
  return date.slice(0, 4);
}

// Convert ISO 639 language code ("fr") and ISO 3166 country code ("US") into
// readable English names using Intl.DisplayNames. Node 18+ supports this.
const languageNames = typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function"
  ? new Intl.DisplayNames(["en"], { type: "language" })
  : null;
const regionNames = typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function"
  ? new Intl.DisplayNames(["en"], { type: "region" })
  : null;

function nameForLanguage(code: string | null | undefined): string | null {
  if (!code) return null;
  try { return languageNames?.of(code.toUpperCase()) ?? languageNames?.of(code) ?? null; } catch { return null; }
}

function nameForCountry(code: string | null | undefined): string | null {
  if (!code) return null;
  try { return regionNames?.of(code.toUpperCase()) ?? null; } catch { return null; }
}

// Join a list of names with commas + "and" for the final one. "A, B, and C".
function commaList(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

/**
 * Builds full-sentence "fun fact" blurbs from a TMDB movie/show payload.
 * Each fact is a single sentence — no "Label: value" vibe. Fields that are
 * missing, zero, or uninteresting (English when the filter is "non-English")
 * simply don't emit a card.
 */
function buildMovieFacts(raw: Record<string, unknown>): string[] {
  const m = raw as {
    title?: string;
    tagline?: string;
    budget?: number;
    revenue?: number;
    runtime?: number;
    release_date?: string;
    original_language?: string;
    belongs_to_collection?: { name?: string } | null;
    production_companies?: Array<{ name?: string; origin_country?: string }>;
    production_countries?: Array<{ iso_3166_1?: string; name?: string }>;
    spoken_languages?: Array<{ iso_639_1?: string; english_name?: string }>;
    genres?: Array<{ name?: string }>;
    credits?: { cast?: Array<{ name?: string; character?: string }>; crew?: Array<{ name?: string; job?: string }> };
  };
  const facts: string[] = [];
  const title = m.title ?? "this film";

  if (m.tagline) facts.push(`“${m.tagline}”`);

  const year = yearOf(m.release_date);
  if (year) facts.push(`${title} was released in ${year}.`);

  // Combined budget + revenue if we have both — reads better than two separate cards.
  if (m.budget && m.budget > 0 && m.revenue && m.revenue > 0) {
    const net = m.revenue - m.budget;
    const profitSide = net > 0 ? `a profit of ${formatMoney(net)}` : `a loss of ${formatMoney(Math.abs(net))}`;
    facts.push(`Made on a ${formatMoney(m.budget)} budget, it earned ${formatMoney(m.revenue)} at the box office — ${profitSide}.`);
  } else {
    if (m.budget && m.budget > 0) facts.push(`Made on a ${formatMoney(m.budget)} production budget.`);
    if (m.revenue && m.revenue > 0) facts.push(`Earned ${formatMoney(m.revenue)} at the global box office.`);
  }

  if (m.runtime && m.runtime > 0) {
    const h = Math.floor(m.runtime / 60);
    const mm = m.runtime % 60;
    const duration = h > 0 ? (mm > 0 ? `${h} hour${h === 1 ? "" : "s"} and ${mm} minute${mm === 1 ? "" : "s"}` : `${h} hour${h === 1 ? "" : "s"}`) : `${mm} minutes`;
    facts.push(`Runtime: ${duration}.`);
  }

  const director = m.credits?.crew?.find((c) => c?.job === "Director")?.name;
  if (director) facts.push(`Directed by ${director}.`);

  const writers = (m.credits?.crew ?? []).filter((c) => c?.job === "Screenplay" || c?.job === "Writer").slice(0, 2).map((c) => c?.name).filter(Boolean) as string[];
  if (writers.length > 0 && !writers.some((w) => w === director)) {
    facts.push(`Written by ${commaList(writers)}.`);
  }

  const topCast = (m.credits?.cast ?? []).slice(0, 3).map((c) => c?.name).filter(Boolean) as string[];
  if (topCast.length >= 2) facts.push(`Stars ${commaList(topCast)}.`);

  const companies = (m.production_companies ?? []).slice(0, 2).map((c) => c?.name).filter(Boolean) as string[];
  if (companies.length > 0) facts.push(`Produced by ${commaList(companies)}.`);

  const countries = (m.production_countries ?? [])
    .map((c) => nameForCountry(c?.iso_3166_1) ?? c?.name)
    .filter((n): n is string => !!n);
  if (countries.length > 0 && !countries.every((c) => c === "United States")) {
    facts.push(`Filmed in ${commaList(countries.slice(0, 2))}.`);
  }

  if (m.original_language && m.original_language !== "en") {
    const langName = nameForLanguage(m.original_language);
    if (langName) facts.push(`Originally in ${langName}.`);
  }

  if (m.belongs_to_collection?.name) {
    facts.push(`Part of the ${m.belongs_to_collection.name}.`);
  }

  const genres = (m.genres ?? []).slice(0, 3).map((g) => g?.name).filter(Boolean) as string[];
  if (genres.length >= 2) facts.push(`Categorized as ${commaList(genres).toLowerCase()}.`);

  return facts;
}

function buildShowFacts(raw: Record<string, unknown>): string[] {
  const s = raw as {
    name?: string;
    tagline?: string;
    number_of_seasons?: number;
    number_of_episodes?: number;
    episode_run_time?: number[];
    first_air_date?: string;
    last_air_date?: string;
    status?: string;
    type?: string;
    original_language?: string;
    origin_country?: string[];
    networks?: Array<{ name?: string }>;
    production_companies?: Array<{ name?: string }>;
    spoken_languages?: Array<{ iso_639_1?: string; english_name?: string }>;
    created_by?: Array<{ name?: string }>;
    aggregate_credits?: { cast?: Array<{ name?: string; roles?: Array<{ character?: string }> }> };
    credits?: { cast?: Array<{ name?: string }> };
    genres?: Array<{ name?: string }>;
  };
  const facts: string[] = [];
  const name = s.name ?? "this series";

  if (s.tagline) facts.push(`“${s.tagline}”`);

  // Combined seasons + episodes if we have both.
  const startYear = yearOf(s.first_air_date);
  const endYear = yearOf(s.last_air_date);
  const isEnded = s.status === "Ended" || s.status === "Canceled";
  const yearPhrase = startYear
    ? (isEnded && endYear && endYear !== startYear ? ` between ${startYear} and ${endYear}` : startYear ? ` since ${startYear}` : "")
    : "";
  const lifespanStartPhrase = isEnded && startYear && endYear && endYear !== startYear
    ? `from ${startYear} to ${endYear}`
    : startYear ? `since ${startYear}` : "";
  if (s.number_of_seasons && s.number_of_seasons > 0 && s.number_of_episodes && s.number_of_episodes > 0) {
    facts.push(`${name} has aired ${s.number_of_episodes} episode${s.number_of_episodes === 1 ? "" : "s"} across ${s.number_of_seasons} season${s.number_of_seasons === 1 ? "" : "s"}${yearPhrase ? yearPhrase : ""}.`);
  } else {
    if (s.number_of_seasons && s.number_of_seasons > 0) {
      facts.push(`${name} spans ${s.number_of_seasons} season${s.number_of_seasons === 1 ? "" : "s"}${yearPhrase}.`);
    }
    if (s.number_of_episodes && s.number_of_episodes > 0) {
      facts.push(`${s.number_of_episodes} total episode${s.number_of_episodes === 1 ? "" : "s"} have aired.`);
    }
  }

  if (startYear) {
    if (isEnded && endYear && endYear !== startYear) {
      facts.push(`Original run: ${startYear}–${endYear} (${s.status?.toLowerCase()}).`);
    } else if (isEnded) {
      facts.push(`Premiered and concluded in ${startYear}.`);
    } else if (lifespanStartPhrase) {
      facts.push(`On the air ${lifespanStartPhrase}${s.status && s.status !== "Returning Series" ? ` (${s.status.toLowerCase()})` : ""}.`);
    }
  }

  const runtime = Array.isArray(s.episode_run_time) ? s.episode_run_time[0] : null;
  if (runtime && runtime > 0) facts.push(`Typical episodes run ${runtime} minutes.`);

  const network = s.networks?.[0]?.name;
  if (network) facts.push(`Originally aired on ${network}.`);

  const creators = (s.created_by ?? []).map((c) => c?.name).filter(Boolean) as string[];
  if (creators.length > 0) facts.push(`Created by ${commaList(creators.slice(0, 3))}.`);

  const topCastRaw = s.aggregate_credits?.cast ?? s.credits?.cast ?? [];
  const topCast = topCastRaw.slice(0, 3).map((c) => c?.name).filter(Boolean) as string[];
  if (topCast.length >= 2) facts.push(`Starring ${commaList(topCast)}.`);

  const origin = (s.origin_country ?? []).map(nameForCountry).filter((n): n is string => !!n);
  if (origin.length > 0 && !origin.every((c) => c === "United States")) {
    facts.push(`Produced in ${commaList(origin.slice(0, 2))}.`);
  }

  if (s.original_language && s.original_language !== "en") {
    const langName = nameForLanguage(s.original_language);
    if (langName) facts.push(`Originally in ${langName}.`);
  }

  const companies = (s.production_companies ?? []).slice(0, 2).map((c) => c?.name).filter(Boolean) as string[];
  if (companies.length > 0 && !companies.every((c) => c === network)) {
    facts.push(`Produced by ${commaList(companies)}.`);
  }

  if (s.type && s.type !== "Scripted") {
    facts.push(`A ${s.type.toLowerCase()} series.`);
  }

  const genres = (s.genres ?? []).slice(0, 3).map((g) => g?.name).filter(Boolean) as string[];
  if (genres.length >= 2) facts.push(`Categorized as ${commaList(genres).toLowerCase()}.`);

  return facts;
}

/**
 * A fun-facts carousel that entertains users while the AI generation runs.
 * Each fact is a full-sentence blurb built from the rich TMDB payload the
 * server route assembles. Missing/zero fields are filtered out entirely so
 * users never see an empty "Budget: $0" card.
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

  const facts: string[] = useMemo(() => {
    if (!raw) return [];
    return mediaType === "movie" ? buildMovieFacts(raw) : buildShowFacts(raw);
  }, [raw, mediaType]);

  // Auto-rotate every 6s (slightly longer so a whole sentence has time to
  // land). Reset timer whenever fact count changes.
  useEffect(() => {
    if (facts.length <= 1) return;
    const interval = setInterval(() => {
      setIdx((i) => (i + 1) % facts.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [facts.length]);

  if (facts.length === 0) return null;
  const current = facts[idx];

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3 text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] font-semibold">
        <Sparkles className="w-3 h-3 text-[var(--ratist-red)]" />
        While you wait — did you know…
      </div>
      <div className="flex items-start gap-3 min-h-[72px]">
        {facts.length > 1 && (
          <button
            type="button"
            onClick={() => setIdx((i) => (i - 1 + facts.length) % facts.length)}
            className="p-1 text-[var(--foreground-muted)] hover:text-white transition-colors shrink-0 mt-1"
            aria-label="Previous fact"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
        <p className="flex-1 min-w-0 text-sm text-white leading-relaxed">{current}</p>
        {facts.length > 1 && (
          <button
            type="button"
            onClick={() => setIdx((i) => (i + 1) % facts.length)}
            className="p-1 text-[var(--foreground-muted)] hover:text-white transition-colors shrink-0 mt-1"
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
