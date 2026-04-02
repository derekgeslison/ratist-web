"use client";

import { useState, useCallback, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Sparkles, ArrowRight, ArrowLeft, SkipForward, RefreshCw, ChevronDown, X, Clock, Bookmark, BookmarkCheck, ArrowUpDown } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { posterUrl } from "@/lib/tmdb";
import RatingBadge from "@/components/RatingBadge";

const GENRES = [
  "Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary",
  "Drama", "Family", "Fantasy", "History", "Horror", "Music",
  "Mystery", "Romance", "Science Fiction", "Thriller", "War", "Western",
];

const STEPS = [
  { key: "genres", title: "What are you in the mood for?", subtitle: "Pick one or more genres, or skip for a mix of everything." },
  { key: "experience", title: "What kind of experience?", subtitle: "What type of movie are you looking for?" },
  { key: "runtime", title: "How much time do you have?", subtitle: "Skip if you don't care about length." },
  { key: "era", title: "Any era preference?", subtitle: "When was the movie made?" },
  { key: "exclude", title: "Anything to avoid?", subtitle: "Tap genres you want excluded from results." },
] as const;

interface MovieResult {
  tmdbId: number; title: string; posterPath: string | null; year: string;
  overview: string; voteAverage: number; genres: string[];
  runtime: number | null; mpaaRating: string | null;
  streaming: string[]; rentBuy: string[];
  matchScore: number | null; reason: string;
}

type SortMode = "" | "rating" | "match";
const STORAGE_KEY = "ratist-recommend-state";

