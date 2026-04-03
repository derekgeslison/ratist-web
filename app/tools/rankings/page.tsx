"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { GripVertical, Star, ChevronUp, ChevronDown, Plus, Search, X, Trash2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { posterUrl } from "@/lib/tmdb";
import ShareButton from "@/components/ShareButton";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface RankedMovie {
  id: string;
  tmdbId: number;
  title: string;
  posterPath: string | null;
  year: string;
  ratistRating: number | null;
  rank: number;
}

interface CustomList {
  id: string;
  name: string;
  listKey: string;
  movieCount: number;
}

const CURRENT_YEAR = new Date().getFullYear();
const PRESET_YEARS = Array.from({ length: CURRENT_YEAR - 2023 + 1 }, (_, i) => String(CURRENT_YEAR - i));

function SortableItem({
  movie,
  index,
  total,
  onMoveTo,
}: {
  movie: RankedMovie;
  index: number;
  total: number;
  onMoveTo: (from: number, to: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: movie.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const [inputVal, setInputVal] = useState("");

  function handleMoveSubmit(e: React.FormEvent) {
    e.preventDefault();
    const num = parseInt(inputVal, 10);
    if (!isNaN(num) && num >= 1 && num <= total) {
      onMoveTo(index, num - 1);
      setInputVal("");
    }
  }

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 sm:gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 hover:border-[var(--ratist-red)]/50 transition-colors">
      <span className="text-lg sm:text-xl font-bold text-[var(--foreground-muted)] w-7 sm:w-8 text-center shrink-0">{index + 1}</span>

      <div className="flex flex-col shrink-0">
        <button onClick={() => index > 0 && onMoveTo(index, index - 1)} disabled={index === 0}
          className="text-[var(--foreground-muted)] hover:text-white disabled:opacity-20 transition-colors p-0.5" aria-label="Move up">
          <ChevronUp className="w-4 h-4" />
        </button>
        <button onClick={() => index < total - 1 && onMoveTo(index, index + 1)} disabled={index === total - 1}
          className="text-[var(--foreground-muted)] hover:text-white disabled:opacity-20 transition-colors p-0.5" aria-label="Move down">
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      <button {...attributes} {...listeners} className="hidden sm:block text-[var(--foreground-muted)] hover:text-white cursor-grab active:cursor-grabbing shrink-0 touch-none">
        <GripVertical className="w-5 h-5" />
      </button>

      <div className="relative w-10 h-14 shrink-0 rounded overflow-hidden bg-[var(--surface-2)]">
        {movie.posterPath ? (
          <Image src={posterUrl(movie.posterPath, "w92")} alt={movie.title} fill sizes="40px" className="object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-[var(--foreground-muted)]">?</div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <Link href={`/movies/${movie.tmdbId}`} className="text-sm font-medium text-white hover:text-[var(--ratist-red)] truncate block">{movie.title}</Link>
        <p className="text-xs text-[var(--foreground-muted)]">{movie.year}</p>
      </div>

      {movie.ratistRating != null && (
        <span className="text-sm font-bold text-[var(--ratist-red)] shrink-0">{movie.ratistRating.toFixed(1)}</span>
      )}

      <form onSubmit={handleMoveSubmit} className="hidden sm:flex items-center gap-1 shrink-0">
        <input value={inputVal} onChange={(e) => setInputVal(e.target.value)} placeholder="#"
          className="w-10 bg-[var(--surface-2)] border border-[var(--border)] rounded px-1.5 py-1 text-xs text-white text-center focus:outline-none focus:border-[var(--ratist-red)]" />
      </form>
    </div>
  );
}

export default function RankingsPage() {
  const { user } = useAuth();
  const [movies, setMovies] = useState<RankedMovie[]>([]);
  const [filter, setFilter] = useState<"all" | string>(String(CURRENT_YEAR));
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(50);

  // Custom lists
  const [customLists, setCustomLists] = useState<CustomList[]>([]);
  const [showCreateList, setShowCreateList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [creatingList, setCreatingList] = useState(false);

  // Add movie search (for custom lists)
  const [addMovieQuery, setAddMovieQuery] = useState("");
  const [addMovieResults, setAddMovieResults] = useState<{ id: number; title: string; posterPath: string | null; releaseDate: string }[]>([]);
  const [addingMovie, setAddingMovie] = useState<number | null>(null);

  const isCustomList = filter.startsWith("custom-");
  const activeCustomList = customLists.find((l) => l.listKey === filter);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Fetch movies
  useEffect(() => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    user.getIdToken().then((token) => {
      fetch(`/api/tools/rankings?filter=${filter}`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((data) => { setMovies(data.movies ?? []); setVisibleCount(50); setLoading(false); })
        .catch(() => setLoading(false));
    });
  }, [user, filter]);

  // Fetch custom lists
  useEffect(() => {
    if (!user) return;
    user.getIdToken().then((token) => {
      fetch("/api/tools/rankings/lists", { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then(setCustomLists)
        .catch(() => {});
    });
  }, [user]);

  // Add movie search
  useEffect(() => {
    if (addMovieQuery.length < 2) { setAddMovieResults([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/tmdb/movie/search?q=${encodeURIComponent(addMovieQuery)}`);
      const data = await res.json();
      setAddMovieResults(data.results ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [addMovieQuery]);

  async function saveRankings(newMovies: RankedMovie[]) {
    if (!user) return;
    const token = await user.getIdToken();
    const listKey = filter === "all" ? "all-time" : filter;
    fetch("/api/tools/rankings", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ listKey, movieIds: newMovies.map((m) => m.id) }),
    }).catch(() => {});
  }

  async function createCustomList() {
    if (!user || !newListName.trim() || creatingList) return;
    setCreatingList(true);
    const token = await user.getIdToken();
    const res = await fetch("/api/tools/rankings/lists", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: newListName.trim() }),
    });
    if (res.ok) {
      const list = await res.json();
      setCustomLists((prev) => [{ ...list, movieCount: 0 }, ...prev]);
      setFilter(list.listKey);
      setNewListName("");
      setShowCreateList(false);
    }
    setCreatingList(false);
  }

  async function deleteCustomList() {
    if (!user || !activeCustomList) return;
    if (!confirm(`Delete "${activeCustomList.name}"? This cannot be undone.`)) return;
    const token = await user.getIdToken();
    await fetch(`/api/tools/rankings/lists/${activeCustomList.listKey}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setCustomLists((prev) => prev.filter((l) => l.listKey !== filter));
    setFilter(String(CURRENT_YEAR));
  }

  async function addMovieToRanking(m: { id: number; title: string; posterPath: string | null; releaseDate: string }) {
    if (!user || !isCustomList || addingMovie) return;
    setAddingMovie(m.id);
    const token = await user.getIdToken();
    await fetch(`/api/tools/rankings/lists/${filter}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ tmdbId: m.id, title: m.title, posterPath: m.posterPath, releaseDate: m.releaseDate }),
    });
    setAddingMovie(null);
    setAddMovieQuery("");
    setAddMovieResults([]);
    // Refresh
    const token2 = await user.getIdToken();
    const res2 = await fetch(`/api/tools/rankings?filter=${filter}`, { headers: { Authorization: `Bearer ${token2}` } });
    const data2 = await res2.json();
    setMovies(data2.movies ?? []);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setMovies((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        const reordered = arrayMove(items, oldIndex, newIndex);
        saveRankings(reordered);
        return reordered;
      });
    }
  }

  function handleMoveTo(fromIndex: number, toIndex: number) {
    setMovies((items) => {
      const reordered = arrayMove(items, fromIndex, toIndex);
      saveRankings(reordered);
      return reordered;
    });
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-3">
          <Star className="w-6 h-6 text-[var(--ratist-red)]" />
          <h1 className="text-2xl font-bold text-white">Personal Rankings</h1>
        </div>
        {movies.length >= 1 && user && (
          <ShareButton
            label={isCustomList ? `Share ${activeCustomList?.name}` : filter === "all" ? "Share rankings" : `Share ${filter} rankings`}
            text={`Check out my ${isCustomList ? activeCustomList?.name : filter === "all" ? "all-time" : filter} top movies on The Ratist!\n\nTop picks: ${movies.slice(0, 3).map((m) => m.title).join(", ")}${movies.length > 3 ? "..." : ""}`}
            url={`${process.env.NEXT_PUBLIC_SITE_URL ?? "https://theratist.com"}/profile/${user.uid}/rankings/${filter === "all" ? "all-time" : filter}`}
            cardImageUrl={`/api/og/rankings?userId=${encodeURIComponent(user.uid)}${filter !== "all" ? `&year=${filter}` : ""}`}
          />
        )}
      </div>
      <p className="text-[var(--foreground-muted)] mb-6">Drag to reorder, or type a number to move a movie to a specific rank.</p>

      {!user ? (
        <div className="text-center py-20 text-[var(--foreground-muted)]">
          <Link href="/auth/signin" className="text-[var(--ratist-red)] hover:underline">Sign in</Link> to see and rank your movies.
        </div>
      ) : (
        <>
          {/* Standard list tabs */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {PRESET_YEARS.map((year) => (
              <button key={year} onClick={() => setFilter(year)} className={`px-3 py-1.5 rounded-full text-sm transition-colors ${filter === year ? "bg-[var(--ratist-red)] text-white" : "bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"}`}>{year}</button>
            ))}
            <button onClick={() => setFilter("all")} className={`px-3 py-1.5 rounded-full text-sm transition-colors ${filter === "all" ? "bg-[var(--ratist-red)] text-white" : "bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"}`}>All Time</button>
          </div>

          {/* Custom list tabs */}
          {(customLists.length > 0 || showCreateList) && (
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <span className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wider mr-1">Custom:</span>
              {customLists.map((list) => (
                <button key={list.listKey} onClick={() => setFilter(list.listKey)}
                  className={`px-3 py-1.5 rounded-full text-sm transition-colors ${filter === list.listKey ? "bg-purple-600 text-white" : "bg-[var(--surface)] border border-purple-500/30 text-purple-400 hover:text-white"}`}>
                  {list.name} ({list.movieCount})
                </button>
              ))}
            </div>
          )}

          {/* Create custom list */}
          <div className="flex items-center gap-2 mb-6">
            {!showCreateList ? (
              <button onClick={() => setShowCreateList(true)}
                className="flex items-center gap-1.5 text-xs text-[var(--foreground-muted)] hover:text-white transition-colors">
                <Plus className="w-3.5 h-3.5" /> Create Custom List
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <input value={newListName} onChange={(e) => setNewListName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createCustomList()}
                  placeholder="List name..."
                  autoFocus
                  className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-purple-500" />
                <button onClick={createCustomList} disabled={creatingList || !newListName.trim()}
                  className="text-xs bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50">Create</button>
                <button onClick={() => { setShowCreateList(false); setNewListName(""); }}
                  className="text-xs text-[var(--foreground-muted)] hover:text-white">Cancel</button>
              </div>
            )}

            {/* Delete custom list */}
            {isCustomList && activeCustomList && (
              <button onClick={deleteCustomList}
                className="flex items-center gap-1 text-xs text-[var(--foreground-muted)] hover:text-red-400 transition-colors ml-auto">
                <Trash2 className="w-3 h-3" /> Delete List
              </button>
            )}
          </div>

          {/* Add movie search (custom lists only) */}
          {isCustomList && (
            <div className="relative mb-4">
              <div className="flex items-center gap-2 bg-[var(--surface)] border border-purple-500/30 rounded-xl px-3 py-2">
                <Search className="w-4 h-4 text-purple-400" />
                <input value={addMovieQuery} onChange={(e) => setAddMovieQuery(e.target.value)}
                  placeholder="Search to add a movie to this list..."
                  className="flex-1 bg-transparent text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none" />
                {addMovieQuery && <button onClick={() => { setAddMovieQuery(""); setAddMovieResults([]); }}><X className="w-4 h-4 text-[var(--foreground-muted)]" /></button>}
              </div>
              {addMovieResults.length > 0 && (
                <div className="absolute z-20 mt-1 w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl max-h-48 overflow-y-auto">
                  {addMovieResults.map((m) => {
                    const alreadyIn = movies.some((mv) => mv.tmdbId === m.id);
                    return (
                      <button key={m.id} onClick={() => !alreadyIn && addMovieToRanking(m)}
                        disabled={alreadyIn || addingMovie === m.id}
                        className={`flex items-center gap-3 w-full px-3 py-2 text-left ${alreadyIn ? "opacity-40" : "hover:bg-[var(--surface-2)]"}`}>
                        <div className="w-8 h-12 rounded overflow-hidden bg-[var(--surface-2)] flex-shrink-0">
                          {m.posterPath && <Image src={posterUrl(m.posterPath, "w92")} alt={m.title} width={32} height={48} className="object-cover w-full h-full" />}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm text-white">{m.title}</p>
                          <p className="text-xs text-[var(--foreground-muted)]">{m.releaseDate?.slice(0, 4)}</p>
                        </div>
                        {alreadyIn && <span className="text-[9px] text-[var(--foreground-muted)]">Already in list</span>}
                        {addingMovie === m.id && <span className="text-[9px] text-purple-400">Adding...</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {loading ? (
            <p className="text-[var(--foreground-muted)] text-center py-10">Loading your movies...</p>
          ) : movies.length === 0 ? (
            <p className="text-[var(--foreground-muted)] text-center py-10">
              {isCustomList ? "No movies in this list yet. Use the search above to add some!" : <>No movies found for this filter. <Link href="/movies" className="text-[var(--ratist-red)] hover:underline">Rate or mark movies as seen.</Link></>}
            </p>
          ) : (() => {
            const visible = movies.slice(0, visibleCount);
            const hasMore = movies.length > visibleCount;
            return (
              <>
                <DndContext key={filter} sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={visible.map((m) => m.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {visible.map((movie, index) => (
                        <SortableItem key={movie.id} movie={movie} index={index} total={movies.length} onMoveTo={handleMoveTo} />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
                {hasMore && (
                  <div className="text-center mt-6">
                    <button onClick={() => setVisibleCount((v) => v + 50)}
                      className="px-6 py-2 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-sm text-[var(--foreground-muted)] hover:text-white hover:border-[var(--ratist-red)] transition-colors">
                      Show more ({movies.length - visibleCount} remaining)
                    </button>
                  </div>
                )}
              </>
            );
          })()}
        </>
      )}
    </div>
  );
}
