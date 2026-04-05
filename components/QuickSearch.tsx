"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Film, Tv, User } from "lucide-react";
import { posterUrl } from "@/lib/tmdb";

interface QuickMovie { id: number; title: string; posterPath: string | null; year: string | null }
interface QuickShow { id: number; name: string; posterPath: string | null; year: string | null }
interface QuickPerson { id: number; name: string; profilePath: string | null; department: string }

const TMDB_PROFILE = "https://image.tmdb.org/t/p/w45";

export default function QuickSearch({ className, inputClassName, onNavigate }: { className?: string; inputClassName?: string; onNavigate?: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [movies, setMovies] = useState<QuickMovie[]>([]);
  const [shows, setShows] = useState<QuickShow[]>([]);
  const [people, setPeople] = useState<QuickPerson[]>([]);
  const [sectionOrder, setSectionOrder] = useState<string[]>(["movies", "shows", "people"]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Build a flat ordered list for keyboard navigation and rendering
  const orderedItems: { type: "movie" | "show" | "person"; index: number }[] = [];
  for (const section of sectionOrder) {
    if (section === "movies") movies.forEach((_, i) => orderedItems.push({ type: "movie", index: i }));
    else if (section === "shows") shows.forEach((_, i) => orderedItems.push({ type: "show", index: i }));
    else if (section === "people") people.forEach((_, i) => orderedItems.push({ type: "person", index: i }));
  }
  const totalResults = orderedItems.length;

  const fetchResults = useCallback(async (q: string) => {
    if (q.length < 2) { setMovies([]); setShows([]); setPeople([]); setOpen(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/search/quick?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setMovies(data.movies ?? []);
        setShows(data.shows ?? []);
        setPeople(data.people ?? []);
        setSectionOrder(data.sectionOrder ?? ["movies", "shows", "people"]);
        setOpen(true);
        setSelectedIdx(-1);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fetchResults(val.trim()), 250);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    setQuery("");
    onNavigate?.();
  }

  function navigate(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
    onNavigate?.();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || totalResults === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((prev) => (prev + 1) % (totalResults + 1)); // +1 for "View all"
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((prev) => (prev - 1 + totalResults + 1) % (totalResults + 1));
    } else if (e.key === "Enter" && selectedIdx >= 0) {
      e.preventDefault();
      if (selectedIdx < totalResults) {
        const item = orderedItems[selectedIdx];
        if (item.type === "movie") navigate(`/movies/${movies[item.index].id}`);
        else if (item.type === "show") navigate(`/shows/${shows[item.index].id}`);
        else navigate(`/celebrities/${people[item.index].id}`);
      } else {
        navigate(`/search?q=${encodeURIComponent(query.trim())}`);
        setQuery("");
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <form onSubmit={handleSubmit}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)]" />
          <input
            type="text"
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={() => { if (totalResults > 0 && query.length >= 2) setOpen(true); }}
            placeholder="Search movies, shows & people..."
            className={inputClassName ?? "bg-[var(--surface-2)] border border-[var(--border)] rounded-full pl-9 pr-4 py-1.5 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] w-44 lg:w-60 transition-all"}
          />
        </div>
      </form>

      {/* Dropdown */}
      {open && totalResults > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl overflow-hidden z-50 min-w-[280px]">
          {(() => {
            let flatIdx = 0;
            let isFirstSection = true;
            return sectionOrder.map((section) => {
              if (section === "movies" && movies.length > 0) {
                const startIdx = flatIdx;
                flatIdx += movies.length;
                const border = !isFirstSection;
                isFirstSection = false;
                return (
                  <div key="movies" className={border ? "border-t border-[var(--border)]" : ""}>
                    <p className="px-3 pt-2.5 pb-1 text-[10px] text-[var(--foreground-muted)] uppercase tracking-wider font-medium flex items-center gap-1">
                      <Film className="w-3 h-3" /> Movies
                    </p>
                    {movies.map((m, i) => (
                      <button key={m.id} onClick={() => navigate(`/movies/${m.id}`)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${selectedIdx === startIdx + i ? "bg-[var(--surface-2)]" : "hover:bg-[var(--surface-2)]"}`}>
                        <div className="relative w-8 h-12 rounded overflow-hidden bg-[var(--surface-2)] shrink-0">
                          {m.posterPath ? <Image src={posterUrl(m.posterPath, "w92")} alt="" fill sizes="32px" className="object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[8px] text-[var(--foreground-muted)]">?</div>}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm text-white truncate">{m.title}</p>
                          {m.year && <p className="text-xs text-[var(--foreground-muted)]">{m.year}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                );
              }
              if (section === "shows" && shows.length > 0) {
                const startIdx = flatIdx;
                flatIdx += shows.length;
                const border = !isFirstSection;
                isFirstSection = false;
                return (
                  <div key="shows" className={border ? "border-t border-[var(--border)]" : ""}>
                    <p className="px-3 pt-2.5 pb-1 text-[10px] text-blue-400 uppercase tracking-wider font-medium flex items-center gap-1">
                      <Tv className="w-3 h-3" /> TV Shows
                    </p>
                    {shows.map((s, i) => (
                      <button key={s.id} onClick={() => navigate(`/shows/${s.id}`)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${selectedIdx === startIdx + i ? "bg-[var(--surface-2)]" : "hover:bg-[var(--surface-2)]"}`}>
                        <div className="relative w-8 h-12 rounded overflow-hidden bg-[var(--surface-2)] shrink-0">
                          {s.posterPath ? <Image src={posterUrl(s.posterPath, "w92")} alt="" fill sizes="32px" className="object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[8px] text-[var(--foreground-muted)]">?</div>}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm text-white truncate">{s.name}</p>
                          {s.year && <p className="text-xs text-[var(--foreground-muted)]">{s.year}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                );
              }
              if (section === "people" && people.length > 0) {
                const startIdx = flatIdx;
                flatIdx += people.length;
                const border = !isFirstSection;
                isFirstSection = false;
                return (
                  <div key="people" className={border ? "border-t border-[var(--border)]" : ""}>
                    <p className="px-3 pt-2.5 pb-1 text-[10px] text-[var(--foreground-muted)] uppercase tracking-wider font-medium flex items-center gap-1">
                      <User className="w-3 h-3" /> People
                    </p>
                    {people.map((p, i) => (
                      <button key={p.id} onClick={() => navigate(`/celebrities/${p.id}`)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${selectedIdx === startIdx + i ? "bg-[var(--surface-2)]" : "hover:bg-[var(--surface-2)]"}`}>
                        <div className="relative w-8 h-8 rounded-full overflow-hidden bg-[var(--surface-2)] shrink-0">
                          {p.profilePath ? <Image src={`${TMDB_PROFILE}${p.profilePath}`} alt="" fill sizes="32px" className="object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xs text-[var(--foreground-muted)]">{p.name[0]}</div>}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm text-white truncate">{p.name}</p>
                          <p className="text-xs text-[var(--foreground-muted)]">{p.department}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                );
              }
              return null;
            });
          })()}

          {/* View all */}
          <button
            onClick={() => { navigate(`/search?q=${encodeURIComponent(query.trim())}`); setQuery(""); }}
            className={`w-full px-3 py-2.5 text-xs text-center border-t border-[var(--border)] transition-colors ${
              selectedIdx === totalResults ? "bg-[var(--surface-2)] text-white" : "text-[var(--ratist-red)] hover:bg-[var(--surface-2)]"
            }`}
          >
            View all results for &quot;{query.trim()}&quot;
          </button>
        </div>
      )}

      {/* Loading indicator */}
      {loading && query.length >= 2 && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl z-50 px-4 py-3 min-w-[280px]">
          <p className="text-xs text-[var(--foreground-muted)] text-center">Searching...</p>
        </div>
      )}
    </div>
  );
}
