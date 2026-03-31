"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Search, Swords, X, ChevronDown, ChevronUp } from "lucide-react";
import ShareButton from "@/components/ShareButton";

const TMDB_IMG = "https://image.tmdb.org/t/p/w342";

interface MovieResult {
  id: number;
  title: string;
  posterPath: string | null;
  releaseDate: string;
}

interface RatingBreakdown {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  releaseDate: string;
  ratistScore: number | null;
  totalRatings: number;
  breakdown: { category: string; score: number | null }[];
  fields: Record<string, number | null>;
}

const CATEGORIES = [
  { label: "Story", key: "Story", fields: [
    { key: "plot", label: "Plot" }, { key: "premiseOriginality", label: "Originality" },
    { key: "storytelling", label: "Storytelling" }, { key: "characterDev", label: "Character Dev" },
    { key: "pacingClimax", label: "Pacing" },
  ]},
  { label: "Style", key: "Style", fields: [
    { key: "cinematography", label: "Cinematography" }, { key: "locationCost", label: "Location" },
    { key: "artisticEffect", label: "Artistic Effect" }, { key: "visualEffects", label: "VFX" },
    { key: "musicSound", label: "Music & Sound" },
  ]},
  { label: "Emotion", key: "Emotion", fields: [
    { key: "overallEmotion", label: "Emotion" }, { key: "relatability", label: "Relatability" },
    { key: "meaning", label: "Meaning" }, { key: "movingness", label: "Movingness" },
  ]},
  { label: "Acting", key: "Acting", fields: [
    { key: "casting", label: "Casting" }, { key: "actingQuality", label: "Acting Quality" },
    { key: "dialogueScripting", label: "Dialogue" }, { key: "blockingChoreo", label: "Blocking & Choreo" },
  ]},
  { label: "Entertainment", key: "Entertainment", fields: [
    { key: "appeal", label: "Appeal" }, { key: "superficialAllure", label: "Superficial Allure" },
    { key: "choreography", label: "Choreography" },
  ]},
];