function loadSaved() {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export default function RecommendPage() {
  const { user } = useAuth();
  const saved = loadSaved();
  const [step, setStep] = useState(saved?.step ?? 0);
  const [selectedGenres, setSelectedGenres] = useState<Set<string>>(new Set(saved?.selectedGenres ?? []));
  const [experience, setExperience] = useState(saved?.experience ?? "");
  const [runtime, setRuntime] = useState(saved?.runtime ?? "");
  const [era, setEra] = useState(saved?.era ?? "");
  const [excludeGenres, setExcludeGenres] = useState<Set<string>>(new Set(saved?.excludeGenres ?? []));
  const [mpaaFilter, setMpaaFilter] = useState(saved?.mpaaFilter ?? "");

  const [results, setResults] = useState<MovieResult[]>(saved?.results ?? []);
  const [visibleCount, setVisibleCount] = useState(saved?.visibleCount ?? 5);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(saved?.hasSearched ?? false);
  const [currentPage, setCurrentPage] = useState(saved?.currentPage ?? 1);
  const [totalPages, setTotalPages] = useState(saved?.totalPages ?? 1);
  const [sortMode, setSortMode] = useState<SortMode>(saved?.sortMode ?? "");
  const [watchlisted, setWatchlisted] = useState<Set<number>>(new Set(saved?.watchlisted ?? []));
  const [watchlistingId, setWatchlistingId] = useState<number | null>(null);

  // Persist state to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        step, selectedGenres: [...selectedGenres], experience, runtime, era,
        excludeGenres: [...excludeGenres], mpaaFilter, results, visibleCount,
        hasSearched, currentPage, totalPages, sortMode, watchlisted: [...watchlisted],
      }));
    } catch {}
  }, [step, selectedGenres, experience, runtime, era, excludeGenres, mpaaFilter, results, visibleCount, hasSearched, currentPage, totalPages, sortMode, watchlisted]);

  const getToken = useCallback(async () => user ? user.getIdToken() : null, [user]);

  async function fetchResults(page = 1, append = false) {
    setLoading(true);
    const token = await getToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch("/api/tools/recommend", {
      method: "POST", headers,
      body: JSON.stringify({
        genres: [...selectedGenres], experience, runtime, era,
        excludeGenres: [...excludeGenres], page,
        sort: sortMode === "rating" ? "rating" : "",
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (append) setResults((prev) => [...prev, ...(data.results ?? [])]);
      else { setResults(data.results ?? []); setVisibleCount(5); }
      setTotalPages(data.totalPages ?? 1);
      setCurrentPage(data.page ?? page);
    }
    setLoading(false);
    setHasSearched(true);
  }

  function handleSubmit() { fetchResults(1, false); }

  function handleSeeMore() {
    if (visibleCount < results.length) setVisibleCount((v: number) => v + 10);
    else if (currentPage < totalPages) { fetchResults(currentPage + 1, true); setVisibleCount((v: number) => v + 10); }
  }

  function handleShuffle() { fetchResults(Math.floor(Math.random() * Math.min(totalPages, 20)) + 1, false); }

  function handleStartOver() {
    setStep(0); setSelectedGenres(new Set()); setExperience(""); setRuntime("");
    setEra(""); setExcludeGenres(new Set()); setMpaaFilter(""); setResults([]);
    setHasSearched(false); setVisibleCount(5); setSortMode("");
    try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
  }

  function handleEditAnswers() { setHasSearched(false); setStep(0); }

  async function addToWatchlist(movie: MovieResult) {
    if (!user || watchlistingId) return;
    setWatchlistingId(movie.tmdbId);
    const token = await getToken();
    if (!token) { setWatchlistingId(null); return; }
    const res = await fetch(`/api/movies/${movie.tmdbId}/watchlist`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: movie.title, poster_path: movie.posterPath }),
    });
    if (res.ok) setWatchlisted((prev) => new Set(prev).add(movie.tmdbId));
    setWatchlistingId(null);
  }

  function toggleGenre(g: string) { setSelectedGenres((p) => { const s = new Set(p); s.has(g) ? s.delete(g) : s.add(g); return s; }); }
  function toggleExclude(g: string) { setExcludeGenres((p) => { const s = new Set(p); s.has(g) ? s.delete(g) : s.add(g); return s; }); }

  const filtered = mpaaFilter
    ? results.filter((r) => mpaaFilter === "NR" ? !r.mpaaRating : r.mpaaRating === mpaaFilter)
    : results;
  const sorted = sortMode === "rating" ? [...filtered].sort((a, b) => b.voteAverage - a.voteAverage)
    : sortMode === "match" ? [...filtered].sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0))
    : filtered;

  const isLastStep = step === STEPS.length - 1;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center gap-3 mb-2">
        <Sparkles className="w-6 h-6 text-[var(--ratist-red)]" />
        <h1 className="text-2xl font-bold text-white">What Should I Watch?</h1>
      </div>
      <p className="text-[var(--foreground-muted)] mb-8">Answer a few quick questions and we&apos;ll find your next movie.</p>

      {!hasSearched ? (
        <>
          {/* Progress dots */}
          <div className="flex items-center gap-2 mb-6">
            {STEPS.map((_, i) => (
              <button key={i} onClick={() => setStep(i)}
                className={`h-1.5 rounded-full transition-all ${i === step ? "w-8 bg-[var(--ratist-red)]" : i < step ? "w-4 bg-[var(--ratist-red)]/50 cursor-pointer" : "w-4 bg-[var(--surface-2)]"}`} />
            ))}
          </div>

          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 sm:p-8 mb-6">
            <h2 className="text-lg font-bold text-white mb-1">{STEPS[step].title}</h2>
            <p className="text-sm text-[var(--foreground-muted)] mb-6">{STEPS[step].subtitle}</p>

            {step === 0 && (
              <div className="flex flex-wrap gap-2">
                {GENRES.map((g) => (
                  <button key={g} onClick={() => toggleGenre(g)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${selectedGenres.has(g) ? "bg-[var(--ratist-red)] text-white" : "bg-[var(--surface-2)] text-[var(--foreground-muted)] hover:text-white border border-[var(--border)]"}`}>
                    {g}
                  </button>
                ))}
              </div>
            )}

            {step === 1 && (
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  { value: "popular", label: "Something popular", desc: "Trending and widely talked about" },
                  { value: "hidden_gem", label: "A hidden gem", desc: "Highly rated but lesser known" },
                  { value: "classic", label: "A certified classic", desc: "Timeless films that defined cinema" },
                  { value: "random", label: "Surprise me!", desc: "Completely random — roll the dice" },
                ].map((opt) => (
                  <button key={opt.value} onClick={() => setExperience(opt.value)}
                    className={`text-left p-4 rounded-xl border transition-colors ${experience === opt.value ? "border-[var(--ratist-red)] bg-[var(--ratist-red)]/10" : "border-[var(--border)] hover:border-[var(--ratist-red)]/50"}`}>
                    <p className="text-sm font-semibold text-white">{opt.label}</p>
                    <p className="text-xs text-[var(--foreground-muted)] mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>
            )}

            {step === 2 && (
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  { value: "short", label: "Quick watch", desc: "Under 100 minutes" },
                  { value: "standard", label: "Standard", desc: "Around 90–140 minutes" },
                  { value: "long", label: "I'm settling in", desc: "2.5 hours or more" },
                  { value: "", label: "Doesn't matter", desc: "Any length is fine" },
                ].map((opt) => (
                  <button key={opt.value} onClick={() => setRuntime(opt.value)}
                    className={`text-left p-4 rounded-xl border transition-colors ${runtime === opt.value ? "border-[var(--ratist-red)] bg-[var(--ratist-red)]/10" : "border-[var(--border)] hover:border-[var(--ratist-red)]/50"}`}>
                    <p className="text-sm font-semibold text-white">{opt.label}</p>
                    <p className="text-xs text-[var(--foreground-muted)] mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>
            )}

            {step === 3 && (
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  { value: "recent", label: "Recent", desc: "Released in the last 3 years" },
                  { value: "2000s", label: "2000s and newer", desc: "Modern filmmaking era" },
                  { value: "pre2000", label: "Pre-2000", desc: "90s, 80s, and earlier" },
                  { value: "", label: "Any era", desc: "Don't care when it was made" },
                ].map((opt) => (
                  <button key={opt.value} onClick={() => setEra(opt.value)}
                    className={`text-left p-4 rounded-xl border transition-colors ${era === opt.value ? "border-[var(--ratist-red)] bg-[var(--ratist-red)]/10" : "border-[var(--border)] hover:border-[var(--ratist-red)]/50"}`}>
                    <p className="text-sm font-semibold text-white">{opt.label}</p>
                    <p className="text-xs text-[var(--foreground-muted)] mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>
            )}

            {step === 4 && (
              <div className="flex flex-wrap gap-2">
                {GENRES.filter((g) => !selectedGenres.has(g)).map((g) => (
                  <button key={g} onClick={() => toggleExclude(g)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${excludeGenres.has(g) ? "bg-red-600/20 text-red-400 border border-red-500/30" : "bg-[var(--surface-2)] text-[var(--foreground-muted)] hover:text-white border border-[var(--border)]"}`}>
                    {excludeGenres.has(g) && <X className="w-3 h-3 inline mr-1" />}{g}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button onClick={() => setStep((s: number) => Math.max(0, s - 1))} disabled={step === 0}
              className="flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-white disabled:opacity-30 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <div className="flex items-center gap-3">
              <button onClick={() => isLastStep ? handleSubmit() : setStep((s: number) => s + 1)}
                className="flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-white transition-colors">
                <SkipForward className="w-4 h-4" /> Skip
              </button>
              {isLastStep ? (
                <button onClick={handleSubmit} disabled={loading}
                  className="flex items-center gap-2 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white font-semibold px-6 py-2.5 rounded-full transition-colors disabled:opacity-50">
                  <Sparkles className="w-4 h-4" /> {loading ? "Finding..." : "Find Movies"}
                </button>
              ) : (
                <button onClick={() => setStep((s: number) => s + 1)}
                  className="flex items-center gap-2 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white font-semibold px-5 py-2.5 rounded-full transition-colors">
                  Next <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </>
      ) : (
        <div>
          {/* Results header */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-bold text-white">
              {results.length > 0 ? "Here's what we found" : "No results"}
            </h2>
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={handleShuffle} disabled={loading}
                className="flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-white transition-colors disabled:opacity-50">
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Shuffle
              </button>
              <button onClick={handleEditAnswers} className="text-sm text-[var(--foreground-muted)] hover:text-white transition-colors">
                Edit answers
              </button>
              <button onClick={handleStartOver} className="text-sm text-[var(--ratist-red)] hover:underline">
                Start over
              </button>
            </div>
          </div>

          {/* Sort + filter bar */}
          {results.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 mb-4 text-xs">
              <div className="flex items-center gap-2">
                <ArrowUpDown className="w-3 h-3 text-[var(--foreground-muted)]" />
                {(["", "rating", "match"] as SortMode[]).map((s) => (
                  <button key={s} onClick={() => setSortMode(s)}
                    className={`px-2 py-1 rounded-md font-medium transition-colors ${sortMode === s ? "bg-[var(--ratist-red)]/20 text-white" : "text-[var(--foreground-muted)] hover:text-white"}`}>
                    {s === "" ? "Default" : s === "rating" ? "Highest Rated" : "Best Match"}
                  </button>
                ))}
              </div>
              <select
                value={mpaaFilter}
                onChange={(e) => setMpaaFilter(e.target.value)}
                className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs text-white focus:outline-none"
              >
                <option value="">All ratings</option>
                <option value="G">G</option>
                <option value="PG">PG</option>
                <option value="PG-13">PG-13</option>
                <option value="R">R</option>
                <option value="NR">Not Rated</option>
              </select>
            </div>
          )}

          {loading && results.length === 0 ? (
            <div className="text-center py-16">
              <Sparkles className="w-10 h-10 mx-auto mb-4 text-[var(--ratist-red)] animate-pulse" />
              <p className="text-[var(--foreground-muted)]">Finding your perfect movie...</p>
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-16 text-[var(--foreground-muted)]">
              <p className="mb-3">No movies matched your criteria. Try broadening your filters.</p>
              <button onClick={handleStartOver} className="text-sm text-[var(--ratist-red)] hover:underline">Start over</button>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {sorted.slice(0, visibleCount).map((movie, i) => (
                  <div key={`${movie.tmdbId}-${i}`} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--ratist-red)]/50 transition-colors">
                    <div className="flex gap-4">
                      <Link href={`/movies/${movie.tmdbId}`} className="relative w-16 h-24 shrink-0 rounded-lg overflow-hidden bg-[var(--surface-2)]">
                        {movie.posterPath ? (
                          <Image src={posterUrl(movie.posterPath, "w185")} alt={movie.title} fill sizes="64px" className="object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs text-[var(--foreground-muted)]">?</div>
                        )}
                      </Link>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <Link href={`/movies/${movie.tmdbId}`} className="text-sm font-semibold text-white hover:text-[var(--ratist-red)] transition-colors line-clamp-1">{movie.title}</Link>
                            <div className="flex items-center gap-2 text-xs text-[var(--foreground-muted)] mt-0.5">
                              <span>{movie.year}</span>
                              {movie.mpaaRating && <span className="border border-[var(--border)] rounded px-1 py-0.5 text-[10px]">{movie.mpaaRating}</span>}
                              {movie.runtime && <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" />{movie.runtime}m</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {movie.matchScore != null && movie.matchScore > 0 && (
                              <span className="text-[10px] font-bold bg-green-500/15 text-green-400 px-1.5 py-0.5 rounded-full">{movie.matchScore * 10}% match</span>
                            )}
                            <RatingBadge type="community" score={movie.voteAverage} size="sm" />
                          </div>
                        </div>

                        <p className="text-xs text-[var(--foreground-muted)] mt-1.5 line-clamp-2">{movie.overview}</p>

                        {/* Genres */}
                        <div className="flex flex-wrap gap-1 mt-2">
                          {movie.genres.map((g) => (
                            <span key={g} className="text-[10px] bg-[var(--surface-2)] text-[var(--foreground-muted)] px-1.5 py-0.5 rounded">{g}</span>
                          ))}
                        </div>

                        {/* Streaming + actions row */}
                        <div className="flex items-center justify-between mt-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            {movie.streaming.length > 0 && (
                              <span className="text-[10px] text-green-400">Stream: {movie.streaming.join(", ")}</span>
                            )}
                            {movie.streaming.length === 0 && movie.rentBuy.length > 0 && (
                              <span className="text-[10px] text-blue-400">Rent: {movie.rentBuy.join(", ")}</span>
                            )}
                            <span className="inline-block text-[10px] font-medium bg-[var(--ratist-red)]/10 text-[var(--ratist-red)] px-1.5 py-0.5 rounded-full">{movie.reason}</span>
                          </div>
                          {user && (
                            <button
                              onClick={() => addToWatchlist(movie)}
                              disabled={watchlisted.has(movie.tmdbId) || watchlistingId === movie.tmdbId}
                              className={`flex items-center gap-1 text-xs shrink-0 transition-colors ${watchlisted.has(movie.tmdbId) ? "text-blue-400 cursor-default" : "text-[var(--foreground-muted)] hover:text-blue-400"}`}
                              title={watchlisted.has(movie.tmdbId) ? "In your watchlist" : "Add to watchlist"}
                            >
                              {watchlisted.has(movie.tmdbId) ? <BookmarkCheck className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {(visibleCount < sorted.length || currentPage < totalPages) && (
                <div className="text-center mt-6">
                  <button onClick={handleSeeMore} disabled={loading}
                    className="flex items-center gap-2 mx-auto text-sm text-[var(--ratist-red)] hover:underline disabled:opacity-50">
                    <ChevronDown className="w-4 h-4" /> {loading ? "Loading..." : "See more"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
