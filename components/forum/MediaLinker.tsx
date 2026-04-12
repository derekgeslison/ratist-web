"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Image from "next/image";
import { Search, X, Film, Tv } from "lucide-react";
// Film and Tv icons used for selected chips and search result badges

interface MediaItem {
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string | null;
}

interface Props {
  selected: MediaItem[];
  onChange: (items: MediaItem[]) => void;
  max?: number;
}

interface SearchResult {
  id: number;
  title?: string;
  name?: string;
  posterPath: string | null;
  releaseDate?: string;
}

export default function MediaLinker({ selected, onChange, max = 4 }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<(SearchResult & { mediaType: "movie" | "tv" })[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const search = useCallback(async (q: string, p = 1) => {
    if (q.length < 2) { setResults([]); setHasMore(false); return; }
    setSearching(true);
    try {
      const [movieRes, tvRes] = await Promise.all([
        fetch(`/api/tmdb/movie/search?q=${encodeURIComponent(q)}&page=${p}`).then((r) => r.json()),
        fetch(`/api/tmdb/tv/search?q=${encodeURIComponent(q)}&page=${p}`).then((r) => r.json()),
      ]);
      const movies = (movieRes.results ?? []).map((r: SearchResult) => ({ ...r, mediaType: "movie" as const }));
      const shows = (tvRes.results ?? []).map((r: SearchResult) => ({ ...r, mediaType: "tv" as const }));
      const newResults = [...movies, ...shows];
      setResults(p === 1 ? newResults : (prev) => [...prev, ...newResults]);
      setPage(p);
      setHasMore(p < (movieRes.totalPages ?? 1) || p < (tvRes.totalPages ?? 1));
    } catch {
      setResults([]);
    }
    setSearching(false);
  }, []);

  function handleInput(q: string) {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(q), 300);
  }

  function addItem(r: SearchResult & { mediaType: "movie" | "tv" }) {
    if (selected.length >= max) return;
    if (selected.some((s) => s.tmdbId === r.id && s.mediaType === r.mediaType)) return;
    onChange([...selected, {
      tmdbId: r.id,
      mediaType: r.mediaType,
      title: r.title ?? r.name ?? "Unknown",
      posterPath: r.posterPath,
    }]);
    setQuery("");
    setResults([]);
    setShowDropdown(false);
  }

  function removeItem(tmdbId: number, mediaType: string) {
    onChange(selected.filter((s) => !(s.tmdbId === tmdbId && s.mediaType === mediaType)));
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setShowDropdown(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-sm font-medium text-[var(--foreground-muted)] mb-1.5">
        Link Movies / TV Shows <span className="text-xs opacity-60">(optional, max {max})</span>
      </label>

      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {selected.map((s) => (
            <div key={`${s.mediaType}-${s.tmdbId}`} className="flex items-center gap-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2 py-1">
              {s.posterPath && (
                <div className="relative w-6 h-9 rounded overflow-hidden shrink-0">
                  <Image src={`https://image.tmdb.org/t/p/w92${s.posterPath}`} alt="" fill sizes="24px" className="object-cover" />
                </div>
              )}
              {s.mediaType === "tv" && <Tv className="w-3 h-3 text-blue-400 shrink-0" />}
              <span className="text-xs text-white truncate max-w-[120px]">{s.title}</span>
              <button onClick={() => removeItem(s.tmdbId, s.mediaType)} className="text-[var(--foreground-muted)] hover:text-white"><X className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
      )}

      {/* Search input */}
      {selected.length < max && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)]" />
          <input
            type="text"
            value={query}
            onChange={(e) => { handleInput(e.target.value); setShowDropdown(true); }}
            onFocus={() => results.length > 0 && setShowDropdown(true)}
            placeholder="Search movies or TV shows..."
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
          />
        </div>
      )}

      {/* Dropdown */}
      {showDropdown && results.length > 0 && (
        <div className="absolute z-20 w-full mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {results.map((r) => (
            <button
              key={`${r.mediaType}-${r.id}`}
              onClick={() => addItem(r)}
              className="flex items-center gap-3 w-full px-3 py-2 text-left hover:bg-[var(--surface-2)] transition-colors"
            >
              {r.posterPath ? (
                <div className="relative w-8 h-12 rounded overflow-hidden shrink-0">
                  <Image src={`https://image.tmdb.org/t/p/w92${r.posterPath}`} alt="" fill sizes="32px" className="object-cover" />
                </div>
              ) : (
                <div className="w-8 h-12 rounded bg-[var(--surface-2)] shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {r.mediaType === "tv" && <Tv className="w-3 h-3 text-blue-400 shrink-0" />}
                  <p className="text-sm text-white truncate">{r.title ?? r.name}</p>
                  {r.releaseDate && <span className="text-xs text-[var(--foreground-muted)] shrink-0">({r.releaseDate.slice(0, 4)})</span>}
                </div>
              </div>
            </button>
          ))}
          {hasMore && (
            <button onClick={() => search(query, page + 1)} className="w-full text-center py-2 text-xs text-[var(--foreground-muted)] hover:text-white transition-colors border-t border-[var(--border)]">
              Load more results...
            </button>
          )}
        </div>
      )}
      {showDropdown && searching && <p className="text-xs text-[var(--foreground-muted)] mt-1">Searching...</p>}
    </div>
  );
}