function MoviePicker({ label, onSelect, onClear, selected }: {
  label: string;
  onSelect: (m: MovieResult) => void;
  onClear: () => void;
  selected: MovieResult | null;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MovieResult[]>([]);

  useEffect(() => {
    if (selected || query.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/tmdb/movie/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setResults(data.results ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [query, selected]);

  if (selected) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="relative w-32 rounded-xl overflow-hidden bg-[var(--surface-2)] shadow-lg" style={{ aspectRatio: "2/3" }}>
          {selected.posterPath ? (
            <Image src={`${TMDB_IMG}${selected.posterPath}`} alt={selected.title} fill sizes="128px" className="object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[var(--foreground-muted)] text-xs p-2">{selected.title}</div>
          )}
        </div>
        <div>
          <p className="text-sm font-semibold text-white">{selected.title}</p>
          <p className="text-xs text-[var(--foreground-muted)]">{selected.releaseDate?.slice(0, 4)}</p>
        </div>
        <button onClick={() => { onClear(); setQuery(""); }} className="flex items-center gap-1 text-xs text-[var(--foreground-muted)] hover:text-white transition-colors">
          <X className="w-3 h-3" /> Change
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="w-32 rounded-xl bg-[var(--surface)] border-2 border-dashed border-[var(--border)] flex items-center justify-center" style={{ aspectRatio: "2/3" }}>
        <span className="text-xs text-[var(--foreground-muted)] px-3 text-center">{label}</span>
      </div>
      <div className="relative w-32 sm:w-48">
        <Search className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)]" />
        <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search movie…"
          className="w-full pl-8 sm:pl-9 pr-2 sm:pr-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-xs sm:text-sm text-white placeholder-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]" />
        {results.length > 0 && (
          <div className="absolute z-10 top-full mt-1 w-[200px] sm:w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden shadow-xl">
            {results.map((m) => (
              <button key={m.id} onClick={() => { onSelect(m); setResults([]); }}
                className="flex items-center gap-2 w-full px-3 py-2 hover:bg-[var(--surface-2)] text-left">
                {m.posterPath && (
                  <Image src={`https://image.tmdb.org/t/p/w92${m.posterPath}`} alt={m.title} width={20} height={30} className="rounded object-cover shrink-0" style={{ width: 20, height: 30 }} />
                )}
                <div>
                  <p className="text-sm text-white">{m.title}</p>
                  <p className="text-xs text-[var(--foreground-muted)]">{m.releaseDate?.slice(0, 4)}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

type BarState = "win" | "tie" | "lose";

function ScoreBar({ score, state }: { score: number | null; state: BarState }) {
  if (score === null) return <span className="text-xs text-[var(--foreground-muted)]">—</span>;
  const pct = Math.round((score / 10) * 100);
  const barColor = state === "win" ? "bg-green-500" : state === "tie" ? "bg-yellow-500" : "bg-[var(--border)]";
  const textColor = state === "win" ? "text-green-400" : state === "tie" ? "text-yellow-400" : "text-[var(--foreground-muted)]";
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-2 bg-[var(--surface-2)] rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-semibold w-8 text-right ${textColor}`}>
        {score.toFixed(1)}
      </span>
    </div>
  );
}

export default function MatchupPage() {
  const [movie1, setMovie1] = useState<MovieResult | null>(null);
  const [movie2, setMovie2] = useState<MovieResult | null>(null);
  const [data1, setData1] = useState<RatingBreakdown | null>(null);
  const [data2, setData2] = useState<RatingBreakdown | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!movie1 || !movie2) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/movies/${movie1.id}/matchup`).then((r) => r.json()),
      fetch(`/api/movies/${movie2.id}/matchup`).then((r) => r.json()),
    ]).then(([d1, d2]) => {
      setData1(d1);
      setData2(d2);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [movie1, movie2]);

  const hasData = data1 && data2;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center gap-3 mb-2">
        <Swords className="w-6 h-6 text-[var(--ratist-red)]" />
        <h1 className="text-2xl font-bold text-white">The Matchup</h1>
      </div>
      <p className="text-[var(--foreground-muted)] mb-10">Pick two movies and see how they stack up against each other across every Ratist rating category.</p>

      {/* Movie pickers */}
      <div className="flex items-center justify-center gap-6 sm:gap-12 mb-10">
        <MoviePicker label="Pick Movie 1" selected={movie1} onSelect={(m) => { setMovie1(m); setData1(null); }} onClear={() => { setMovie1(null); setData1(null); }} />
        <div className="flex flex-col items-center gap-1 shrink-0">
          <Swords className="w-8 h-8 text-[var(--ratist-red)]" />
          <span className="text-xs text-[var(--foreground-muted)] font-bold uppercase tracking-widest">VS</span>
        </div>
        <MoviePicker label="Pick Movie 2" selected={movie2} onSelect={(m) => { setMovie2(m); setData2(null); }} onClear={() => { setMovie2(null); setData2(null); }} />
      </div>

      {movie1 && movie2 && loading && (
        <p className="text-[var(--foreground-muted)] text-center py-10">Loading ratings…</p>
      )}

      {hasData && !loading && (
        <div>
          {/* Overall scores */}
          {(() => {
            const sc1 = data1.ratistScore ?? 0;
            const sc2 = data2.ratistScore ?? 0;
            const bothRated = data1.totalRatings > 0 && data2.totalRatings > 0;
            const overallTie = bothRated && sc1 === sc2;
            const o1wins = bothRated && sc1 > sc2;
            const o2wins = bothRated && sc2 > sc1;
            const box1 = o1wins ? "bg-green-500/10 border-green-500/40" : overallTie ? "bg-yellow-500/10 border-yellow-500/40" : "bg-[var(--surface)] border-[var(--border)]";
            const box2 = o2wins ? "bg-green-500/10 border-green-500/40" : overallTie ? "bg-yellow-500/10 border-yellow-500/40" : "bg-[var(--surface)] border-[var(--border)]";
            return (
              <div className="grid grid-cols-3 gap-3 mb-8 text-center">
                <div className={`p-4 rounded-xl border ${box1}`}>
                  <p className="text-xs text-[var(--foreground-muted)] mb-1">Ratist Score</p>
                  <p className="text-3xl font-bold text-white">{data1.ratistScore?.toFixed(1) ?? "—"}</p>
                  <p className="text-xs text-[var(--foreground-muted)] mt-1">{data1.totalRatings} rating{data1.totalRatings !== 1 ? "s" : ""}</p>
                </div>
                <div className="p-4 rounded-xl bg-[var(--surface)] border border-[var(--border)] flex flex-col items-center justify-center">
                  <p className="text-xs text-[var(--foreground-muted)] font-semibold uppercase tracking-wider">Overall</p>
                </div>
                <div className={`p-4 rounded-xl border ${box2}`}>
                  <p className="text-xs text-[var(--foreground-muted)] mb-1">Ratist Score</p>
                  <p className="text-3xl font-bold text-white">{data2.ratistScore?.toFixed(1) ?? "—"}</p>
                  <p className="text-xs text-[var(--foreground-muted)] mt-1">{data2.totalRatings} rating{data2.totalRatings !== 1 ? "s" : ""}</p>
                </div>
              </div>
            );
          })()}

          {/* No ratings notice */}
          {(data1.totalRatings === 0 || data2.totalRatings === 0) && (
            <p className="text-sm text-[var(--foreground-muted)] text-center mb-6">
              {data1.totalRatings === 0 && data2.totalRatings === 0
                ? "Neither movie has enough Ratist ratings for Matchup yet."
                : `${data1.totalRatings === 0 ? data1.title : data2.title} doesn't have enough Ratist ratings for Matchup yet.`}
            </p>
          )}

          {/* Category breakdown */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_1fr] gap-0 divide-y divide-[var(--border)]">
              {/* Header */}
              <div className="col-span-3 grid grid-cols-[1fr_120px_1fr] bg-[var(--surface-2)] px-4 py-3">
                <p className="text-sm font-semibold text-white truncate">{data1.title}</p>
                <p className="text-xs text-[var(--foreground-muted)] text-center self-center">Category</p>
                <p className="text-sm font-semibold text-white truncate text-right">{data2.title}</p>
              </div>

              {CATEGORIES.map(({ label, key, fields }) => {
                const s1 = data1.breakdown.find((b) => b.category === key)?.score ?? null;
                const s2 = data2.breakdown.find((b) => b.category === key)?.score ?? null;
                const bothPresent = s1 !== null && s2 !== null;
                const isTie = bothPresent && s1 === s2;
                const state1: BarState = !bothPresent ? "lose" : s1! > s2! ? "win" : isTie ? "tie" : "lose";
                const state2: BarState = !bothPresent ? "lose" : s2! > s1! ? "win" : isTie ? "tie" : "lose";
                const isExpanded = expandedCats.has(key);
                return (
                  <div key={key} className="col-span-3">
                    <button
                      onClick={() => setExpandedCats((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; })}
                      className="w-full grid grid-cols-[1fr_120px_1fr] items-center px-4 py-2.5 gap-3 hover:bg-[var(--surface-2)]/50 transition-colors"
                    >
                      <ScoreBar score={s1} state={state1} />
                      <div className="flex items-center justify-center gap-1">
                        <p className="text-xs text-[var(--foreground-muted)] shrink-0">{label}</p>
                        {isExpanded ? <ChevronUp className="w-3 h-3 text-[var(--foreground-muted)]" /> : <ChevronDown className="w-3 h-3 text-[var(--foreground-muted)]" />}
                      </div>
                      <div className="flex items-center gap-2 flex-row-reverse">
                        <ScoreBar score={s2} state={state2} />
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="px-4 pb-2 space-y-1.5 bg-[var(--surface-2)]/30">
                        {fields.map(({ key: fk, label: fl }) => {
                          const fs1 = data1.fields[fk] ?? null;
                          const fs2 = data2.fields[fk] ?? null;
                          const fboth = fs1 !== null && fs2 !== null;
                          const ftie = fboth && Math.abs(fs1! - fs2!) < 0.05;
                          const fst1: BarState = !fboth ? "lose" : fs1! > fs2! ? "win" : ftie ? "tie" : "lose";
                          const fst2: BarState = !fboth ? "lose" : fs2! > fs1! ? "win" : ftie ? "tie" : "lose";
                          return (
                            <div key={fk} className="grid grid-cols-[1fr_120px_1fr] items-center gap-3">
                              <ScoreBar score={fs1 != null ? Math.round(fs1 * 10) / 10 : null} state={fst1} />
                              <p className="text-[10px] text-[var(--foreground-muted)] text-center">{fl}</p>
                              <div className="flex items-center gap-2 flex-row-reverse">
                                <ScoreBar score={fs2 != null ? Math.round(fs2 * 10) / 10 : null} state={fst2} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Share + Win count */}
          {data1.totalRatings > 0 && data2.totalRatings > 0 && (
            <div className="flex justify-center mt-4">
              <ShareButton
                label="Share matchup"
                text={`${data1.title} (${data1.ratistScore?.toFixed(1) ?? "?"}) vs ${data2.title} (${data2.ratistScore?.toFixed(1) ?? "?"}) — see the full breakdown on The Ratist!`}
                url={`${process.env.NEXT_PUBLIC_SITE_URL ?? "https://theratist.com"}/tools/matchup`}
                cardImageUrl={`/api/og/matchup?movie1=${data1.tmdbId}&movie2=${data2.tmdbId}`}
              />
            </div>
          )}
          {data1.totalRatings > 0 && data2.totalRatings > 0 && (() => {
            const wins1 = CATEGORIES.filter(({ key }) => {
              const s1 = data1.breakdown.find((b) => b.category === key)?.score ?? null;
              const s2 = data2.breakdown.find((b) => b.category === key)?.score ?? null;
              return s1 !== null && s2 !== null && s1 > s2;
            }).length;
            const wins2 = CATEGORIES.filter(({ key }) => {
              const s1 = data1.breakdown.find((b) => b.category === key)?.score ?? null;
              const s2 = data2.breakdown.find((b) => b.category === key)?.score ?? null;
              return s1 !== null && s2 !== null && s2 > s1;
            }).length;
            return (
              <div className="flex justify-between mt-4 text-sm text-[var(--foreground-muted)]">
                <span className={wins1 > wins2 ? "text-white font-semibold" : ""}>{wins1} categor{wins1 !== 1 ? "ies" : "y"} won</span>
                <span className={wins2 > wins1 ? "text-white font-semibold" : ""}>{wins2} categor{wins2 !== 1 ? "ies" : "y"} won</span>
              </div>
            );
          })()}
        </div>
      )}

      {(!movie1 || !movie2) && (
        <p className="text-[var(--foreground-muted)] text-sm text-center py-8">Select two movies above to compare them.</p>
      )}
    </div>
  );
}
