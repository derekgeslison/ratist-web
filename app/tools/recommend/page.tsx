"use client";

import { useState, useCallback, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Sparkles, ArrowRight, ArrowLeft, SkipForward, RefreshCw, ChevronDown, X, Clock, Bookmark, BookmarkCheck, ArrowUpDown, Film, Tv, SlidersHorizontal, Wand2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { posterUrl, STREAMING_PROVIDERS, IMAGE_BASE_URL } from "@/lib/tmdb";
import RatingBadge from "@/components/RatingBadge";
import ProviderLogos from "@/components/ProviderLogos";

const GENRES = [
  "Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary",
  "Drama", "Family", "Fantasy", "History", "Horror", "Music",
  "Mystery", "Romance", "Science Fiction", "Thriller", "War", "Western",
];

const STEPS = [
  { key: "mediaType", title: "What do you want to watch?", subtitle: "A movie, a show, or open to either?" },
  { key: "genres", title: "What are you in the mood for?", subtitle: "Pick one or more genres, or skip for a mix of everything." },
  { key: "experience", title: "What kind of experience?", subtitle: "Select one or more, or skip for a random mix." },
  { key: "runtime", title: "How much time do you have?", subtitle: "Select one or more, or skip for any length." },
  { key: "era", title: "Any release-year preference?", subtitle: "Filter by when the movie or show was released. Select one or more, or skip for any year." },
  { key: "exclude", title: "Anything to avoid?", subtitle: "Tap genres you want excluded from results." },
] as const;

interface ProviderInfo { name: string; logo: string; }

interface MovieResult {
  tmdbId: number; title: string; posterPath: string | null; year: string;
  overview: string; voteAverage: number; genres: string[];
  runtime: number | null; mpaaRating: string | null;
  streaming: ProviderInfo[]; rentBuy: ProviderInfo[];
  matchScore: number | null; requestedMatchCount?: number; reason: string;
  mediaType?: "movie" | "tv";
}

type SortMode = "match" | "rating" | "newest" | "oldest";
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
  const ALL_MPAA = ["G", "PG", "PG-13", "R", "NR"] as const;
  const ALL_TV_RATINGS = ["TV-Y", "TV-Y7", "TV-G", "TV-PG", "TV-14", "TV-MA"] as const;

  const [step, setStep] = useState(0);
  const [mediaType, setMediaType] = useState<"movie" | "tv" | "any">("any");
  const [selectedGenres, setSelectedGenres] = useState<Set<string>>(new Set());
  const [experience, setExperience] = useState<Set<string>>(new Set());
  const [runtime, setRuntime] = useState<Set<string>>(new Set());
  const [era, setEra] = useState<Set<string>>(new Set());
  const [excludeGenres, setExcludeGenres] = useState<Set<string>>(new Set());
  const [mpaaSelected, setMpaaSelected] = useState<Set<string>>(new Set(ALL_MPAA));

  const [results, setResults] = useState<MovieResult[]>([]);
  const [visibleCount, setVisibleCount] = useState(5);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [sortMode, setSortMode] = useState<SortMode>("match");
  const [watchlisted, setWatchlisted] = useState<Set<number>>(new Set());
  const [resultMediaFilter, setResultMediaFilter] = useState<"all" | "movie" | "tv">("all");
  const [tvRatingSelected, setTvRatingSelected] = useState<Set<string>>(new Set(ALL_TV_RATINGS));
  const [selectedStreamingProviders, setSelectedStreamingProviders] = useState<Set<string>>(new Set());
  const [watchlistingId, setWatchlistingId] = useState<number | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  // Hidden AI-extracted filters. The user sees a single generic "AI filter"
  // chip in the drawer (not each dimension) and can remove the whole bundle.
  interface AiHidden {
    moods: string[];
    originalLanguage: string[];
    excludeOriginalLanguages: string[];
    excludeAnime: boolean;
    yearFrom: number | null;
    yearTo: number | null;
    minRating: number | null;
    keywords: string[];
    excludeKeywords: string[];
    studios: string[];
  }
  const AI_HIDDEN_EMPTY: AiHidden = { moods: [], originalLanguage: [], excludeOriginalLanguages: [], excludeAnime: false, yearFrom: null, yearTo: null, minRating: null, keywords: [], excludeKeywords: [], studios: [] };
  const [aiHidden, setAiHidden] = useState<AiHidden>(AI_HIDDEN_EMPTY);
  const aiHiddenActive = aiHidden.moods.length > 0 || aiHidden.originalLanguage.length > 0 || aiHidden.excludeOriginalLanguages.length > 0 || aiHidden.excludeAnime || aiHidden.yearFrom != null || aiHidden.yearTo != null || aiHidden.minRating != null || aiHidden.keywords.length > 0 || aiHidden.excludeKeywords.length > 0 || aiHidden.studios.length > 0;

  // AI mode (alternative to the questionnaire, shown on step 0 only)
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  // Restore from sessionStorage on mount (avoids hydration mismatch)
  useEffect(() => {
    const saved = loadSaved();
    if (saved) {
      setStep(saved.step ?? 0);
      setMediaType(saved.mediaType ?? "any");
      setSelectedGenres(new Set(saved.selectedGenres ?? []));
      const VALID_EXPERIENCES = new Set(["popular", "hidden_gem", "classic", "taste"]);
      setExperience(new Set((Array.isArray(saved.experience) ? saved.experience : []).filter((e: string) => VALID_EXPERIENCES.has(e))));
      setRuntime(new Set(Array.isArray(saved.runtime) ? saved.runtime : []));
      setEra(new Set(Array.isArray(saved.era) ? saved.era : []));
      setExcludeGenres(new Set(saved.excludeGenres ?? []));
      setMpaaSelected(new Set(saved.mpaaSelected ?? ALL_MPAA));
      setResults(saved.results ?? []);
      setVisibleCount(saved.visibleCount ?? 5);
      setHasSearched(saved.hasSearched ?? false);
      setCurrentPage(saved.currentPage ?? 1);
      setTotalPages(saved.totalPages ?? 1);
      setSortMode(saved.sortMode && saved.sortMode !== "" ? saved.sortMode : "match");
      setWatchlisted(new Set(saved.watchlisted ?? []));
      setResultMediaFilter(saved.resultMediaFilter ?? "all");
      setTvRatingSelected(new Set(saved.tvRatingSelected ?? ALL_TV_RATINGS));
      setSelectedStreamingProviders(new Set(saved.selectedStreamingProviders ?? []));
      if (saved.aiHidden && typeof saved.aiHidden === "object") {
        setAiHidden({
          moods: Array.isArray(saved.aiHidden.moods) ? saved.aiHidden.moods : [],
          originalLanguage: Array.isArray(saved.aiHidden.originalLanguage) ? saved.aiHidden.originalLanguage : [],
          excludeOriginalLanguages: Array.isArray(saved.aiHidden.excludeOriginalLanguages) ? saved.aiHidden.excludeOriginalLanguages : [],
          excludeAnime: saved.aiHidden.excludeAnime === true,
          yearFrom: typeof saved.aiHidden.yearFrom === "number" ? saved.aiHidden.yearFrom : null,
          yearTo: typeof saved.aiHidden.yearTo === "number" ? saved.aiHidden.yearTo : null,
          minRating: typeof saved.aiHidden.minRating === "number" ? saved.aiHidden.minRating : null,
          keywords: Array.isArray(saved.aiHidden.keywords) ? saved.aiHidden.keywords : [],
          excludeKeywords: Array.isArray(saved.aiHidden.excludeKeywords) ? saved.aiHidden.excludeKeywords : [],
          studios: Array.isArray(saved.aiHidden.studios) ? saved.aiHidden.studios : [],
        });
      } else if (Array.isArray(saved.aiMoods)) {
        // Legacy session state from before the AI-hidden bundle.
        setAiHidden({ ...AI_HIDDEN_EMPTY, moods: saved.aiMoods });
      }
    }
    setHydrated(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeFilterCount = [
    selectedGenres.size > 0,
    experience.size > 0,
    runtime.size > 0,
    era.size > 0,
    excludeGenres.size > 0,
    aiHiddenActive,
  ].filter(Boolean).length;

  // Persist state to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        step, mediaType, selectedGenres: [...selectedGenres], experience: [...experience], runtime: [...runtime], era: [...era],
        excludeGenres: [...excludeGenres], mpaaSelected: [...mpaaSelected], results, visibleCount,
        hasSearched, currentPage, totalPages, sortMode, watchlisted: [...watchlisted],
        resultMediaFilter, tvRatingSelected: [...tvRatingSelected],
        selectedStreamingProviders: [...selectedStreamingProviders],
        aiHidden,
      }));
    } catch {}
  }, [step, mediaType, selectedGenres, experience, runtime, era, excludeGenres, mpaaSelected, results, visibleCount, hasSearched, currentPage, totalPages, sortMode, watchlisted, resultMediaFilter, tvRatingSelected, selectedStreamingProviders, aiHidden]);

  const getToken = useCallback(async () => user ? user.getIdToken() : null, [user]);

  async function fetchResults(page = 1, append = false, overrideMediaType?: string, overrideProviders?: Set<string>) {
    setLoading(true);
    const token = await getToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    const effectiveMediaType = overrideMediaType ?? mediaType;
    const effectiveProviders = overrideProviders ?? selectedStreamingProviders;
    // Map short names to TMDB provider IDs
    const providerIds = [...effectiveProviders]
      .map((short) => STREAMING_PROVIDERS.find((sp) => sp.short === short)?.id)
      .filter(Boolean) as number[];

    const res = await fetch("/api/tools/recommend", {
      method: "POST", headers,
      body: JSON.stringify({
        genres: [...selectedGenres],
        experience: [...experience],
        runtime: [...runtime],
        era: [...era],
        excludeGenres: [...excludeGenres], page,
        sort: sortMode,
        mediaType: effectiveMediaType,
        providers: providerIds,
        moods: aiHidden.moods,
        originalLanguage: aiHidden.originalLanguage,
        excludeOriginalLanguages: aiHidden.excludeOriginalLanguages,
        excludeAnime: aiHidden.excludeAnime,
        yearFrom: aiHidden.yearFrom,
        yearTo: aiHidden.yearTo,
        minRating: aiHidden.minRating,
        keywords: aiHidden.keywords,
        excludeKeywords: aiHidden.excludeKeywords,
        studios: aiHidden.studios,
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

  function toggleSet<T>(setter: React.Dispatch<React.SetStateAction<Set<T>>>, value: T) {
    setter((prev) => { const s = new Set(prev); if (s.has(value)) s.delete(value); else s.add(value); return s; });
  }

  function handleSubmit() {
    setResultMediaFilter(mediaType === "any" ? "all" : mediaType);
    setFiltersOpen(false);
    fetchResults(1, false);
  }

  async function handleAiRecommend() {
    const prompt = aiPrompt.trim();
    if (!user) { setAiError("Sign in to use AI recommendations."); return; }
    if (prompt.length < 5) { setAiError("Describe what you're in the mood for."); return; }
    setAiLoading(true);
    setAiError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/tools/recommend/ai", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAiError(data.error ?? "AI extraction failed.");
        setAiLoading(false);
        return;
      }
      const f = data.filters as {
        mediaType: "movie" | "tv" | "any";
        genres: string[];
        experience: string[];
        runtime: string[];
        era: string[];
        excludeGenres: string[];
        providers: string[];
        moods: string[];
        originalLanguage: string[];
        excludeOriginalLanguages: string[];
        excludeAnime: boolean;
        yearFrom: number | null;
        yearTo: number | null;
        minRating: number | null;
        keywords: string[];
        excludeKeywords: string[];
        studios: string[];
        mpaaRatings: string[];
        cast: string[];
        maxViolence: string | null;
        maxSexualContent: string | null;
        maxLanguageSubstance: string | null;
        maxScaryIntense: string | null;
        maxSensitiveThemes: string | null;
        minViolence: string | null;
        minSexualContent: string | null;
        minLanguageSubstance: string | null;
        minScaryIntense: string | null;
        minSensitiveThemes: string | null;
      };
      // Apply extracted filters to state so the user can see/tweak what was picked
      setMediaType(f.mediaType);
      setSelectedGenres(new Set(f.genres));
      setExperience(new Set(f.experience));
      setRuntime(new Set(f.runtime));
      setEra(new Set(f.era));
      setExcludeGenres(new Set(f.excludeGenres));
      setAiHidden({
        moods: Array.isArray(f.moods) ? f.moods : [],
        originalLanguage: Array.isArray(f.originalLanguage) ? f.originalLanguage : [],
        excludeOriginalLanguages: Array.isArray(f.excludeOriginalLanguages) ? f.excludeOriginalLanguages : [],
        excludeAnime: f.excludeAnime === true,
        yearFrom: typeof f.yearFrom === "number" ? f.yearFrom : null,
        yearTo: typeof f.yearTo === "number" ? f.yearTo : null,
        minRating: typeof f.minRating === "number" ? f.minRating : null,
        keywords: Array.isArray(f.keywords) ? f.keywords : [],
        excludeKeywords: Array.isArray(f.excludeKeywords) ? f.excludeKeywords : [],
        studios: Array.isArray(f.studios) ? f.studios : [],
      });
      const extractedProviders = new Set(f.providers ?? []);
      setSelectedStreamingProviders(extractedProviders);
      setResultMediaFilter(f.mediaType === "any" ? "all" : f.mediaType);
      setFiltersOpen(false);
      // Jump straight to results using the AI-picked filters
      const providerIds = [...extractedProviders]
        .map((short) => STREAMING_PROVIDERS.find((sp) => sp.short === short)?.id)
        .filter(Boolean) as number[];
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      headers.Authorization = `Bearer ${token}`;
      setLoading(true);
      const rRes = await fetch("/api/tools/recommend", {
        method: "POST",
        headers,
        body: JSON.stringify({
          genres: f.genres,
          experience: f.experience,
          runtime: f.runtime,
          era: f.era,
          excludeGenres: f.excludeGenres,
          page: 1,
          sort: sortMode,
          mediaType: f.mediaType,
          providers: providerIds,
          moods: f.moods,
          originalLanguage: f.originalLanguage,
          excludeOriginalLanguages: f.excludeOriginalLanguages,
          excludeAnime: f.excludeAnime,
          yearFrom: f.yearFrom,
          yearTo: f.yearTo,
          minRating: f.minRating,
          keywords: f.keywords,
          excludeKeywords: f.excludeKeywords,
          studios: f.studios,
          cast: f.cast,
          maxViolence: f.maxViolence,
          maxSexualContent: f.maxSexualContent,
          maxLanguageSubstance: f.maxLanguageSubstance,
          maxScaryIntense: f.maxScaryIntense,
          maxSensitiveThemes: f.maxSensitiveThemes,
          minViolence: f.minViolence,
          minSexualContent: f.minSexualContent,
          minLanguageSubstance: f.minLanguageSubstance,
          minScaryIntense: f.minScaryIntense,
          minSensitiveThemes: f.minSensitiveThemes,
        }),
      });
      if (rRes.ok) {
        const rData = await rRes.json();
        setResults(rData.results ?? []);
        setVisibleCount(5);
        setTotalPages(rData.totalPages ?? 1);
        setCurrentPage(rData.page ?? 1);
      }
      setLoading(false);
      setHasSearched(true);
      setAiLoading(false);
    } catch {
      setAiError("Network error — please try again.");
      setAiLoading(false);
    }
  }

  function handleSeeMore() {
    if (visibleCount < results.length) setVisibleCount((v: number) => v + 10);
    else if (currentPage < totalPages) { fetchResults(currentPage + 1, true); setVisibleCount((v: number) => v + 10); }
  }

  function handleShuffle() { fetchResults(Math.floor(Math.random() * Math.min(totalPages, 20)) + 1, false); }

  function handleStartOver() {
    setStep(0); setMediaType("any"); setSelectedGenres(new Set()); setExperience(new Set()); setRuntime(new Set());
    setEra(new Set()); setExcludeGenres(new Set()); setMpaaSelected(new Set(ALL_MPAA)); setResults([]);
    setFiltersOpen(false); setResultMediaFilter("all"); setSelectedStreamingProviders(new Set());
    setTvRatingSelected(new Set(ALL_TV_RATINGS));
    setAiHidden(AI_HIDDEN_EMPTY);
    setHasSearched(false); setVisibleCount(5); setSortMode("match");
    try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
  }

  // Reset every filter dimension but keep the user on the results view and
  // refetch with an empty filter set. Distinct from handleStartOver (which
  // kicks the user back to the questionnaire). Inline the POST here rather
  // than call fetchResults — fetchResults reads filter state via closure,
  // and React setState is batched, so it would otherwise fetch with the
  // pre-clear values on this render.
  async function handleClearFilters() {
    setSelectedGenres(new Set());
    setExperience(new Set());
    setRuntime(new Set());
    setEra(new Set());
    setExcludeGenres(new Set());
    setMpaaSelected(new Set(ALL_MPAA));
    setTvRatingSelected(new Set(ALL_TV_RATINGS));
    setSelectedStreamingProviders(new Set());
    setAiHidden(AI_HIDDEN_EMPTY);
    setResultMediaFilter("all");
    setMediaType("any");
    setFiltersOpen(false);
    setVisibleCount(5);
    setLoading(true);
    const token = await getToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch("/api/tools/recommend", {
      method: "POST", headers,
      body: JSON.stringify({ page: 1, sort: sortMode, mediaType: "any" }),
    });
    if (res.ok) {
      const data = await res.json();
      setResults(data.results ?? []);
      setTotalPages(data.totalPages ?? 1);
      setCurrentPage(data.page ?? 1);
    }
    setLoading(false);
  }

  async function addToWatchlist(movie: MovieResult) {
    if (!user || watchlistingId) return;
    setWatchlistingId(movie.tmdbId);
    const token = await getToken();
    if (!token) { setWatchlistingId(null); return; }
    const apiBase = movie.mediaType === "tv" ? `/api/shows/${movie.tmdbId}` : `/api/movies/${movie.tmdbId}`;
    const bodyPayload = movie.mediaType === "tv"
      ? { name: movie.title, poster_path: movie.posterPath }
      : { title: movie.title, poster_path: movie.posterPath };
    const res = await fetch(`${apiBase}/watchlist`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(bodyPayload),
    });
    if (res.ok) setWatchlisted((prev) => new Set(prev).add(movie.tmdbId));
    setWatchlistingId(null);
  }

  function toggleGenre(g: string) { setSelectedGenres((p) => { const s = new Set(p); s.has(g) ? s.delete(g) : s.add(g); return s; }); }
  function toggleExclude(g: string) { setExcludeGenres((p) => { const s = new Set(p); s.has(g) ? s.delete(g) : s.add(g); return s; }); }

  const allMpaaSelected = mpaaSelected.size === ALL_MPAA.length;
  const allTvRatingSelected = tvRatingSelected.size === ALL_TV_RATINGS.length;
  const filtered = results.filter((r) => {
    // Media type filter
    if (resultMediaFilter !== "all" && r.mediaType !== resultMediaFilter) return false;
    // Content rating filter
    if (r.mediaType === "tv") {
      if (!allTvRatingSelected) {
        const rating = r.mpaaRating || "";
        if (rating && !tvRatingSelected.has(rating)) return false;
      }
    } else {
      if (!allMpaaSelected) {
        const rating = r.mpaaRating || "NR";
        if (!mpaaSelected.has(rating)) return false;
      }
    }
    return true;
  });
  const sorted = sortMode === "rating" ? [...filtered].sort((a, b) => b.voteAverage - a.voteAverage)
    : sortMode === "match" ? [...filtered].sort((a, b) => {
        // Explicit query-genre matches win first. Sci-Fi + Romance title beats
        // a pure Romance title even if the user rates romance higher on average.
        const aReq = a.requestedMatchCount ?? 0;
        const bReq = b.requestedMatchCount ?? 0;
        if (aReq !== bReq) return bReq - aReq;
        const aScore = a.matchScore ?? 0;
        const bScore = b.matchScore ?? 0;
        if (aScore !== bScore) return bScore - aScore;
        return b.voteAverage - a.voteAverage;
      })
    : sortMode === "newest" ? [...filtered].sort((a, b) => (b.year || "").localeCompare(a.year || ""))
    : sortMode === "oldest" ? [...filtered].sort((a, b) => (a.year || "").localeCompare(b.year || ""))
    : filtered;

  const isLastStep = step === STEPS.length - 1;

  if (!hydrated) return null;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center gap-3 mb-2">
        <Sparkles className="w-6 h-6 text-[var(--ratist-red)]" />
        <h1 className="text-2xl font-bold text-white">What Should I Watch?</h1>
      </div>
      <p className="text-[var(--foreground-muted)] mb-8">Answer a few quick questions and we&apos;ll find your next watch.</p>

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
              <>
                {/* AI shortcut — describe it in your own words */}
                <div className="mb-6 p-4 rounded-xl border border-[var(--ratist-red)]/30 bg-gradient-to-br from-[var(--ratist-red)]/5 to-transparent">
                  <div className="flex items-center gap-2 mb-2">
                    <Wand2 className="w-4 h-4 text-[var(--ratist-red)]" />
                    <p className="text-sm font-semibold text-white">Or describe what you want in your own words</p>
                  </div>
                  <p className="text-xs text-[var(--foreground-muted)] mb-3">
                    Skip the questions — our AI will pick filters for you based on a short description.
                  </p>
                  <textarea
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder='e.g. "A slow-burn sci-fi I can finish in a night" or "Cozy rom-com for a bad day"'
                    rows={2}
                    maxLength={500}
                    className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] resize-y mb-2"
                  />
                  {aiError && <p className="text-xs text-red-400 mb-2">{aiError}</p>}
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] text-[var(--foreground-muted)]">
                      {user ? "Free: 20/day · Backstage Pass: 50/day" : "Sign in required"}
                    </p>
                    <button
                      onClick={handleAiRecommend}
                      disabled={aiLoading || !user || aiPrompt.trim().length < 5}
                      className="flex items-center gap-1.5 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold px-4 py-1.5 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                      {aiLoading ? "Thinking..." : "Find with AI"}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-3 mb-4">
                  <div className="h-px bg-[var(--border)] flex-1" />
                  <span className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)]">or use the questionnaire</span>
                  <div className="h-px bg-[var(--border)] flex-1" />
                </div>

                <div className="grid sm:grid-cols-3 gap-3">
                  {[
                    { value: "movie" as const, label: "A Movie", desc: "Single film, defined runtime" },
                    { value: "tv" as const, label: "A TV Show", desc: "Series to binge or follow" },
                    { value: "any" as const, label: "Either!", desc: "Open to movies or shows" },
                  ].map((opt) => (
                    <button key={opt.value} onClick={() => setMediaType(opt.value)}
                      className={`text-left p-4 rounded-xl border transition-colors ${mediaType === opt.value ? "border-[var(--ratist-red)] bg-[var(--ratist-red)]/10" : "border-[var(--border)] hover:border-[var(--ratist-red)]/50"}`}>
                      <p className="text-sm font-semibold text-white">{opt.label}</p>
                      <p className="text-xs text-[var(--foreground-muted)] mt-0.5">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </>
            )}

            {step === 1 && (
              <div className="flex flex-wrap gap-2">
                {GENRES.map((g) => (
                  <button key={g} onClick={() => toggleGenre(g)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${selectedGenres.has(g) ? "bg-[var(--ratist-red)] text-white" : "bg-[var(--surface-2)] text-[var(--foreground-muted)] hover:text-white border border-[var(--border)]"}`}>
                    {g}
                  </button>
                ))}
              </div>
            )}

            {step === 2 && (
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  { value: "popular", label: "Something popular", desc: "Trending and widely talked about" },
                  { value: "hidden_gem", label: "A hidden gem", desc: "Highly rated but lesser known" },
                  { value: "classic", label: "A certified classic", desc: "Timeless titles that defined the medium" },
                  { value: "taste", label: "Based on my taste", desc: user ? "Matched to your genre preferences" : "Sign in to use taste matching" },
                ].map((opt) => (
                  <button key={opt.value}
                    onClick={() => { if (opt.value === "taste" && !user) return; toggleSet(setExperience, opt.value); }}
                    className={`text-left p-4 rounded-xl border transition-colors ${
                      opt.value === "taste" && !user
                        ? "border-[var(--border)] opacity-50 cursor-not-allowed"
                        : experience.has(opt.value) ? "border-[var(--ratist-red)] bg-[var(--ratist-red)]/10" : "border-[var(--border)] hover:border-[var(--ratist-red)]/50"
                    }`}>
                    <p className="text-sm font-semibold text-white">{opt.label}</p>
                    <p className="text-xs text-[var(--foreground-muted)] mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>
            )}

            {step === 3 && (
              <div className="grid sm:grid-cols-2 gap-3">
                {(mediaType === "tv" ? [
                  { value: "short_ep", label: "Short episodes", desc: "20–30 minutes per episode" },
                  { value: "standard_ep", label: "Standard episodes", desc: "40–60 minutes per episode" },
                  { value: "long_ep", label: "Long episodes", desc: "60+ minutes per episode" },
                ] : [
                  { value: "short", label: "Quick watch", desc: "Under 100 minutes" },
                  { value: "standard", label: "Standard", desc: "Around 90–140 minutes" },
                  { value: "long", label: "I'm settling in", desc: "2.5 hours or more" },
                ]).map((opt) => (
                  <button key={opt.value} onClick={() => toggleSet(setRuntime, opt.value)}
                    className={`text-left p-4 rounded-xl border transition-colors ${runtime.has(opt.value) ? "border-[var(--ratist-red)] bg-[var(--ratist-red)]/10" : "border-[var(--border)] hover:border-[var(--ratist-red)]/50"}`}>
                    <p className="text-sm font-semibold text-white">{opt.label}</p>
                    <p className="text-xs text-[var(--foreground-muted)] mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>
            )}

            {step === 4 && (
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  { value: "recent", label: "Recent", desc: "Released in the last 3 years" },
                  { value: "2000s", label: "2000s and newer", desc: "Released from 2000 onward" },
                  { value: "pre2000", label: "Pre-2000", desc: "Released in the 90s, 80s, or earlier" },
                ].map((opt) => (
                  <button key={opt.value} onClick={() => toggleSet(setEra, opt.value)}
                    className={`text-left p-4 rounded-xl border transition-colors ${era.has(opt.value) ? "border-[var(--ratist-red)] bg-[var(--ratist-red)]/10" : "border-[var(--border)] hover:border-[var(--ratist-red)]/50"}`}>
                    <p className="text-sm font-semibold text-white">{opt.label}</p>
                    <p className="text-xs text-[var(--foreground-muted)] mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>
            )}

            {step === 5 && (
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
                  <Sparkles className="w-4 h-4" /> {loading ? "Finding..." : mediaType === "tv" ? "Find Shows" : mediaType === "any" ? "Find Recommendations" : "Find Movies"}
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
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="text-lg font-bold text-white">
              {results.length > 0 ? "Here's what we found" : "No results"}
            </h2>
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={handleShuffle} disabled={loading}
                className="flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-white transition-colors disabled:opacity-50">
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Shuffle
              </button>
              <button onClick={handleStartOver} className="text-sm text-[var(--ratist-red)] hover:underline">
                Start over
              </button>
            </div>
          </div>

          {/* Filters toggle + Clear-all (visible whenever any filter is set) */}
          <div className="flex items-center gap-3 mb-3">
            <button
              onClick={() => setFiltersOpen((v) => !v)}
              className="flex items-center gap-2 text-sm text-[var(--foreground-muted)] hover:text-white transition-colors"
            >
              <SlidersHorizontal className="w-4 h-4" />
              Filters
              {activeFilterCount > 0 && (
                <span className="bg-[var(--ratist-red)] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{activeFilterCount}</span>
              )}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
            </button>
            {activeFilterCount > 0 && (
              <button
                onClick={handleClearFilters}
                disabled={loading}
                className="text-xs text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] transition-colors disabled:opacity-50"
                title="Clear every filter and refetch"
              >
                Clear filters
              </button>
            )}
          </div>

          {filtersOpen && (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-4 space-y-4">
            {/* AI hidden filters (moods, language, year range, etc.) shown as a single
                removable chip so the user knows AI-specific tuning is active. */}
            {aiHiddenActive && (
              <div>
                <p className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wider font-medium mb-1.5">AI</p>
                <button
                  onClick={() => setAiHidden(AI_HIDDEN_EMPTY)}
                  title="Remove AI filter"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium border bg-[var(--ratist-red)]/10 border-[var(--ratist-red)]/30 text-white hover:bg-[var(--ratist-red)]/20 transition-colors"
                >
                  <Wand2 className="w-2.5 h-2.5" />
                  AI filter
                  <X className="w-2.5 h-2.5 ml-0.5" />
                </button>
              </div>
            )}

            {/* Genres */}
            <div>
              <p className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wider font-medium mb-1.5">Genres</p>
              <div className="flex flex-wrap gap-1.5">
                {GENRES.map((g) => (
                  <button key={g} onClick={() => { toggleSet(setSelectedGenres, g); }}
                    className={`px-2 py-1 rounded-full text-[10px] font-medium border transition-colors ${selectedGenres.has(g) ? "bg-[var(--ratist-red)]/10 border-[var(--ratist-red)]/30 text-white" : "border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"}`}>
                    {g}
                  </button>
                ))}
              </div>
            </div>

            {/* Experience */}
            <div>
              <p className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wider font-medium mb-1.5">Experience</p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { value: "popular", label: "Popular" },
                  { value: "hidden_gem", label: "Hidden Gem" },
                  { value: "classic", label: "Classic" },
                  { value: "taste", label: "My Taste" },
                ].map((opt) => (
                  <button key={opt.value} onClick={() => toggleSet(setExperience, opt.value)}
                    className={`px-2 py-1 rounded-full text-[10px] font-medium border transition-colors ${experience.has(opt.value) ? "bg-[var(--ratist-red)]/10 border-[var(--ratist-red)]/30 text-white" : "border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Runtime */}
            <div>
              <p className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wider font-medium mb-1.5">
                {resultMediaFilter === "tv" ? "Episode Length" : resultMediaFilter === "movie" ? "Runtime" : "Runtime / Episode Length"}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(resultMediaFilter === "tv" ? [
                  { value: "short_ep", label: "Short (20-30m)" },
                  { value: "standard_ep", label: "Standard (40-60m)" },
                  { value: "long_ep", label: "Long (60m+)" },
                ] : resultMediaFilter === "movie" ? [
                  { value: "short", label: "< 100min" },
                  { value: "standard", label: "90–140min" },
                  { value: "long", label: "150min+" },
                ] : [
                  { value: "short", label: "Movie < 100min" },
                  { value: "standard", label: "Movie 90–140min" },
                  { value: "long", label: "Movie 150min+" },
                  { value: "short_ep", label: "TV Short eps" },
                  { value: "standard_ep", label: "TV Std eps" },
                  { value: "long_ep", label: "TV Long eps" },
                ]).map((opt) => (
                  <button key={opt.value} onClick={() => toggleSet(setRuntime, opt.value)}
                    className={`px-2 py-1 rounded-full text-[10px] font-medium border transition-colors ${runtime.has(opt.value) ? "bg-[var(--ratist-red)]/10 border-[var(--ratist-red)]/30 text-white" : "border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Era */}
            <div>
              <p className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wider font-medium mb-1.5">Release year</p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { value: "recent", label: "Recent (3yr)" },
                  { value: "2000s", label: "2000s+" },
                  { value: "pre2000", label: "Pre-2000" },
                ].map((opt) => (
                  <button key={opt.value} onClick={() => toggleSet(setEra, opt.value)}
                    className={`px-2 py-1 rounded-full text-[10px] font-medium border transition-colors ${era.has(opt.value) ? "bg-[var(--ratist-red)]/10 border-[var(--ratist-red)]/30 text-white" : "border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Exclude genres */}
            <div>
              <p className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wider font-medium mb-1.5">Avoid</p>
              <div className="flex flex-wrap gap-1.5">
                {GENRES.filter((g) => !selectedGenres.has(g)).map((g) => (
                  <button key={g} onClick={() => toggleSet(setExcludeGenres, g)}
                    className={`px-2 py-1 rounded-full text-[10px] font-medium border transition-colors ${excludeGenres.has(g) ? "bg-red-500/10 border-red-500/30 text-red-400" : "border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"}`}>
                    {excludeGenres.has(g) && <X className="w-2.5 h-2.5 inline mr-0.5" />}{g}
                  </button>
                ))}
              </div>
            </div>

            {/* Apply + Clear filter actions */}
            <div className="flex items-center gap-2">
              <button onClick={() => { fetchResults(1, false); setFiltersOpen(false); }} disabled={loading}
                className="flex-1 py-2 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50">
                {loading ? "Updating..." : "Apply Filters"}
              </button>
              {activeFilterCount > 0 && (
                <button onClick={handleClearFilters} disabled={loading}
                  className="py-2 px-4 border border-[var(--border)] hover:border-[var(--ratist-red)]/50 text-xs text-[var(--foreground-muted)] hover:text-white rounded-lg transition-colors disabled:opacity-50">
                  Clear all
                </button>
              )}
            </div>
          </div>
          )}

          {/* Sort + filter bar — stays visible even with zero results so the
              user can loosen filters without losing the controls. */}
          {hasSearched && (
            <div className="flex flex-wrap items-center gap-3 mb-4 text-xs">
              {/* Media type toggle */}
              <div className="flex items-center gap-1">
                {([
                  { value: "all" as const, label: "All" },
                  { value: "movie" as const, label: "Movies", icon: Film },
                  { value: "tv" as const, label: "Shows", icon: Tv },
                ]).map(({ value, label, icon: Icon }) => (
                  <button key={value} onClick={() => {
                    const prev = resultMediaFilter;
                    setResultMediaFilter(value);
                    // Clear incompatible runtime selections when switching media type
                    if (value === "movie") setRuntime((p) => new Set([...p].filter((r) => !r.includes("_ep"))));
                    else if (value === "tv") setRuntime((p) => new Set([...p].filter((r) => r.includes("_ep"))));
                    // Re-fetch with the new media type since current results may not include it
                    if (value !== prev) {
                      const fetchType = value === "all" ? "any" : value;
                      setMediaType(fetchType as "movie" | "tv" | "any");
                      setCurrentPage(1);
                      setVisibleCount(5);
                      fetchResults(1, false, fetchType);
                    }
                  }}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md font-medium transition-colors ${
                      resultMediaFilter === value
                        ? value === "tv" ? "bg-blue-600/20 text-blue-400" : "bg-[var(--ratist-red)]/20 text-white"
                        : "text-[var(--foreground-muted)] hover:text-white"
                    }`}>
                    {Icon && <Icon className="w-3 h-3" />}
                    {label}
                  </button>
                ))}
              </div>
              {/* Sort */}
              <div className="flex items-center gap-2">
                <ArrowUpDown className="w-3 h-3 text-[var(--foreground-muted)]" />
                {(["match", "rating", "newest", "oldest"] as SortMode[]).map((s) => (
                  <button key={s} onClick={() => setSortMode(s)}
                    className={`px-2 py-1 rounded-md font-medium transition-colors ${sortMode === s ? "bg-[var(--ratist-red)]/20 text-white" : "text-[var(--foreground-muted)] hover:text-white"}`}>
                    {s === "match" ? "Best Match" : s === "rating" ? "Highest Rated" : s === "newest" ? "Newest" : "Oldest"}
                  </button>
                ))}
              </div>
              {/* Content rating — movie ratings */}
              <div className="flex items-center gap-1">
                <span className="text-[var(--foreground-muted)] mr-1" title={resultMediaFilter === "all" ? "Filter by Movies or Shows to use rating filters" : ""}>
                  {resultMediaFilter === "tv" ? "" : "MPA:"}
                </span>
                {resultMediaFilter !== "tv" && ALL_MPAA.map((r) => (
                  <button key={r}
                    onClick={() => resultMediaFilter !== "all" && setMpaaSelected((prev) => { const s = new Set(prev); if (s.has(r)) s.delete(r); else s.add(r); return s; })}
                    title={resultMediaFilter === "all" ? "Select Movies to filter by MPA rating" : undefined}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                      resultMediaFilter === "all"
                        ? "bg-transparent border-[var(--border)] text-[var(--foreground-muted)] opacity-40 cursor-not-allowed"
                        : mpaaSelected.has(r)
                          ? "bg-[var(--ratist-red)]/15 border-[var(--ratist-red)]/30 text-white"
                          : "bg-transparent border-[var(--border)] text-[var(--foreground-muted)] line-through opacity-50"
                    }`}>{r}</button>
                ))}
              </div>
              {/* TV content rating */}
              <div className="flex items-center gap-1">
                {resultMediaFilter !== "movie" && (
                  <>
                    <span className="text-[var(--foreground-muted)] mr-1">TV:</span>
                    {ALL_TV_RATINGS.map((r) => (
                      <button key={r}
                        onClick={() => resultMediaFilter !== "all" && setTvRatingSelected((prev) => { const s = new Set(prev); if (s.has(r)) s.delete(r); else s.add(r); return s; })}
                        title={resultMediaFilter === "all" ? "Select Shows to filter by TV rating" : undefined}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                          resultMediaFilter === "all"
                            ? "bg-transparent border-[var(--border)] text-[var(--foreground-muted)] opacity-40 cursor-not-allowed"
                            : tvRatingSelected.has(r)
                              ? "bg-blue-500/15 border-blue-500/30 text-blue-400"
                              : "bg-transparent border-[var(--border)] text-[var(--foreground-muted)] line-through opacity-50"
                        }`}>{r}</button>
                    ))}
                  </>
                )}
              </div>
              {/* Streaming service filter */}
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[var(--foreground-muted)] mr-1">Stream:</span>
                {STREAMING_PROVIDERS.map((p) => (
                  <button key={p.id}
                    onClick={() => {
                      const next = new Set(selectedStreamingProviders);
                      if (next.has(p.short)) next.delete(p.short); else next.add(p.short as string);
                      setSelectedStreamingProviders(next);
                      fetchResults(1, false, undefined, next);
                    }}
                    title={p.short}
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                      selectedStreamingProviders.has(p.short)
                        ? "bg-green-500/15 border-green-500/30 text-green-400"
                        : "bg-transparent border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"
                    }`}>
                    <img src={`${IMAGE_BASE_URL}/w92${p.logo}`} alt="" className="w-3.5 h-3.5 rounded-[2px]" />
                    {p.short}
                  </button>
                ))}
                {selectedStreamingProviders.size > 0 && (
                  <button onClick={() => { setSelectedStreamingProviders(new Set()); fetchResults(1, false, undefined, new Set()); }} className="text-[10px] text-[var(--foreground-muted)] hover:text-white ml-1">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          )}

          {loading && results.length === 0 ? (
            <div className="text-center py-16">
              <Sparkles className="w-10 h-10 mx-auto mb-4 text-[var(--ratist-red)] animate-pulse" />
              <p className="text-[var(--foreground-muted)]">Finding your perfect watch...</p>
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-16 text-[var(--foreground-muted)]">
              <p className="mb-3">
                {results.length > 0
                  ? "No results match your current filters. Try removing a streaming service or rating filter."
                  : "Nothing matched your criteria. Try broadening your filters."}
              </p>
              {results.length > 0 && selectedStreamingProviders.size > 0 && (
                <button onClick={() => { setSelectedStreamingProviders(new Set()); fetchResults(1, false, undefined, new Set()); }} className="text-sm text-[var(--ratist-red)] hover:underline mr-4">Clear streaming filter</button>
              )}
              <button onClick={handleStartOver} className="text-sm text-[var(--ratist-red)] hover:underline">Start over</button>
            </div>
          ) : (
            <>
              {sorted.length < 5 && (
                <div className="bg-[var(--surface)] border border-[var(--ratist-red)]/30 rounded-xl p-3 mb-4 flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-[var(--ratist-red)] mt-0.5 shrink-0" />
                  <div className="text-xs text-[var(--foreground-muted)]">
                    <strong className="text-white">Only {sorted.length} match{sorted.length === 1 ? "" : "es"}.</strong>{" "}
                    Try loosening your filters — drop a streaming service, widen the era, remove a content cap, or skip the rating floor to see more.
                  </div>
                </div>
              )}
              <div className="space-y-4">
                {sorted.slice(0, visibleCount).map((movie, i) => (
                  <div key={`${movie.tmdbId}-${i}`} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--ratist-red)]/50 transition-colors">
                    <div className="flex gap-4">
                      <Link href={`/${movie.mediaType === "tv" ? "shows" : "movies"}/${movie.tmdbId}`} className="relative w-16 h-24 shrink-0 rounded-lg overflow-hidden bg-[var(--surface-2)]">
                        {movie.posterPath ? (
                          <Image src={posterUrl(movie.posterPath, "w185")} alt={movie.title} fill sizes="64px" className="object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs text-[var(--foreground-muted)]">?</div>
                        )}
                      </Link>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <Link href={`/${movie.mediaType === "tv" ? "shows" : "movies"}/${movie.tmdbId}`} className="text-sm font-semibold text-white hover:text-[var(--ratist-red)] transition-colors line-clamp-1">{movie.mediaType === "tv" && <Tv className="w-3.5 h-3.5 text-blue-400 inline mr-1" />}{movie.title}</Link>
                            <div className="flex items-center gap-2 text-xs text-[var(--foreground-muted)] mt-0.5">
                              <span>{movie.year}</span>
                              {movie.mpaaRating && <span className="border border-[var(--border)] rounded px-1 py-0.5 text-[10px]">{movie.mpaaRating}</span>}
                              {movie.runtime && <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" />{movie.runtime}m</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {movie.matchScore != null && movie.matchScore > 0 && (
                              <span className="text-[10px] font-bold bg-green-500/15 text-green-400 px-1.5 py-0.5 rounded-full">{Math.min(movie.matchScore * 10, 100)}% match</span>
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
                              <ProviderLogos providers={movie.streaming} size={18} label="Stream" contentTitle={movie.title} contentType="movie" />
                            )}
                            {movie.rentBuy.length > 0 && (
                              <ProviderLogos providers={movie.rentBuy} size={18} label="Rent" contentTitle={movie.title} contentType="movie" />
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

              {sorted.length > 0 && (visibleCount < sorted.length || currentPage < totalPages) && (
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
