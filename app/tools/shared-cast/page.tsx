"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { Search, X, Users, Tv } from "lucide-react";
import { posterUrl } from "@/lib/tmdb";
import ShareButton from "@/components/ShareButton";

const SESSION_KEY = "shared-cast-state";

interface SearchResult { id: number; title?: string; name?: string; poster_path?: string | null; profile_path?: string | null; release_date?: string; }

interface PersonResult {
  id: number;
  name: string;
  profile_path: string | null;
  count: number;
  appearances: Record<string, string>; // movieId -> role
}

interface MovieResult {
  id: number;
  title: string;
  poster_path: string | null;
  release_date: string;
  mediaType?: string;
  count: number;
  appearances: Record<string, string>; // personId -> role
}

type Mode = "movies-to-people" | "people-to-movies";

export default function SharedCastPage() {
  const [mode, setMode] = useState<Mode>("movies-to-people");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<SearchResult[]>([]);
  const [minOverlap, setMinOverlap] = useState(2);
  const [personResults, setPersonResults] = useState<PersonResult[]>([]);
  const [movieResults, setMovieResults] = useState<MovieResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasResults, setHasResults] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Restore state from sessionStorage on mount (survives back navigation)
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (saved) {
        const { mode: m, selected: s, minOverlap: o } = JSON.parse(saved);
        if (m) setMode(m);
        if (s?.length) setSelected(s);
        if (o) setMinOverlap(o);
      }
    } catch { /* ignore */ }
    setHydrated(true);
  }, []);

  // Persist state to sessionStorage whenever it changes
  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ mode, selected, minOverlap }));
    } catch { /* ignore */ }
  }, [mode, selected, minOverlap, hydrated]);

  const maxSelected = mode === "movies-to-people" ? 4 : 6;

  // Live fetch whenever selected or minOverlap changes
  const fetchResults = useCallback(async (sel: SearchResult[], overlap: number, currentMode: Mode) => {
    if (sel.length < 2) {
      setHasResults(false);
      setPersonResults([]);
      setMovieResults([]);
      return;
    }
    // Abort previous request
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tools/shared-cast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: currentMode, ids: sel.map((s) => s.id), mediaTypes: sel.map((s) => (s as { media_type?: string }).media_type ?? "movie"), minOverlap: overlap }),
        signal: abortRef.current.signal,
      });
      if (!res.ok) {
        setError("Failed to fetch shared cast results. Please try again.");
        setPersonResults([]);
        setMovieResults([]);
        setHasResults(false);
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (currentMode === "movies-to-people") {
        setPersonResults(data.results ?? []);
        setMovieResults([]);
      } else {
        setMovieResults(data.results ?? []);
        setPersonResults([]);
      }
      setHasResults(true);
    } catch (e: unknown) {
      if ((e as Error).name !== "AbortError") {
        setError("Something went wrong. Please try again.");
        setPersonResults([]);
        setMovieResults([]);
        setHasResults(true);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    fetchResults(selected, minOverlap, mode);
  }, [selected, minOverlap, mode, fetchResults, hydrated]);

  async function handleSearch(q: string) {
    setQuery(q);
    if (q.length < 2) { setSearchResults([]); return; }
    try {
      if (mode === "movies-to-people") {
        // Search both movies and TV shows
        const [movieRes, showRes] = await Promise.all([
          fetch(`https://api.themoviedb.org/3/search/movie?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&query=${encodeURIComponent(q)}&include_adult=false`).then((r) => r.json()),
          fetch(`https://api.themoviedb.org/3/search/tv?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&query=${encodeURIComponent(q)}&include_adult=false`).then((r) => r.json()),
        ]);
        const movies = (movieRes.results ?? []).slice(0, 5).map((m: { id: number; title: string; poster_path: string | null; release_date?: string }) => ({ ...m, media_type: "movie" }));
        const shows = (showRes.results ?? []).slice(0, 5).map((s: { id: number; name: string; poster_path: string | null; first_air_date?: string }) => ({ ...s, title: s.name, release_date: s.first_air_date, media_type: "tv" }));
        setSearchResults([...movies, ...shows].slice(0, 8));
      } else {
        const res = await fetch(`https://api.themoviedb.org/3/search/person?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&query=${encodeURIComponent(q)}&include_adult=false`);
        if (!res.ok) { setSearchResults([]); return; }
        const data = await res.json();
        setSearchResults((data.results ?? []).slice(0, 8));
      }
    } catch {
      setSearchResults([]);
    }
  }

  function addItem(item: SearchResult) {
    if (selected.find((s) => s.id === item.id)) return;
    if (selected.length >= maxSelected) return;
    setSelected((s) => [...s, item]);
    setQuery("");
    setSearchResults([]);
  }

  function removeItem(id: number) {
    const newSel = selected.filter((i) => i.id !== id);
    setSelected(newSel);
    if (minOverlap > Math.max(2, newSel.length)) setMinOverlap(Math.max(2, newSel.length));
  }

  function switchMode(m: Mode) {
    setMode(m);
    setSelected([]);
    setMinOverlap(2);
    setHasResults(false);
    setPersonResults([]);
    setMovieResults([]);
  }

  const overlapOptions = selected.length >= 3 ? Array.from({ length: selected.length - 1 }, (_, i) => i + 2) : [];
  const results = mode === "movies-to-people" ? personResults : movieResults;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-2">
        <Users className="w-6 h-6 text-[var(--ratist-red)]" />
        <h1 className="text-2xl font-bold text-white">Shared Cast & Crew</h1>
      </div>
      <p className="text-[var(--foreground-muted)] mb-6">Discover connections between movies, TV shows, and the people who made them.</p>

      {/* Mode toggle */}
      <div className="flex gap-2 mb-6">
        {(["movies-to-people", "people-to-movies"] as const).map((m) => (
          <button
            key={m}
            onClick={() => switchMode(m)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${mode === m ? "bg-[var(--ratist-red)] text-white" : "bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"}`}
          >
            {m === "movies-to-people" ? "Movies & Shows → Find People" : "People → Find Movies & Shows"}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)]" />
        <input
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder={`Search for a ${mode === "movies-to-people" ? "movie or show" : "person"} to add (${selected.length}/${maxSelected})…`}
          disabled={selected.length >= maxSelected}
          className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] disabled:opacity-50"
        />
        {searchResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl z-10 overflow-hidden">
            {searchResults.map((r) => (
              <button key={r.id} onClick={() => addItem(r)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--surface-2)] transition-colors text-left">
                {(r.poster_path || r.profile_path) ? (
                  <Image src={posterUrl(r.poster_path ?? r.profile_path ?? null, "w92")} alt="" width={32} height={48} className="rounded w-8 h-12 object-cover shrink-0" />
                ) : <div className="w-8 h-12 rounded bg-[var(--surface-2)] shrink-0" />}
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm text-white">{r.title ?? r.name}</p>
                    {(r as { media_type?: string }).media_type === "tv" && (
                      <span className="text-[8px] font-bold text-blue-400 bg-blue-600/20 px-1 py-0.5 rounded leading-none">TV</span>
                    )}
                  </div>
                  {r.release_date && <p className="text-xs text-[var(--foreground-muted)]">{r.release_date.slice(0, 4)}</p>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {selected.map((item) => (
            <div key={item.id} className="flex items-center gap-2 bg-[var(--surface)] border border-[var(--ratist-red)] rounded-full px-3 py-1.5 text-sm text-white">
              {item.title ?? item.name}
              {(item as { media_type?: string }).media_type === "tv" && (
                <span className="text-[8px] font-bold text-blue-400 bg-blue-600/20 px-1 py-0.5 rounded leading-none">TV</span>
              )}
              <button onClick={() => removeItem(item.id)} className="text-[var(--foreground-muted)] hover:text-white"><X className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
      )}

      {/* Min overlap filter */}
      {overlapOptions.length > 0 && (
        <div className="flex items-center gap-3 mb-6 text-sm text-[var(--foreground-muted)] flex-wrap">
          <span>{mode === "movies-to-people" ? "Show people appearing in at least:" : "Show movies featuring at least:"}</span>
          {overlapOptions.map((n) => (
            <button key={n} onClick={() => setMinOverlap(n)} className={`px-3 py-1 rounded-full border text-xs transition-colors ${minOverlap === n ? "border-[var(--ratist-red)] text-white bg-[var(--ratist-red)]/10" : "border-[var(--border)] hover:border-[var(--ratist-red)] hover:text-white"}`}>
              {n} of {selected.length}
            </button>
          ))}
          <span>{mode === "movies-to-people" ? "selected movies/shows" : "of the selected people"}</span>
        </div>
      )}

      {/* Status / empty state */}
      {selected.length < 2 && (
        <p className="text-[var(--foreground-muted)] text-sm py-6">
          Add at least 2 {mode === "movies-to-people" ? "movies or shows" : "people"} to see shared connections.
        </p>
      )}

      {error && (
        <p className="text-red-400 text-sm py-4">{error}</p>
      )}

      {loading && selected.length >= 2 && (
        <p className="text-[var(--foreground-muted)] text-sm py-6">Searching…</p>
      )}

      {/* Results table */}
      {!loading && hasResults && selected.length >= 2 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-[var(--foreground-muted)]">
              {results.length} result{results.length !== 1 ? "s" : ""} found
              {results.length === 0 && " — try lowering the minimum overlap or selecting different entries"}
            </p>
            {results.length > 0 && (() => {
              const overlapText = minOverlap < selected.length ? ` (at least ${minOverlap} of ${selected.length})` : "";
              // Compute callout: who/what appears in ALL selected items
              let callout = "";
              if (mode === "movies-to-people") {
                const allMatch = personResults.filter((p) => p.count === selected.length);
                if (allMatch.length === 1) callout = `${allMatch[0].name} appeared in all ${selected.length}`;
                else if (allMatch.length >= 2 && allMatch.length <= 3) callout = `${allMatch.map((p) => p.name).join(", ")} appeared in all ${selected.length}`;
                else if (allMatch.length > 3) callout = `${allMatch.length} people appeared in all ${selected.length} films`;
              } else {
                const allMatch = movieResults.filter((m) => m.count === selected.length);
                if (allMatch.length === 1) callout = `${allMatch[0].title} features all ${selected.length}`;
                else if (allMatch.length >= 2 && allMatch.length <= 3) callout = `${allMatch.map((m) => m.title).join(", ")} feature all ${selected.length}`;
                else if (allMatch.length > 3) callout = `${allMatch.length} movies feature all ${selected.length} people`;
              }
              // Year range for people-to-movies
              let yearRange = "";
              if (mode === "people-to-movies" && movieResults.length > 0) {
                const years = movieResults.map((m) => parseInt(m.release_date?.slice(0, 4))).filter((y) => !isNaN(y)).sort();
                if (years.length > 1 && years[0] !== years[years.length - 1]) yearRange = `${years[0]}–${years[years.length - 1]}`;
              }
              return (
                <ShareButton
                  label="Share"
                  text={mode === "movies-to-people"
                    ? `${results.length} cast & crew member${results.length !== 1 ? "s" : ""} appearing in${overlapText} ${selected.map((s) => s.title ?? s.name).join(", ")} — found on The Ratist!`
                    : `${results.length} title${results.length !== 1 ? "s" : ""} featuring${overlapText} ${selected.map((s) => s.name ?? s.title).join(", ")} — found on The Ratist!`
                  }
                  url={`${process.env.NEXT_PUBLIC_SITE_URL ?? "https://theratist.com"}/tools/shared-cast`}
                  cardImageUrl={`/api/og/shared-cast?mode=${mode}&names=${encodeURIComponent(selected.map((s) => s.title ?? s.name ?? "").join("|"))}&ids=${selected.map((s) => s.id).join(",")}&count=${results.length}&overlap=${minOverlap}&total=${selected.length}${callout ? `&callout=${encodeURIComponent(callout)}` : ""}${yearRange ? `&years=${encodeURIComponent(yearRange)}` : ""}`}
                />
              );
            })()}
          </div>
          {results.length > 0 && (
            mode === "movies-to-people" ? (
              <PeopleTable results={personResults} selected={selected} />
            ) : (
              <MoviesTable results={movieResults} selected={selected} />
            )
          )}
        </div>
      )}
    </div>
  );
}

function PeopleTable({ results, selected }: { results: PersonResult[]; selected: SearchResult[] }) {
  return (
    <div className="overflow-auto max-h-[70vh] rounded-lg border border-[var(--border)]">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-[var(--border)]">
            <th className="sticky top-0 z-10 bg-[var(--background)] text-left py-3 pr-4 pl-3 text-[var(--foreground-muted)] font-medium min-w-[180px]">Person</th>
            {selected.map((movie) => (
              <th key={movie.id} className="sticky top-0 z-10 bg-[var(--background)] py-3 px-3 text-center text-[var(--foreground-muted)] font-medium max-w-[140px]">
                <Link href={`/movies/${movie.id}`} className="hover:text-[var(--ratist-red)] transition-colors block truncate text-xs text-[var(--foreground-muted)]">
                  {movie.title ?? movie.name}
                  {movie.release_date && <span className="block font-normal opacity-60">{movie.release_date.slice(0, 4)}</span>}
                </Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {results.map((person, i) => (
            <tr key={person.id} className={`border-b border-[var(--border)]/40 ${i % 2 === 0 ? "bg-[var(--surface)]/50" : ""}`}>
              <td className="py-3 pr-4 pl-3">
                <Link href={`/celebrities/${person.id}`} className="flex items-center gap-2 hover:text-[var(--ratist-red)] transition-colors group">
                  <div className="relative w-8 h-10 shrink-0 rounded overflow-hidden bg-[var(--surface-2)]">
                    {person.profile_path ? (
                      <Image src={posterUrl(person.profile_path, "w92")} alt={person.name} fill sizes="32px" className="object-cover object-top" />
                    ) : <span className="w-full h-full flex items-center justify-center text-sm">👤</span>}
                  </div>
                  <span className="text-white group-hover:text-[var(--ratist-red)] font-medium text-sm">{person.name}</span>
                </Link>
              </td>
              {selected.map((movie) => {
                const role = person.appearances[String(movie.id)];
                return (
                  <td key={movie.id} className="py-3 px-3 text-center">
                    {role ? (
                      <span className="inline-block px-2 py-0.5 rounded text-xs bg-green-900/40 text-green-300 border border-green-700/40">
                        {role}
                      </span>
                    ) : (
                      <span className="text-[var(--border)]">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MoviesTable({ results, selected }: { results: MovieResult[]; selected: SearchResult[] }) {
  return (
    <div className="overflow-auto max-h-[70vh] rounded-lg border border-[var(--border)]">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-[var(--border)]">
            <th className="sticky top-0 z-10 bg-[var(--background)] text-left py-3 pr-4 pl-3 text-[var(--foreground-muted)] font-medium min-w-[200px]">Title</th>
            {selected.map((person) => (
              <th key={person.id} className="sticky top-0 z-10 bg-[var(--background)] py-3 px-3 text-center text-[var(--foreground-muted)] font-medium max-w-[140px]">
                <Link href={`/celebrities/${person.id}`} className="hover:text-[var(--ratist-red)] transition-colors block truncate text-xs text-[var(--foreground-muted)]">
                  {person.name ?? person.title}
                </Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {results.map((movie, i) => (
            <tr key={movie.id} className={`border-b border-[var(--border)]/40 ${i % 2 === 0 ? "bg-[var(--surface)]/50" : ""}`}>
              <td className="py-3 pr-4 pl-3">
                <Link href={movie.mediaType === "tv" ? `/shows/${movie.id}` : `/movies/${movie.id}`} className="flex items-center gap-2 hover:text-[var(--ratist-red)] transition-colors group">
                  <div className="relative w-8 h-12 shrink-0 rounded overflow-hidden bg-[var(--surface-2)]">
                    {movie.poster_path ? (
                      <Image src={posterUrl(movie.poster_path, "w92")} alt={movie.title} fill sizes="32px" className="object-cover" />
                    ) : <span className="w-full h-full flex items-center justify-center text-xs">🎬</span>}
                  </div>
                  <div>
                    <span className="text-white group-hover:text-[var(--ratist-red)] font-medium text-sm block line-clamp-1">{movie.title}</span>
                    <span className="text-xs text-[var(--foreground-muted)] flex items-center gap-1">
                      {movie.mediaType === "tv" && (
                        <span className="inline-flex items-center gap-0.5 text-[8px] font-bold text-blue-400 bg-blue-600/20 px-1 py-0.5 rounded leading-none"><Tv className="w-2.5 h-2.5" />TV</span>
                      )}
                      {movie.release_date && movie.release_date.slice(0, 4)}
                    </span>
                  </div>
                </Link>
              </td>
              {selected.map((person) => {
                const role = movie.appearances[String(person.id)];
                return (
                  <td key={person.id} className="py-3 px-3 text-center">
                    {role ? (
                      <span className="inline-block px-2 py-0.5 rounded text-xs bg-green-900/40 text-green-300 border border-green-700/40">
                        {role}
                      </span>
                    ) : (
                      <span className="text-[var(--border)]">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
