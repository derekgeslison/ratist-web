"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { Sparkles, ArrowRight, ArrowLeft, SkipForward, RefreshCw, ChevronDown, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { posterUrl } from "@/lib/tmdb";
import RatingBadge from "@/components/RatingBadge";

/* ── Genre options ── */
const GENRES = [
  "Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary",
  "Drama", "Family", "Fantasy", "History", "Horror", "Music",
  "Mystery", "Romance", "Science Fiction", "Thriller", "War", "Western",
];

/* ── Quiz steps ── */
const STEPS = [
  { key: "genres", title: "What are you in the mood for?", subtitle: "Pick one or more genres. Or skip to get a mix of everything." },
  { key: "experience", title: "What kind of experience?", subtitle: "What type of movie are you looking for?" },
  { key: "runtime", title: "How much time do you have?", subtitle: "Optional — skip if you don't care about length." },
  { key: "era", title: "Any era preference?", subtitle: "When was the movie made?" },
  { key: "exclude", title: "Anything to avoid?", subtitle: "Tap genres you don't want in your results." },
] as const;

interface MovieResult {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  year: string;
  overview: string;
  voteAverage: number;
  reason: string;
}

export default function RecommendPage() {
  const { user } = useAuth();

  // Quiz state
  const [step, setStep] = useState(0);
  const [selectedGenres, setSelectedGenres] = useState<Set<string>>(new Set());
  const [experience, setExperience] = useState("");
  const [runtime, setRuntime] = useState("");
  const [era, setEra] = useState("");
  const [excludeGenres, setExcludeGenres] = useState<Set<string>>(new Set());

  // Results state
  const [results, setResults] = useState<MovieResult[]>([]);
  const [visibleCount, setVisibleCount] = useState(5);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const getToken = useCallback(async () => user ? user.getIdToken() : null, [user]);

  async function fetchResults(page = 1, append = false) {
    setLoading(true);
    const token = await getToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch("/api/tools/recommend", {
      method: "POST",
      headers,
      body: JSON.stringify({
        genres: [...selectedGenres],
        experience,
        runtime,
        era,
        excludeGenres: [...excludeGenres],
        page,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (append) {
        setResults((prev) => [...prev, ...(data.results ?? [])]);
      } else {
        setResults(data.results ?? []);
        setVisibleCount(5);
      }
      setTotalPages(data.totalPages ?? 1);
      setCurrentPage(data.page ?? page);
    }
    setLoading(false);
    setHasSearched(true);
  }

  function handleSubmit() {
    fetchResults(1, false);
  }

  function handleSeeMore() {
    if (visibleCount < results.length) {
      setVisibleCount((v) => v + 10);
    } else if (currentPage < totalPages) {
      fetchResults(currentPage + 1, true);
      setVisibleCount((v) => v + 10);
    }
  }

  function handleShuffle() {
    fetchResults(Math.floor(Math.random() * Math.min(totalPages, 20)) + 1, false);
  }

  function handleStartOver() {
    setStep(0);
    setSelectedGenres(new Set());
    setExperience("");
    setRuntime("");
    setEra("");
    setExcludeGenres(new Set());
    setResults([]);
    setHasSearched(false);
    setVisibleCount(5);
  }

  function toggleGenre(g: string) {
    setSelectedGenres((prev) => { const s = new Set(prev); if (s.has(g)) s.delete(g); else s.add(g); return s; });
  }
  function toggleExclude(g: string) {
    setExcludeGenres((prev) => { const s = new Set(prev); if (s.has(g)) s.delete(g); else s.add(g); return s; });
  }

  const isLastStep = step === STEPS.length - 1;
  const showResults = hasSearched;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center gap-3 mb-2">
        <Sparkles className="w-6 h-6 text-[var(--ratist-red)]" />
        <h1 className="text-2xl font-bold text-white">What Should I Watch?</h1>
      </div>
      <p className="text-[var(--foreground-muted)] mb-8">Answer a few quick questions and we&apos;ll find your next movie.</p>

      {!showResults ? (
        <>
          {/* Progress dots */}
          <div className="flex items-center gap-2 mb-6">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${i === step ? "w-8 bg-[var(--ratist-red)]" : i < step ? "w-4 bg-[var(--ratist-red)]/50" : "w-4 bg-[var(--surface-2)]"}`}
              />
            ))}
          </div>

          {/* Question card */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 sm:p-8 mb-6">
            <h2 className="text-lg font-bold text-white mb-1">{STEPS[step].title}</h2>
            <p className="text-sm text-[var(--foreground-muted)] mb-6">{STEPS[step].subtitle}</p>

            {/* Step 1: Genre picker */}
            {step === 0 && (
              <div className="flex flex-wrap gap-2">
                {GENRES.map((g) => (
                  <button
                    key={g}
                    onClick={() => toggleGenre(g)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      selectedGenres.has(g)
                        ? "bg-[var(--ratist-red)] text-white"
                        : "bg-[var(--surface-2)] text-[var(--foreground-muted)] hover:text-white border border-[var(--border)]"
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            )}

            {/* Step 2: Experience type */}
            {step === 1 && (
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  { value: "popular", label: "Something popular", desc: "Trending and widely talked about" },
                  { value: "hidden_gem", label: "A hidden gem", desc: "Highly rated but lesser known" },
                  { value: "classic", label: "A certified classic", desc: "Timeless films that defined cinema" },
                  { value: "random", label: "Surprise me!", desc: "Completely random — roll the dice" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setExperience(opt.value)}
                    className={`text-left p-4 rounded-xl border transition-colors ${
                      experience === opt.value
                        ? "border-[var(--ratist-red)] bg-[var(--ratist-red)]/10"
                        : "border-[var(--border)] hover:border-[var(--ratist-red)]/50"
                    }`}
                  >
                    <p className="text-sm font-semibold text-white">{opt.label}</p>
                    <p className="text-xs text-[var(--foreground-muted)] mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>
            )}

            {/* Step 3: Runtime */}
            {step === 2 && (
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  { value: "short", label: "Quick watch", desc: "Under 100 minutes" },
                  { value: "standard", label: "Standard", desc: "Around 90–140 minutes" },
                  { value: "long", label: "I'm settling in", desc: "2.5 hours or more" },
                  { value: "", label: "Doesn't matter", desc: "Any length is fine" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setRuntime(opt.value)}
                    className={`text-left p-4 rounded-xl border transition-colors ${
                      runtime === opt.value
                        ? "border-[var(--ratist-red)] bg-[var(--ratist-red)]/10"
                        : "border-[var(--border)] hover:border-[var(--ratist-red)]/50"
                    }`}
                  >
                    <p className="text-sm font-semibold text-white">{opt.label}</p>
                    <p className="text-xs text-[var(--foreground-muted)] mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>
            )}

            {/* Step 4: Era */}
            {step === 3 && (
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  { value: "recent", label: "Recent", desc: "Released in the last 3 years" },
                  { value: "modern", label: "Modern era", desc: "2010s and 2020s" },
                  { value: "throwback", label: "Throwback", desc: "2000s and older" },
                  { value: "", label: "Any era", desc: "Don't care when it was made" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setEra(opt.value)}
                    className={`text-left p-4 rounded-xl border transition-colors ${
                      era === opt.value
                        ? "border-[var(--ratist-red)] bg-[var(--ratist-red)]/10"
                        : "border-[var(--border)] hover:border-[var(--ratist-red)]/50"
                    }`}
                  >
                    <p className="text-sm font-semibold text-white">{opt.label}</p>
                    <p className="text-xs text-[var(--foreground-muted)] mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>
            )}

            {/* Step 5: Exclusions */}
            {step === 4 && (
              <div className="flex flex-wrap gap-2">
                {GENRES.filter((g) => !selectedGenres.has(g)).map((g) => (
                  <button
                    key={g}
                    onClick={() => toggleExclude(g)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      excludeGenres.has(g)
                        ? "bg-red-600/20 text-red-400 border border-red-500/30"
                        : "bg-[var(--surface-2)] text-[var(--foreground-muted)] hover:text-white border border-[var(--border)]"
                    }`}
                  >
                    {excludeGenres.has(g) && <X className="w-3 h-3 inline mr-1" />}{g}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
              className="flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-white disabled:opacity-30 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>

            <div className="flex items-center gap-3">
              <button
                onClick={() => isLastStep ? handleSubmit() : setStep((s) => s + 1)}
                className="flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-white transition-colors"
              >
                <SkipForward className="w-4 h-4" /> Skip
              </button>

              {isLastStep ? (
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex items-center gap-2 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white font-semibold px-6 py-2.5 rounded-full transition-colors disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4" /> {loading ? "Finding movies..." : "Find Movies"}
                </button>
              ) : (
                <button
                  onClick={() => setStep((s) => s + 1)}
                  className="flex items-center gap-2 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white font-semibold px-5 py-2.5 rounded-full transition-colors"
                >
                  Next <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </>
      ) : (
        /* ── Results ── */
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-white">
              {results.length > 0 ? "Here's what we found" : "No results"}
            </h2>
            <div className="flex items-center gap-3">
              <button
                onClick={handleShuffle}
                disabled={loading}
                className="flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-white transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Shuffle
              </button>
              <button
                onClick={handleStartOver}
                className="flex items-center gap-1.5 text-sm text-[var(--ratist-red)] hover:underline"
              >
                Start over
              </button>
            </div>
          </div>

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
                {results.slice(0, visibleCount).map((movie, i) => (
                  <Link
                    key={`${movie.tmdbId}-${i}`}
                    href={`/movies/${movie.tmdbId}`}
                    className="flex gap-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--ratist-red)] transition-colors group"
                  >
                    <div className="relative w-16 h-24 shrink-0 rounded-lg overflow-hidden bg-[var(--surface-2)]">
                      {movie.posterPath ? (
                        <Image src={posterUrl(movie.posterPath, "w185")} alt={movie.title} fill sizes="64px" className="object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-[var(--foreground-muted)]">?</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-semibold text-white group-hover:text-[var(--ratist-red)] transition-colors line-clamp-1">{movie.title}</h3>
                          <p className="text-xs text-[var(--foreground-muted)]">{movie.year}</p>
                        </div>
                        <RatingBadge type="community" score={movie.voteAverage} size="sm" />
                      </div>
                      <p className="text-xs text-[var(--foreground-muted)] mt-1.5 line-clamp-2">{movie.overview}</p>
                      <span className="inline-block mt-1.5 text-[10px] font-medium bg-[var(--ratist-red)]/10 text-[var(--ratist-red)] px-2 py-0.5 rounded-full">{movie.reason}</span>
                    </div>
                  </Link>
                ))}
              </div>

              {(visibleCount < results.length || currentPage < totalPages) && (
                <div className="text-center mt-6">
                  <button
                    onClick={handleSeeMore}
                    disabled={loading}
                    className="flex items-center gap-2 mx-auto text-sm text-[var(--ratist-red)] hover:underline disabled:opacity-50"
                  >
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
