"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useIsTyping } from "@/context/TypingGuardContext";
import { LayoutGrid, List, Filter, X, Search, ChevronDown, ChevronUp, Film, Tv, Monitor, Wand2, Loader2 } from "lucide-react";
import Image from "next/image";
import type { TMDBGenre } from "@/lib/tmdb";
import { STREAMING_PROVIDERS, IMAGE_BASE_URL, LANGUAGES } from "@/lib/tmdb";
import { STUDIOS } from "@/lib/studios";

const MPAA_RATINGS = ["G", "PG", "PG-13", "R", "NC-17"];
const TV_RATINGS = ["TV-Y", "TV-Y7", "TV-G", "TV-PG", "TV-14", "TV-MA"];

// Genre ID mappings between movie and TV (TMDB uses different IDs for equivalent genres)
const GENRE_MOVIE_TO_TV: Record<string, string[]> = {
  "28": ["10759"],   // Action → Action & Adventure
  "12": ["10759"],   // Adventure → Action & Adventure
  "878": ["10765"],  // Science Fiction → Sci-Fi & Fantasy
  "14": ["10765"],   // Fantasy → Sci-Fi & Fantasy
  "10752": ["10768"], // War → War & Politics
};
const GENRE_TV_TO_MOVIE: Record<string, string[]> = {
  "10759": ["28", "12"],   // Action & Adventure → Action + Adventure
  "10765": ["878", "14"],  // Sci-Fi & Fantasy → Science Fiction + Fantasy
  "10768": ["10752"],      // War & Politics → War
};
// Genre IDs that only exist on one side (no equivalent on the other)
const MOVIE_ONLY_GENRES = new Set(["36", "27", "10402", "10749", "53", "10770"]); // History, Horror, Music, Romance, Thriller, TV Movie
const TV_ONLY_GENRES = new Set(["10762", "10763", "10764", "10766", "10767"]);     // Kids, News, Reality, Soap, Talk

function translateGenres(genres: string[], toTv: boolean): string[] {
  const map = toTv ? GENRE_MOVIE_TO_TV : GENRE_TV_TO_MOVIE;
  const dropSet = toTv ? MOVIE_ONLY_GENRES : TV_ONLY_GENRES;
  const result = new Set<string>();
  for (const gid of genres) {
    if (map[gid]) {
      for (const mapped of map[gid]) result.add(mapped);
    } else if (!dropSet.has(gid)) {
      // Keep genres that exist on both sides (e.g. Comedy, Drama, Animation)
      result.add(gid);
    }
    // Genres in dropSet are silently removed (no equivalent on target side)
  }
  return [...result];
}

const PER_PAGE_OPTIONS = [
  { value: "20", label: "20 / page" },
  { value: "50", label: "50 / page" },
  { value: "100", label: "100 / page" },
];


const SORT_OPTIONS = [
  { value: "relevance", label: "Relevance" },
  { value: "popular", label: "Most Popular" },
  { value: "top_rated", label: "Top Rated" },
  { value: "newest", label: "Newest First" },
  { value: "oldest", label: "Oldest First" },
  { value: "title_az", label: "Title A–Z" },
  { value: "title_za", label: "Title Z–A" },
];

// URL keys that represent an *active filter*. Touching any of these is what
// should trigger the auto-Relevance behavior.
const FILTER_URL_KEYS = new Set([
  "genres", "cast", "castLabels", "keywords", "keywordLabels",
  "yearFrom", "yearTo", "mpaa", "ratingOp", "ratingVal",
  "releaseStatus", "providers", "companies", "language", "seenStatus",
]);

const SEEN_OPTIONS = [
  { value: "", label: "All" },
  { value: "unseen", label: "Haven't seen" },
  { value: "seen", label: "Seen" },
];

const RELEASE_OPTIONS = [
  { value: "", label: "All" },
  { value: "now_playing", label: "Now Playing / Currently Airing" },
  { value: "upcoming", label: "Coming Soon" },
];

interface ActorOption {
  id: number;
  name: string;
  profile_path: string | null;
  known_for_department?: string;
}

interface Props {
  genres: TMDBGenre[];
  totalResults: number;
  /** Hide the result-count line. The seen-only view runs its own
   *  count below the filter bar; without this the bar would read
   *  "0 results" while SeenMoviesView is still loading. */
  hideTotalResults?: boolean;
}

