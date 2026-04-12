"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Image from "next/image";
import { Search, X } from "lucide-react";

interface PersonItem {
  tmdbId: number;
  name: string;
  profilePath: string | null;
}

interface Props {
  selected: PersonItem[];
  onChange: (items: PersonItem[]) => void;
  max?: number;
}

export default function PersonLinker({ selected, onChange, max = 4 }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PersonItem[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const search = useCallback(async (q: string, p = 1) => {
    if (q.length < 2) { setResults([]); setHasMore(false); return; }
    try {
      const res = await fetch(`/api/tmdb/person?q=${encodeURIComponent(q)}&page=${p}`);
      const data = await res.json();
      const newResults = (data.results ?? []).map((r: { id: number; name: string; profilePath: string | null }) => ({
        tmdbId: r.id, name: r.name, profilePath: r.profilePath,
      }));
      setResults(p === 1 ? newResults : (prev) => [...prev, ...newResults]);
      setPage(p);
      setHasMore(p < (data.totalPages ?? 1));
    } catch {
      setResults([]);
    }
  }, []);

  function handleInput(q: string) {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(q), 300);
  }

  function addPerson(p: PersonItem) {
    if (selected.length >= max) return;
    if (selected.some((s) => s.tmdbId === p.tmdbId)) return;
    onChange([...selected, p]);
    setQuery("");
    setResults([]);
    setShowDropdown(false);
  }

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
        Link Actors / Directors <span className="text-xs opacity-60">(optional, max {max})</span>
      </label>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {selected.map((p) => (
            <div key={p.tmdbId} className="flex items-center gap-1.5 bg-[var(--surface)] border border-[var(--border)] rounded-full px-2.5 py-1">
              {p.profilePath ? (
                <div className="relative w-5 h-5 rounded-full overflow-hidden shrink-0">
                  <Image src={`https://image.tmdb.org/t/p/w45${p.profilePath}`} alt="" fill sizes="20px" className="object-cover" />
                </div>
              ) : (
                <div className="w-5 h-5 rounded-full bg-[var(--surface-2)] flex items-center justify-center text-[8px] font-bold text-white shrink-0">
                  {p.name[0]}
                </div>
              )}
              <span className="text-xs text-white">{p.name}</span>
              <button onClick={() => onChange(selected.filter((s) => s.tmdbId !== p.tmdbId))} className="text-[var(--foreground-muted)] hover:text-white"><X className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
      )}

      {selected.length < max && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)]" />
          <input
            type="text"
            value={query}
            onChange={(e) => { handleInput(e.target.value); setShowDropdown(true); }}
            onFocus={() => results.length > 0 && setShowDropdown(true)}
            placeholder="Search actors or directors..."
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
          />
        </div>
      )}

      {showDropdown && results.length > 0 && (
        <div className="absolute z-20 w-full mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {results.map((p) => (
            <button
              key={p.tmdbId}
              onClick={() => addPerson(p)}
              className="flex items-center gap-3 w-full px-3 py-2 text-left hover:bg-[var(--surface-2)] transition-colors"
            >
              {p.profilePath ? (
                <div className="relative w-8 h-8 rounded-full overflow-hidden shrink-0">
                  <Image src={`https://image.tmdb.org/t/p/w45${p.profilePath}`} alt="" fill sizes="32px" className="object-cover" />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-full bg-[var(--surface-2)] flex items-center justify-center text-xs font-bold text-white shrink-0">{p.name[0]}</div>
              )}
              <span className="text-sm text-white">{p.name}</span>
            </button>
          ))}
          {hasMore && (
            <button onClick={() => search(query, page + 1)} className="w-full text-center py-2 text-xs text-[var(--foreground-muted)] hover:text-white transition-colors border-t border-[var(--border)]">
              Load more results...
            </button>
          )}
        </div>
      )}
    </div>
  );
}
