"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Filter, X, Search, ChevronDown, ChevronUp } from "lucide-react";
import Image from "next/image";

const DEPARTMENTS = ["Acting", "Directing", "Writing", "Production", "Sound", "Camera"];

const SORT_OPTIONS = [
  { value: "popular", label: "Most Popular" },
  { value: "az", label: "Name A–Z" },
  { value: "za", label: "Name Z–A" },
];

const PER_PAGE_OPTIONS = [
  { value: "20", label: "20 / page" },
  { value: "50", label: "50 / page" },
  { value: "100", label: "100 / page" },
];

interface MovieOption {
  id: number;
  title: string;
  poster_path: string | null;
  release_date: string;
  mediaType: "movie" | "tv";
}

interface Props {
  totalResults: number;
}

export default function CelebritiesFilterBar({ totalResults }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const currentQ = searchParams.get("q") ?? "";
  const currentMovie = searchParams.get("movie") ?? "";
  const currentMovieLabel = searchParams.get("movieLabel") ?? "";
  const currentDept = searchParams.get("dept") ?? "";
  const currentSort = searchParams.get("sort") ?? "popular";
  const currentAgeMin = searchParams.get("ageMin") ?? "";
  const currentAgeMax = searchParams.get("ageMax") ?? "";
  const currentCratingOp = (searchParams.get("cratingOp") ?? "gte") as "gte" | "lte";
  const currentCratingVal = searchParams.get("cratingGte") ?? searchParams.get("cratingLte") ?? "";
  const currentPerPage = searchParams.get("perPage") ?? "20";

  const [qInput, setQInput] = useState(currentQ);
  const [ageMin, setAgeMin] = useState(currentAgeMin);
  const [ageMax, setAgeMax] = useState(currentAgeMax);
  const [cratingVal, setCratingVal] = useState(currentCratingVal);
  const [movieQuery, setMovieQuery] = useState("");
  const [movieResults, setMovieResults] = useState<MovieOption[]>([]);

  const qTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const movieTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ageTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cratingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setQInput(currentQ); }, [currentQ]);
  useEffect(() => { setAgeMin(currentAgeMin); }, [currentAgeMin]);
  useEffect(() => { setAgeMax(currentAgeMax); }, [currentAgeMax]);
  useEffect(() => { setCratingVal(currentCratingVal); }, [currentCratingVal]);

  const activeFilterCount = [
    !!currentMovie,
    !!currentDept,
    !!(currentAgeMin || currentAgeMax),
    !!currentCratingVal,
  ].filter(Boolean).length;

  function update(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    params.delete("page");
    router.push(`/celebrities?${params.toString()}`);
  }

  function clearAllFilters() {
    const params = new URLSearchParams();
    const sort = searchParams.get("sort");
    const q = searchParams.get("q");
    const perPage = searchParams.get("perPage");
    if (sort) params.set("sort", sort);
    if (q) params.set("q", q);
    if (perPage) params.set("perPage", perPage);
    router.push(`/celebrities?${params.toString()}`);
  }

  function handleQChange(val: string) {
    setQInput(val);
    if (qTimeout.current) clearTimeout(qTimeout.current);
    qTimeout.current = setTimeout(() => update({ q: val || null }), 400);
  }

  function handleAgeChange(field: "ageMin" | "ageMax", val: string) {
    if (field === "ageMin") setAgeMin(val);
    else setAgeMax(val);
    if (ageTimeout.current) clearTimeout(ageTimeout.current);
    ageTimeout.current = setTimeout(() => update({ [field]: val || null }), 600);
  }

  function handleCratingValChange(val: string) {
    setCratingVal(val);
    if (cratingTimeout.current) clearTimeout(cratingTimeout.current);
    cratingTimeout.current = setTimeout(() => {
      update({
        cratingGte: currentCratingOp === "gte" ? (val || null) : null,
        cratingLte: currentCratingOp === "lte" ? (val || null) : null,
      });
    }, 600);
  }

  function setCratingOp(op: "gte" | "lte") {
    update({
      cratingOp: op,
      cratingGte: op === "gte" ? (currentCratingVal || null) : null,
      cratingLte: op === "lte" ? (currentCratingVal || null) : null,
    });
  }

  async function searchMoviesForFilter(q: string) {
    setMovieQuery(q);
    if (movieTimeout.current) clearTimeout(movieTimeout.current);
    if (q.length < 2) { setMovieResults([]); return; }
    movieTimeout.current = setTimeout(async () => {
      const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
      const [movieRes, tvRes] = await Promise.all([
        fetch(`https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(q)}&include_adult=false`).then((r) => r.json()).catch(() => ({ results: [] })),
        fetch(`https://api.themoviedb.org/3/search/tv?api_key=${apiKey}&query=${encodeURIComponent(q)}&include_adult=false`).then((r) => r.json()).catch(() => ({ results: [] })),
      ]);
      const movies = (movieRes.results ?? []).slice(0, 4).map((m: { id: number; title: string; poster_path: string | null; release_date: string }) => ({ ...m, mediaType: "movie" as const }));
      const shows = (tvRes.results ?? []).slice(0, 3).map((s: { id: number; name: string; poster_path: string | null; first_air_date: string }) => ({
        id: s.id, title: s.name, poster_path: s.poster_path, release_date: s.first_air_date ?? "", mediaType: "tv" as const,
      }));
      setMovieResults([...movies, ...shows]);
    }, 300);
  }

  function selectMovie(movie: MovieOption) {
    setMovieQuery("");
    setMovieResults([]);
    update({ movie: String(movie.id), movieLabel: movie.title, movieMediaType: movie.mediaType });
  }

  function clearMovie() {
    update({ movie: null, movieLabel: null, movieMediaType: null });
  }

  function toggleDept(dept: string) {
    update({ dept: currentDept === dept ? null : dept });
  }

  const chipBase = "px-2.5 py-1 rounded-full border text-xs font-medium transition-colors cursor-pointer";
  const chipOn = "border-[var(--ratist-red)] bg-[var(--ratist-red)]/10 text-white";
  const chipOff = "border-[var(--border)] text-[var(--foreground-muted)] hover:border-[var(--ratist-red)] hover:text-white";

  return (
    <div className="mb-6">
      {/* Top bar */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        {/* Name search */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)]" />
          <input
            value={qInput}
            onChange={(e) => handleQChange(e.target.value)}
            placeholder="Search by name…"
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg pl-9 pr-8 py-1.5 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
          />
          {qInput && (
            <button onClick={() => handleQChange("")} className="absolute right-2.5 top-1/2 -translate-y-1/2">
              <X className="w-3.5 h-3.5 text-[var(--foreground-muted)] hover:text-white" />
            </button>
          )}
        </div>

        {/* Filters button */}
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

        {/* Sort */}
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

        <p className="text-sm text-[var(--foreground-muted)] ml-auto">{totalResults.toLocaleString()} people</p>
      </div>

      {/* Active filter chips */}
      {activeFilterCount > 0 && !filtersOpen && (
        <div className="flex items-center gap-2 flex-wrap mb-3">
          {currentMovie && (
            <span className="flex items-center gap-1.5 bg-[var(--surface)] border border-[var(--ratist-red)]/50 rounded-full px-2.5 py-1 text-xs text-white">
              In: {currentMovieLabel || `Movie ${currentMovie}`}
              <button onClick={clearMovie}><X className="w-2.5 h-2.5 text-[var(--foreground-muted)] hover:text-white" /></button>
            </span>
          )}
          {currentDept && (
            <span className="flex items-center gap-1.5 bg-[var(--surface)] border border-[var(--ratist-red)]/50 rounded-full px-2.5 py-1 text-xs text-white">
              {currentDept}
              <button onClick={() => toggleDept(currentDept)}><X className="w-2.5 h-2.5 text-[var(--foreground-muted)] hover:text-white" /></button>
            </span>
          )}
          {(currentAgeMin || currentAgeMax) && (
            <span className="flex items-center gap-1.5 bg-[var(--surface)] border border-[var(--ratist-red)]/50 rounded-full px-2.5 py-1 text-xs text-white">
              Age: {currentAgeMin && currentAgeMax ? `${currentAgeMin}–${currentAgeMax}` : currentAgeMin ? `≥ ${currentAgeMin}` : `≤ ${currentAgeMax}`}
              <button onClick={() => update({ ageMin: null, ageMax: null })}><X className="w-2.5 h-2.5 text-[var(--foreground-muted)] hover:text-white" /></button>
            </span>
          )}
          {currentCratingVal && (
            <span className="flex items-center gap-1.5 bg-[var(--surface)] border border-[var(--ratist-red)]/50 rounded-full px-2.5 py-1 text-xs text-white">
              Rating {currentCratingOp === "gte" ? "≥" : "≤"} {currentCratingVal}
              <button onClick={() => update({ cratingGte: null, cratingLte: null })}><X className="w-2.5 h-2.5 text-[var(--foreground-muted)] hover:text-white" /></button>
            </span>
          )}
          <button onClick={clearAllFilters} className="text-xs text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] transition-colors">
            Clear all
          </button>
        </div>
      )}

      {/* Collapsible panel */}
      {filtersOpen && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-5">

          {/* Movie filter */}
          <div>
            <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider font-medium mb-2">Appeared In</p>
            {currentMovie ? (
              <div className="flex items-center gap-1.5 bg-[var(--ratist-red)]/10 border border-[var(--ratist-red)]/50 rounded-full px-3 py-1 text-sm text-white w-fit">
                {currentMovieLabel || `Movie ID ${currentMovie}`}
                <button onClick={clearMovie}><X className="w-3 h-3 text-[var(--foreground-muted)] hover:text-white" /></button>
              </div>
            ) : (
              <div className="relative max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--foreground-muted)]" />
                <input
                  value={movieQuery}
                  onChange={(e) => searchMoviesForFilter(e.target.value)}
                  placeholder="Search movie or show…"
                  className="w-full bg-[var(--surface-2)] border border-[var(--border)] text-sm text-white rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:border-[var(--ratist-red)]"
                />
                {movieResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-xl z-20 overflow-hidden">
                    {movieResults.map((m) => (
                      <button key={m.id} onClick={() => selectMovie(m)} className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[var(--surface-2)] transition-colors text-left">
                        {m.poster_path ? (
                          <Image src={`https://image.tmdb.org/t/p/w45${m.poster_path}`} alt="" width={24} height={36} className="rounded w-6 h-9 object-cover shrink-0" />
                        ) : (
                          <div className="w-6 h-9 rounded bg-[var(--surface-2)] shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm text-white">{m.title}</p>
                            {m.mediaType === "tv" && <span className="text-[8px] font-bold bg-blue-600/30 text-blue-400 px-1 py-0.5 rounded">TV</span>}
                          </div>
                          {m.release_date && <p className="text-xs text-[var(--foreground-muted)]">{m.release_date.slice(0, 4)}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Department */}
          <div>
            <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider font-medium mb-2">Role / Department</p>
            <div className="flex flex-wrap gap-2">
              {DEPARTMENTS.map((d) => (
                <button key={d} onClick={() => toggleDept(d)} className={`${chipBase} ${currentDept === d ? chipOn : chipOff}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Age range */}
          <div>
            <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider font-medium mb-2">Age Range</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={ageMin}
                onChange={(e) => handleAgeChange("ageMin", e.target.value)}
                placeholder="Min"
                min={0} max={120}
                className="w-24 bg-[var(--surface-2)] border border-[var(--border)] text-sm text-white rounded px-3 py-1.5 focus:outline-none focus:border-[var(--ratist-red)]"
              />
              <span className="text-[var(--foreground-muted)] text-xs">to</span>
              <input
                type="number"
                value={ageMax}
                onChange={(e) => handleAgeChange("ageMax", e.target.value)}
                placeholder="Max"
                min={0} max={120}
                className="w-24 bg-[var(--surface-2)] border border-[var(--border)] text-sm text-white rounded px-3 py-1.5 focus:outline-none focus:border-[var(--ratist-red)]"
              />
            </div>
            <p className="text-xs text-[var(--foreground-muted)] opacity-60 mt-1.5">
              Filters from TMDB&apos;s popular list — increase results per page for more matches.
            </p>
          </div>

          {/* Community rating */}
          <div>
            <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider font-medium mb-2">
              Community Rating (avg across filmography)
            </p>
            <div className="flex items-center gap-2">
              <div className="flex rounded overflow-hidden border border-[var(--border)] shrink-0">
                <button
                  onClick={() => setCratingOp("gte")}
                  className={`px-2.5 py-1.5 text-sm transition-colors ${currentCratingOp === "gte" ? "bg-[var(--ratist-red)] text-white" : "bg-[var(--surface)] text-[var(--foreground-muted)] hover:text-white"}`}
                >≥</button>
                <button
                  onClick={() => setCratingOp("lte")}
                  className={`px-2.5 py-1.5 text-sm transition-colors ${currentCratingOp === "lte" ? "bg-[var(--ratist-red)] text-white" : "bg-[var(--surface)] text-[var(--foreground-muted)] hover:text-white"}`}
                >≤</button>
              </div>
              <input
                type="number"
                value={cratingVal}
                onChange={(e) => handleCratingValChange(e.target.value)}
                placeholder="7.5"
                min={0} max={10} step={0.1}
                className="w-20 bg-[var(--surface-2)] border border-[var(--border)] text-sm text-white rounded px-3 py-1.5 focus:outline-none focus:border-[var(--ratist-red)]"
              />
            </div>
            <p className="text-xs text-[var(--foreground-muted)] opacity-60 mt-1.5">
              Scale 0–10. Uses TMDB scores with Ratist community ratings where available.
            </p>
          </div>

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