export default function MoviesFilterBar({ genres, totalResults, hideTotalResults = false }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isTyping = useIsTyping();
  const [filtersOpen, setFiltersOpen] = useState(false);
  // All router.push calls go through startTransition so the current
  // page stays mounted (input keeps focus, results stay visible) while
  // the new SSR runs in the background. isPending lets us show a
  // subtle indicator instead of letting loading.tsx tear down the
  // existing UI on every keystroke. This was the single biggest
  // contributor to the perceived /movies search lag — the input was
  // unmounting and remounting on every URL push.
  const [isPending, startTransition] = useTransition();
  const navigate = (href: string) => startTransition(() => router.push(href));

  // Read current values from URL
  const currentSort = searchParams.get("sort") ?? "popular";
  const currentView = searchParams.get("view") ?? "grid";
  const currentGenres = searchParams.get("genres")?.split(",").filter(Boolean) ?? [];
  const currentGenreMode = (searchParams.get("genreMode") ?? "any") as "any" | "all";
  const currentCastIds = searchParams.get("cast")?.split(",").filter(Boolean) ?? [];
  const currentCastLabels = searchParams.get("castLabels")?.split(",").filter(Boolean) ?? [];
  const currentYearFrom = searchParams.get("yearFrom") ?? "";
  const currentYearTo = searchParams.get("yearTo") ?? "";
  const currentMpaa = searchParams.get("mpaa")?.split(",").filter(Boolean) ?? [];
  const currentRatingOp = (searchParams.get("ratingOp") ?? "gte") as "gte" | "lte";
  const currentRatingVal = searchParams.get("ratingVal") ?? "";
  const currentPerPage = searchParams.get("perPage") ?? "20";
  const currentReleaseStatus = searchParams.get("releaseStatus") ?? "";
  const currentType = searchParams.get("type") ?? "all";
  const currentProviders = searchParams.get("providers")?.split(",").filter(Boolean) ?? [];
  const currentShowProviders = searchParams.get("showProviders") === "1";
  const currentLanguage = searchParams.get("language") ?? "";
  const currentCompanies = searchParams.get("companies")?.split(",").filter(Boolean) ?? [];
  const currentKeywordIds = searchParams.get("keywords")?.split(",").filter(Boolean) ?? [];
  const currentKeywordLabels = searchParams.get("keywordLabels")?.split(",").filter(Boolean) ?? [];
  const currentSeenStatus = searchParams.get("seenStatus") ?? "";

  // AI-only URL params — set by the AI search bar but have no visible
  // per-dimension control. Surfaced as a single removable "AI filter" pill.
  const AI_ONLY_PARAMS = [
    "excludeGenres",
    "excludeAnime",
    "excludeLanguages",
    "excludeKeywords",
    "excludeKeywordLabels",
    "maxViolence", "maxSexualContent", "maxLanguageSubstance", "maxScaryIntense", "maxSensitiveThemes",
    "minViolence", "minSexualContent", "minLanguageSubstance", "minScaryIntense", "minSensitiveThemes",
  ];
  const hasAiFilter = AI_ONLY_PARAMS.some((k) => searchParams.has(k));

  // Local debounced state for text inputs
  // We track a "pending" ref per field: set to true when the user edits locally
  // and cleared when the URL catches up. This prevents stale URL values from
  // overwriting characters the user has typed since the last debounce fired.
  const currentSearch = searchParams.get("search") ?? "";
  const [searchInput, setSearchInput] = useState(currentSearch);
  const [yearFrom, setYearFrom] = useState(currentYearFrom);
  const [yearTo, setYearTo] = useState(currentYearTo);
  const [ratingVal, setRatingVal] = useState(currentRatingVal);
  const searchPending = useRef(false);
  const yearFromPending = useRef(false);
  const yearToPending = useRef(false);
  const ratingPending = useRef(false);
  // Sync local state from URL only when the URL catches up to what we pushed
  useEffect(() => { if (searchPending.current) { searchPending.current = false; } else { setSearchInput(currentSearch); } }, [currentSearch]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (yearFromPending.current) { yearFromPending.current = false; } else { setYearFrom(currentYearFrom); } }, [currentYearFrom]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (yearToPending.current) { yearToPending.current = false; } else { setYearTo(currentYearTo); } }, [currentYearTo]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (ratingPending.current) { ratingPending.current = false; } else { setRatingVal(currentRatingVal); } }, [currentRatingVal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Actor search
  const [actorQuery, setActorQuery] = useState("");
  const [actorResults, setActorResults] = useState<ActorOption[]>([]);
  const actorTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keyword search
  const [keywordQuery, setKeywordQuery] = useState("");
  const [keywordResults, setKeywordResults] = useState<{ id: number; name: string }[]>([]);
  const keywordTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cast filters derived from URL
  const castFilters = currentCastIds.map((id, i) => ({
    id: Number(id),
    name: currentCastLabels[i] ?? id,
  }));

  // Keyword filters derived from URL
  const keywordFilters = currentKeywordIds.map((id, i) => ({
    id: Number(id),
    name: currentKeywordLabels[i] ?? id,
  }));

  const activeFilterCount = [
    currentGenres.length > 0,
    castFilters.length > 0,
    keywordFilters.length > 0,
    currentYearFrom || currentYearTo,
    currentMpaa.length > 0,
    currentRatingVal,
    currentReleaseStatus,
    currentProviders.length > 0,
    currentCompanies.length > 0,
    currentLanguage,
    currentSeenStatus,
    hasAiFilter,
  ].filter(Boolean).length;

  function clearAiFilters() {
    const params = new URLSearchParams(searchParams.toString());
    for (const k of AI_ONLY_PARAMS) params.delete(k);
    params.delete("page");
    navigate(`/movies?${params.toString()}`);
  }

  function update(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    params.delete("page");
    // Auto-switch to Relevance sort ONLY when:
    //   (1) this update is touching a filter key (not view/type/sort/etc.)
    //   (2) the user had zero active filters before this change
    //   (3) the user hasn't already explicitly set a sort
    // After any of these conditions stop holding, further filter changes keep
    // whatever sort the user picked.
    const touchingFilter = Object.keys(updates).some((k) => FILTER_URL_KEYS.has(k));
    if (touchingFilter && activeFilterCount === 0 && !searchParams.has("sort")) {
      params.set("sort", "relevance");
    }
    navigate(`/movies?${params.toString()}`);
  }

  function clearAllFilters() {
    // Keep only non-filter session state (view/sort/search/perPage/type).
    // AI params are filters too — they get cleared alongside everything else.
    const params = new URLSearchParams();
    const sort = searchParams.get("sort");
    const view = searchParams.get("view");
    const search = searchParams.get("search");
    const perPage = searchParams.get("perPage");
    const type = searchParams.get("type");
    if (sort) params.set("sort", sort);
    if (view) params.set("view", view);
    if (search) params.set("search", search);
    if (perPage) params.set("perPage", perPage);
    if (type) params.set("type", type);
    navigate(`/movies?${params.toString()}`);
  }

  function toggleGenre(id: string) {
    const next = currentGenres.includes(id)
      ? currentGenres.filter((g) => g !== id)
      : [...currentGenres, id];
    update({ genres: next.length > 0 ? next.join(",") : null });
  }

  function toggleMpaa(rating: string) {
    const next = currentMpaa.includes(rating)
      ? currentMpaa.filter((r) => r !== rating)
      : [...currentMpaa, rating];
    update({ mpaa: next.length > 0 ? next.join(",") : null });
  }

  function toggleProvider(id: string) {
    const next = currentProviders.includes(id)
      ? currentProviders.filter((p) => p !== id)
      : [...currentProviders, id];
    // Auto-enable showProviders when a provider is selected
    const updates: Record<string, string | null> = {
      providers: next.length > 0 ? next.join(",") : null,
    };
    if (next.length > 0 && !currentShowProviders) updates.showProviders = "1";
    if (next.length === 0) updates.showProviders = null;
    update(updates);
  }

  function toggleCompany(id: string) {
    const next = currentCompanies.includes(id)
      ? currentCompanies.filter((c) => c !== id)
      : [...currentCompanies, id];
    update({ companies: next.length > 0 ? next.join(",") : null });
  }

  function addCast(actor: ActorOption) {
    if (currentCastIds.includes(String(actor.id))) return;
    setActorQuery("");
    setActorResults([]);
    update({
      cast: [...currentCastIds, String(actor.id)].join(","),
      castLabels: [...castFilters.map((c) => c.name), actor.name].join(","),
    });
  }

  function removeCast(id: number) {
    const remaining = castFilters.filter((c) => c.id !== id);
    update({
      cast: remaining.length > 0 ? remaining.map((c) => String(c.id)).join(",") : null,
      castLabels: remaining.length > 0 ? remaining.map((c) => c.name).join(",") : null,
    });
  }

  async function searchActors(q: string) {
    setActorQuery(q);
    if (actorTimeout.current) clearTimeout(actorTimeout.current);
    if (q.length < 2) { setActorResults([]); return; }
    actorTimeout.current = setTimeout(async () => {
      const res = await fetch(
        `https://api.themoviedb.org/3/search/person?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&query=${encodeURIComponent(q)}&include_adult=false`
      );
      const data = await res.json();
      setActorResults((data.results ?? []).slice(0, 5));
    }, 300);
  }

  function addKeyword(kw: { id: number; name: string }) {
    if (currentKeywordIds.includes(String(kw.id))) return;
    setKeywordQuery("");
    setKeywordResults([]);
    update({
      keywords: [...currentKeywordIds, String(kw.id)].join(","),
      keywordLabels: [...keywordFilters.map((k) => k.name), kw.name].join(","),
    });
  }

  function removeKeyword(id: number) {
    const remaining = keywordFilters.filter((k) => k.id !== id);
    update({
      keywords: remaining.length > 0 ? remaining.map((k) => String(k.id)).join(",") : null,
      keywordLabels: remaining.length > 0 ? remaining.map((k) => k.name).join(",") : null,
    });
  }

  async function searchKeywordsLocal(q: string) {
    setKeywordQuery(q);
    if (keywordTimeout.current) clearTimeout(keywordTimeout.current);
    if (q.length < 2) { setKeywordResults([]); return; }
    keywordTimeout.current = setTimeout(async () => {
      const res = await fetch(
        `https://api.themoviedb.org/3/search/keyword?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&query=${encodeURIComponent(q)}`
      );
      const data = await res.json();
      setKeywordResults((data.results ?? []).slice(0, 8));
    }, 300);
  }

  const yearTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleYearChange(field: "yearFrom" | "yearTo", val: string) {
    if (field === "yearFrom") { setYearFrom(val); yearFromPending.current = true; }
    else { setYearTo(val); yearToPending.current = true; }
    if (yearTimeout.current) clearTimeout(yearTimeout.current);
    yearTimeout.current = setTimeout(() => update({ [field]: val || null }), 600);
  }

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleSearchChange(val: string) {
    setSearchInput(val);
    searchPending.current = true;
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => update({ search: val || null }), 400);
  }

  const ratingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleRatingValChange(val: string) {
    setRatingVal(val);
    ratingPending.current = true;
    if (ratingTimeout.current) clearTimeout(ratingTimeout.current);
    ratingTimeout.current = setTimeout(() => update({ ratingVal: val || null }), 600);
  }

  const chipBase = "px-2.5 py-1 rounded-full border text-xs font-medium transition-colors cursor-pointer";
  const chipOn = "border-[var(--ratist-red)] bg-[var(--ratist-red)]/10 text-white";
  const chipOff = "border-[var(--border)] text-[var(--foreground-muted)] hover:border-[var(--ratist-red)] hover:text-white";

  return (
    <div className="mb-6">
      {/* Content type toggle */}
      <div className="flex items-center gap-1 mb-3">
        {[
          { value: "all", label: "All" },
          { value: "movie", label: "Movies", icon: Film },
          { value: "tv", label: "TV Shows", icon: Tv },
        ].map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            onClick={() => {
              const switchingToTv = value === "tv" && currentType !== "tv";
              const switchingFromTv = value !== "tv" && currentType === "tv";
              const updates: Record<string, string | null> = { type: value === "all" ? null : value };
              if ((switchingToTv || switchingFromTv) && currentGenres.length > 0) {
                const translated = translateGenres(currentGenres, switchingToTv);
                updates.genres = translated.length > 0 ? translated.join(",") : null;
              }
              update(updates);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              currentType === value
                ? value === "tv" ? "bg-blue-600/20 border border-blue-500/40 text-blue-400" : "bg-[var(--ratist-red)]/10 border border-[var(--ratist-red)]/40 text-white"
                : "border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white hover:border-[var(--ratist-red)]"
            }`}
          >
            {Icon && <Icon className="w-3.5 h-3.5" />}
            {label}
          </button>
        ))}
      </div>

      {/* Always-visible top bar */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        {/* Title search — search icon swaps to a spinner while a
           transition (URL push triggered by typing or any other
           filter change) is in flight. This is the only "loading"
           cue the user sees during a search update; the existing
           results stay visible until the new SSR is ready, so the
           page never blanks out. */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          {isPending ? (
            <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ratist-red)] animate-spin" />
          ) : (
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)]" />
          )}
          <input
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search by title…"
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg pl-9 pr-8 py-1.5 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
          />
          {searchInput && (
            <button onClick={() => handleSearchChange("")} className="absolute right-2.5 top-1/2 -translate-y-1/2">
              <X className="w-3.5 h-3.5 text-[var(--foreground-muted)] hover:text-white" />
            </button>
          )}
        </div>

        <button
          onClick={() => setFiltersOpen((o) => !o)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors ${
            filtersOpen || activeFilterCount > 0
              ? "border-[var(--ratist-red)] text-white bg-[var(--ratist-red)]/10"
              : "border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"
          }`}
        >
          <Filter className="w-3.5 h-3.5" />
          Filters
          {activeFilterCount > 0 && (
            <span className="bg-[var(--ratist-red)] text-white text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">
              {activeFilterCount}
            </span>
          )}
          {filtersOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        <select
          value={currentSort}
          onChange={(e) => update({ sort: e.target.value })}
          className="bg-[var(--surface)] border border-[var(--border)] text-sm text-white rounded px-3 py-1.5 focus:outline-none focus:border-[var(--ratist-red)]"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* Per page */}
        <select
          value={currentPerPage}
          onChange={(e) => update({ perPage: e.target.value === "20" ? null : e.target.value })}
          className="bg-[var(--surface)] border border-[var(--border)] text-sm text-white rounded px-3 py-1.5 focus:outline-none focus:border-[var(--ratist-red)]"
        >
          {PER_PAGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <div className="flex items-center gap-1 bg-[var(--surface)] border border-[var(--border)] rounded p-1 ml-auto">
          <button
            onClick={() => update({ view: "grid" })}
            className={`p-1.5 rounded transition-colors ${currentView === "grid" ? "bg-[var(--ratist-red)] text-white" : "text-[var(--foreground-muted)] hover:text-white"}`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => update({ view: "list" })}
            className={`p-1.5 rounded transition-colors ${currentView === "list" ? "bg-[var(--ratist-red)] text-white" : "text-[var(--foreground-muted)] hover:text-white"}`}
          >
            <List className="w-4 h-4" />
          </button>
        </div>

        {!hideTotalResults && (
          <p className="text-sm text-[var(--foreground-muted)]">{totalResults.toLocaleString()} {currentType === "tv" ? "shows" : currentType === "movie" ? "movies" : "results"}</p>
        )}
      </div>

      {/* Active filter chips (when panel is closed) */}
      {activeFilterCount > 0 && !filtersOpen && (
        <div className="flex items-center gap-2 flex-wrap mb-3">
          {currentGenres.map((gid) => {
            const g = genres.find((x) => String(x.id) === gid);
            return g ? (
              <span key={gid} className="flex items-center gap-1.5 bg-[var(--surface)] border border-[var(--ratist-red)]/50 rounded-full px-2.5 py-1 text-xs text-white">
                {g.name}
                <button onClick={() => toggleGenre(gid)}><X className="w-2.5 h-2.5 text-[var(--foreground-muted)] hover:text-white" /></button>
              </span>
            ) : null;
          })}
          {castFilters.map((a) => (
            <span key={a.id} className="flex items-center gap-1.5 bg-[var(--surface)] border border-[var(--ratist-red)]/50 rounded-full px-2.5 py-1 text-xs text-white">
              {a.name}
              <button onClick={() => removeCast(a.id)}><X className="w-2.5 h-2.5 text-[var(--foreground-muted)] hover:text-white" /></button>
            </span>
          ))}
          {keywordFilters.map((k) => (
            <span key={k.id} className="flex items-center gap-1.5 bg-[var(--surface)] border border-[var(--ratist-red)]/50 rounded-full px-2.5 py-1 text-xs text-white">
              {k.name}
              <button onClick={() => removeKeyword(k.id)}><X className="w-2.5 h-2.5 text-[var(--foreground-muted)] hover:text-white" /></button>
            </span>
          ))}
          {(currentYearFrom || currentYearTo) && (
            <span className="flex items-center gap-1.5 bg-[var(--surface)] border border-[var(--ratist-red)]/50 rounded-full px-2.5 py-1 text-xs text-white">
              {currentYearFrom && currentYearTo ? `${currentYearFrom}–${currentYearTo}` : currentYearFrom ? `From ${currentYearFrom}` : `Until ${currentYearTo}`}
              <button onClick={() => update({ yearFrom: null, yearTo: null })}><X className="w-2.5 h-2.5 text-[var(--foreground-muted)] hover:text-white" /></button>
            </span>
          )}
          {currentMpaa.map((r) => (
            <span key={r} className="flex items-center gap-1.5 bg-[var(--surface)] border border-[var(--ratist-red)]/50 rounded-full px-2.5 py-1 text-xs text-white">
              {r}
              <button onClick={() => toggleMpaa(r)}><X className="w-2.5 h-2.5 text-[var(--foreground-muted)] hover:text-white" /></button>
            </span>
          ))}
          {currentRatingVal && (
            <span className="flex items-center gap-1.5 bg-[var(--surface)] border border-[var(--ratist-red)]/50 rounded-full px-2.5 py-1 text-xs text-white">
              Rating {currentRatingOp === "gte" ? "≥" : "≤"} {currentRatingVal}
              <button onClick={() => update({ ratingVal: null })}><X className="w-2.5 h-2.5 text-[var(--foreground-muted)] hover:text-white" /></button>
            </span>
          )}
          {currentReleaseStatus && (
            <span className="flex items-center gap-1.5 bg-[var(--surface)] border border-[var(--ratist-red)]/50 rounded-full px-2.5 py-1 text-xs text-white">
              {RELEASE_OPTIONS.find((o) => o.value === currentReleaseStatus)?.label}
              <button onClick={() => update({ releaseStatus: null })}><X className="w-2.5 h-2.5 text-[var(--foreground-muted)] hover:text-white" /></button>
            </span>
          )}
          {currentProviders.map((pid) => {
            const p = STREAMING_PROVIDERS.find((s) => String(s.id) === pid);
            return p ? (
              <span key={pid} className="flex items-center gap-1.5 bg-[var(--surface)] border border-[var(--ratist-red)]/50 rounded-full px-2.5 py-1 text-xs text-white">
                <img src={`${IMAGE_BASE_URL}/w92${p.logo}`} alt="" width={14} height={14} className="rounded-[2px]" />
                {p.short}
                <button onClick={() => toggleProvider(pid)}><X className="w-2.5 h-2.5 text-[var(--foreground-muted)] hover:text-white" /></button>
              </span>
            ) : null;
          })}
          {currentLanguage && (
            <span className="flex items-center gap-1.5 bg-[var(--surface)] border border-[var(--ratist-red)]/50 rounded-full px-2.5 py-1 text-xs text-white">
              {LANGUAGES.find((l) => l.code === currentLanguage)?.name ?? currentLanguage}
              <button onClick={() => update({ language: null })}><X className="w-2.5 h-2.5 text-[var(--foreground-muted)] hover:text-white" /></button>
            </span>
          )}
          {currentCompanies.map((cid) => {
            const studio = STUDIOS.find((s) => String(s.id) === cid);
            return (
              <span key={cid} className="flex items-center gap-1.5 bg-[var(--surface)] border border-[var(--ratist-red)]/50 rounded-full px-2.5 py-1 text-xs text-white">
                {studio?.name ?? `Studio ${cid}`}
                <button onClick={() => toggleCompany(cid)}><X className="w-2.5 h-2.5 text-[var(--foreground-muted)] hover:text-white" /></button>
              </span>
            );
          })}
          {currentSeenStatus && (
            <span className="flex items-center gap-1.5 bg-[var(--surface)] border border-[var(--ratist-red)]/50 rounded-full px-2.5 py-1 text-xs text-white">
              {currentSeenStatus === "seen" ? "Seen" : "Haven't seen"}
              <button onClick={() => update({ seenStatus: null })}><X className="w-2.5 h-2.5 text-[var(--foreground-muted)] hover:text-white" /></button>
            </span>
          )}
          {hasAiFilter && (
            <span className="flex items-center gap-1.5 bg-[var(--surface)] border border-[var(--ratist-red)]/50 rounded-full px-2.5 py-1 text-xs text-white" title="AI-applied filters (severity caps, exclusions, etc.)">
              <Wand2 className="w-3 h-3 text-[var(--ratist-red)]" />
              AI filter
              <button onClick={clearAiFilters}><X className="w-2.5 h-2.5 text-[var(--foreground-muted)] hover:text-white" /></button>
            </span>
          )}
          <button onClick={clearAllFilters} className="text-xs text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] transition-colors">
            Clear all
          </button>
        </div>
      )}

      {/* Expandable filter panel */}
      {filtersOpen && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-5">

          {/* Release Status */}
          <div>
            <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider font-medium mb-2">Release Status</p>
            <div className="flex flex-wrap gap-2">
              {RELEASE_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => update({ releaseStatus: o.value || null })}
                  className={`${chipBase} ${currentReleaseStatus === o.value ? chipOn : chipOff}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Seen status — client-side overlay filter applied via
             SeenFilterRunner. Not pushed to TMDB; runs on the rendered
             results against the user's seen list. */}
          <div>
            <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider font-medium mb-2">Seen Status</p>
            <div className="flex flex-wrap gap-2">
              {SEEN_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => update({ seenStatus: o.value || null })}
                  className={`${chipBase} ${currentSeenStatus === o.value ? chipOn : chipOff}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Streaming Services */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider font-medium">Streaming Service</p>
              {currentProviders.length === 0 && (
                <label className="flex items-center gap-1.5 text-xs text-[var(--foreground-muted)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={currentShowProviders}
                    onChange={(e) => update({ showProviders: e.target.checked ? "1" : null })}
                    className="accent-[var(--ratist-red)] w-3 h-3"
                  />
                  <Monitor className="w-3 h-3" />
                  Show streaming
                </label>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {STREAMING_PROVIDERS.map((p) => (
                <button key={p.id} onClick={() => toggleProvider(String(p.id))} className={`${chipBase} flex items-center gap-1.5 ${currentProviders.includes(String(p.id)) ? chipOn : chipOff}`}>
                  <img src={`${IMAGE_BASE_URL}/w92${p.logo}`} alt="" width={16} height={16} className="rounded-[3px]" />
                  {p.short}
                </button>
              ))}
            </div>
          </div>

          {/* Studio */}
          <StudioFilter
            selectedIds={currentCompanies}
            onToggle={toggleCompany}
            onClear={() => update({ companies: null })}
          />

          {/* Original Language */}
          <div>
            <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider font-medium mb-2">Original Language</p>
            <select
              value={currentLanguage}
              onChange={(e) => update({ language: e.target.value || null })}
              className="bg-[var(--surface-2)] border border-[var(--border)] text-sm text-white rounded px-3 py-1.5 focus:outline-none focus:border-[var(--ratist-red)] max-w-xs"
            >
              <option value="">Any language</option>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.name}</option>
              ))}
            </select>
          </div>

          {/* Genres */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider font-medium">Genre</p>
              {currentGenres.length > 1 && (
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-[var(--foreground-muted)]">Match:</span>
                  <button onClick={() => update({ genreMode: "any" })} className={`${chipBase} ${currentGenreMode === "any" ? chipOn : chipOff}`}>Any</button>
                  <button onClick={() => update({ genreMode: "all" })} className={`${chipBase} ${currentGenreMode === "all" ? chipOn : chipOff}`}>All</button>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {genres.map((g) => (
                <button key={g.id} onClick={() => toggleGenre(String(g.id))} className={`${chipBase} ${currentGenres.includes(String(g.id)) ? chipOn : chipOff}`}>
                  {g.name}
                </button>
              ))}
            </div>
          </div>

          {/* Cast */}
          <div>
            <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider font-medium mb-2">Cast / Actor</p>
            {castFilters.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {castFilters.map((a) => (
                  <span key={a.id} className="flex items-center gap-1.5 bg-[var(--ratist-red)]/10 border border-[var(--ratist-red)]/50 rounded-full px-3 py-1 text-sm text-white">
                    {a.name}
                    <button onClick={() => removeCast(a.id)}><X className="w-3 h-3 text-[var(--foreground-muted)] hover:text-white" /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="relative max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--foreground-muted)]" />
              <input
                value={actorQuery}
                onChange={(e) => searchActors(e.target.value)}
                placeholder="Search for an actor…"
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] text-sm text-white rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:border-[var(--ratist-red)]"
              />
              {actorResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-xl z-20 overflow-hidden">
                  {actorResults.map((a) => (
                    <button key={a.id} onClick={() => addCast(a)} className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[var(--surface-2)] transition-colors text-left">
                      {a.profile_path ? (
                        <Image src={`https://image.tmdb.org/t/p/w45${a.profile_path}`} alt="" width={24} height={32} className="rounded w-6 h-8 object-cover shrink-0 object-top" />
                      ) : (
                        <div className="w-6 h-8 rounded bg-[var(--surface-2)] shrink-0 flex items-center justify-center text-xs">👤</div>
                      )}
                      <div>
                        <p className="text-sm text-white">{a.name}</p>
                        {a.known_for_department && <p className="text-xs text-[var(--foreground-muted)]">{a.known_for_department}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Keywords */}
          <div>
            <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider font-medium mb-2">Keywords / Tags</p>
            {keywordFilters.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {keywordFilters.map((k) => (
                  <span key={k.id} className="flex items-center gap-1.5 bg-[var(--ratist-red)]/10 border border-[var(--ratist-red)]/50 rounded-full px-3 py-1 text-sm text-white">
                    {k.name}
                    <button onClick={() => removeKeyword(k.id)}><X className="w-3 h-3 text-[var(--foreground-muted)] hover:text-white" /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="relative max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--foreground-muted)]" />
              <input
                value={keywordQuery}
                onChange={(e) => searchKeywordsLocal(e.target.value)}
                placeholder="Search keywords (e.g. plot twist, dystopia)…"
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] text-sm text-white rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:border-[var(--ratist-red)]"
              />
              {keywordResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-xl z-20 overflow-hidden">
                  {keywordResults.map((kw) => (
                    <button key={kw.id} onClick={() => addKeyword(kw)} className="w-full px-3 py-2 hover:bg-[var(--surface-2)] transition-colors text-left text-sm text-white">
                      {kw.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Year / MPA / Rating row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">

            {/* Year range */}
            <div>
              <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider font-medium mb-2">Year Released</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={yearFrom}
                  onChange={(e) => handleYearChange("yearFrom", e.target.value)}
                  placeholder="From"
                  min={1900} max={2030}
                  className="w-full bg-[var(--surface-2)] border border-[var(--border)] text-sm text-white rounded px-3 py-1.5 focus:outline-none focus:border-[var(--ratist-red)]"
                />
                <span className="text-[var(--foreground-muted)] text-xs shrink-0">to</span>
                <input
                  type="number"
                  value={yearTo}
                  onChange={(e) => handleYearChange("yearTo", e.target.value)}
                  placeholder="To"
                  min={1900} max={2030}
                  className="w-full bg-[var(--surface-2)] border border-[var(--border)] text-sm text-white rounded px-3 py-1.5 focus:outline-none focus:border-[var(--ratist-red)]"
                />
              </div>
            </div>

            {/* Content Rating */}
            <div>
              <div className="flex items-baseline gap-2 mb-2">
                <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider font-medium">MPA Rating</p>
                {(currentType === "all" || currentType === "tv") && (
                  <p className="text-[10px] text-[var(--foreground-muted)]">
                    Filter by{" "}
                    <button onClick={() => update({ type: "movie" })} className="text-[var(--ratist-red)] hover:underline font-medium">
                      Movies
                    </button>
                    {" "}to enable
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {MPAA_RATINGS.map((r) => (
                  <button
                    key={r}
                    onClick={() => currentType !== "all" && currentType !== "tv" && toggleMpaa(r)}
                    className={`${chipBase} ${
                      currentType === "all" || currentType === "tv"
                        ? "border-[var(--border)] text-[var(--foreground-muted)] opacity-40 cursor-not-allowed"
                        : currentMpaa.includes(r) ? chipOn : chipOff
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="flex items-baseline gap-2 mb-2">
                <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider font-medium">TV Rating</p>
                {currentType !== "tv" && (
                  <p className="text-[10px] text-[var(--foreground-muted)]">
                    Filter by{" "}
                    <button onClick={() => update({ type: "tv" })} className="text-[var(--ratist-red)] hover:underline font-medium">
                      TV Shows
                    </button>
                    {" "}to enable
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {TV_RATINGS.map((r) => (
                  <button
                    key={r}
                    onClick={() => currentType === "tv" && toggleMpaa(r)}
                    className={`${chipBase} ${
                      currentType !== "tv"
                        ? "border-[var(--border)] text-[var(--foreground-muted)] opacity-40 cursor-not-allowed"
                        : currentMpaa.includes(r) ? chipOn : chipOff
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Community rating */}
            <div>
              <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider font-medium mb-2">Community Rating</p>
              <div className="flex items-center gap-2">
                <div className="flex rounded overflow-hidden border border-[var(--border)] shrink-0">
                  <button
                    onClick={() => update({ ratingOp: "gte" })}
                    className={`px-2.5 py-1.5 text-sm transition-colors ${currentRatingOp === "gte" ? "bg-[var(--ratist-red)] text-white" : "bg-[var(--surface)] text-[var(--foreground-muted)] hover:text-white"}`}
                  >≥</button>
                  <button
                    onClick={() => update({ ratingOp: "lte" })}
                    className={`px-2.5 py-1.5 text-sm transition-colors ${currentRatingOp === "lte" ? "bg-[var(--ratist-red)] text-white" : "bg-[var(--surface)] text-[var(--foreground-muted)] hover:text-white"}`}
                  >≤</button>
                </div>
                <input
                  type="number"
                  value={ratingVal}
                  onChange={(e) => handleRatingValChange(e.target.value)}
                  placeholder="7.5"
                  min={0} max={10} step={0.1}
                  className="w-20 bg-[var(--surface-2)] border border-[var(--border)] text-sm text-white rounded px-3 py-1.5 focus:outline-none focus:border-[var(--ratist-red)]"
                />
              </div>
            </div>
          </div>

          {/* AI filter (hidden dimensions bundle) */}
          {hasAiFilter && (
            <div>
              <p className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wider font-medium mb-1.5">AI</p>
              <button
                onClick={clearAiFilters}
                title="Remove AI-applied filters (severity caps, exclusions, etc.)"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border bg-[var(--ratist-red)]/10 border-[var(--ratist-red)]/30 text-white hover:bg-[var(--ratist-red)]/20 transition-colors"
              >
                <Wand2 className="w-3 h-3" />
                AI filter
                <X className="w-3 h-3 ml-0.5" />
              </button>
            </div>
          )}

          {/* Footer */}
          {activeFilterCount > 0 && (
            <div className="flex justify-end pt-2 border-t border-[var(--border)]">
              <button onClick={clearAllFilters} className="text-xs text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] transition-colors">
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StudioFilter({
  selectedIds,
  onToggle,
  onClear,
}: {
  selectedIds: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement | null>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [open]);

  const trimmed = query.trim().toLowerCase();
  const filtered = trimmed
    ? STUDIOS.filter((s) => s.name.toLowerCase().includes(trimmed))
    : STUDIOS;
  // Popular studios first when no search query, then alphabetical.
  const sorted = trimmed
    ? filtered
    : [...filtered].sort((a, b) => {
        if (a.popular !== b.popular) return a.popular ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

  const selectedNames = STUDIOS
    .filter((s) => selectedIds.includes(String(s.id)))
    .map((s) => s.name);

  return (
    <div>
      <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider font-medium mb-2">Studio</p>
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`flex items-center justify-between gap-2 bg-[var(--surface-2)] border text-sm rounded px-3 py-1.5 min-w-[200px] max-w-full focus:outline-none ${
            selectedIds.length > 0 ? "border-[var(--ratist-red)]/50 text-white" : "border-[var(--border)] text-[var(--foreground-muted)]"
          }`}
        >
          <span className="truncate text-left">
            {selectedIds.length === 0
              ? "Any studio"
              : selectedIds.length === 1
              ? selectedNames[0] ?? "1 studio"
              : `${selectedIds.length} studios`}
          </span>
          <ChevronDown className="w-3.5 h-3.5 shrink-0" />
        </button>

        {open && (
          <div className="absolute left-0 top-full mt-1 z-30 w-72 max-w-[calc(100vw-2rem)] bg-[var(--background)] border border-[var(--border)] rounded-xl shadow-xl">
            <div className="p-2 border-b border-[var(--border)]">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter studios..."
                autoFocus
                className="w-full bg-[var(--surface)] border border-[var(--border)] rounded px-2.5 py-1.5 text-xs text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
              />
            </div>
            <ul className="max-h-72 overflow-y-auto py-1">
              {sorted.length === 0 ? (
                <li className="text-xs text-[var(--foreground-muted)] px-3 py-2">No studios match.</li>
              ) : (
                sorted.map((s) => {
                  const checked = selectedIds.includes(String(s.id));
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => onToggle(String(s.id))}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors ${
                          checked ? "bg-[var(--ratist-red)]/10 text-white" : "text-[var(--foreground-muted)] hover:bg-[var(--surface)] hover:text-white"
                        }`}
                      >
                        <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                          checked ? "bg-[var(--ratist-red)] border-[var(--ratist-red)]" : "border-[var(--border)]"
                        }`}>
                          {checked && (
                            <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                              <path d="M20 6L9 17l-5-5" />
                            </svg>
                          )}
                        </span>
                        <span className="truncate">{s.name}</span>
                        {s.popular && !trimmed && (
                          <span className="ml-auto text-[9px] uppercase tracking-wider text-[var(--foreground-muted)] shrink-0">Popular</span>
                        )}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
            {selectedIds.length > 0 && (
              <div className="p-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => { onClear(); setQuery(""); }}
                  className="text-xs text-[var(--foreground-muted)] hover:text-white transition-colors"
                >
                  Clear all studios
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
