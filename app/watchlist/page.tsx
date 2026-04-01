"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Bookmark, Search, X, Plus, Check, ChevronDown, Lock, Globe,
  ArrowUpDown, Pencil, Trash2, SlidersHorizontal, ListPlus,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { posterUrl } from "@/lib/tmdb";
import RatingBadge from "@/components/RatingBadge";

/* ── Types ── */
interface WatchlistMeta {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isDefault: boolean;
  isPrivate: boolean;
  movieCount: number;
  previewPosters: (string | null)[];
  isOwner: boolean;
  createdAt: string;
}

interface WatchlistMovie {
  id: string;
  tmdbId: number;
  title: string;
  posterPath: string | null;
  year: string;
  voteAverage: number | null;
  ratistRating: number | null;
  estimatedRating: number | null;
  genres: string[];
  isChecked: boolean;
  checkedAt: string | null;
  addedAt: string;
  sortOrder: number;
}

type SortKey = "added" | "title" | "year" | "rating" | "community";
type SeenFilter = "all" | "checked" | "unchecked";

export default function WatchlistPage() {
  const { user } = useAuth();

  /* ── Data state ── */
  const [watchlists, setWatchlists] = useState<WatchlistMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [movies, setMovies] = useState<WatchlistMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMovies, setLoadingMovies] = useState(false);

  /* ── Filter / sort state ── */
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("added");
  const [sortAsc, setSortAsc] = useState(false);
  const [seenFilter, setSeenFilter] = useState<SeenFilter>("all");
  const [genreFilter, setGenreFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  /* ── UI state ── */
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPrivate, setNewPrivate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingList, setEditingList] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editPrivate, setEditPrivate] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [listPickerMovie, setListPickerMovie] = useState<WatchlistMovie | null>(null);
  const [movieLists, setMovieLists] = useState<{ id: string; name: string; isDefault: boolean; hasMovie: boolean }[]>([]);
  const [togglingListId, setTogglingListId] = useState<string | null>(null);

  const activeList = watchlists.find((w) => w.id === activeId) ?? null;

  /* ── Helpers ── */
  const getToken = useCallback(async () => {
    if (!user) return null;
    return user.getIdToken();
  }, [user]);

  /* ── Load watchlists ── */
  useEffect(() => {
    if (!user) { setLoading(false); return; }
    (async () => {
      const token = await getToken();
      if (!token) return;
      const res = await fetch("/api/watchlist", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setWatchlists(data.watchlists ?? []);
      setMovies(data.defaultMovies ?? []);
      const def = (data.watchlists ?? []).find((w: WatchlistMeta) => w.isDefault);
      if (def) setActiveId(def.id);
      setLoading(false);
    })();
  }, [user, getToken]);

  /* ── Load movies when switching lists ── */
  async function loadList(id: string) {
    if (id === activeId) return;
    setActiveId(id);
    setLoadingMovies(true);
    setQuery("");
    setSeenFilter("all");
    setGenreFilter("");
    const token = await getToken();
    if (!token) return;
    const res = await fetch(`/api/watchlist/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    setMovies(data.movies ?? []);
    setLoadingMovies(false);
  }

  /* ── Create watchlist ── */
  async function createWatchlist() {
    if (!newName.trim() || creating) return;
    setCreating(true);
    const token = await getToken();
    if (!token) return;
    const res = await fetch("/api/watchlist", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || null, isPrivate: newPrivate }),
    });
    const data = await res.json();
    if (data.watchlist) {
      setWatchlists((prev) => [...prev, data.watchlist]);
      setActiveId(data.watchlist.id);
      setMovies([]);
    }
    setNewName("");
    setNewDesc("");
    setNewPrivate(false);
    setShowCreate(false);
    setCreating(false);
  }

  /* ── Edit watchlist ── */
  async function saveEdit() {
    if (!activeId) return;
    const token = await getToken();
    if (!token) return;
    await fetch(`/api/watchlist/${activeId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim(), description: editDesc.trim() || null, isPrivate: editPrivate }),
    });
    setWatchlists((prev) => prev.map((w) => w.id === activeId ? { ...w, name: editName.trim(), description: editDesc.trim() || null, isPrivate: editPrivate } : w));
    setEditingList(false);
  }

  /* ── Delete watchlist ── */
  async function deleteWatchlist() {
    if (!activeId) return;
    const token = await getToken();
    if (!token) return;
    await fetch(`/api/watchlist/${activeId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    setWatchlists((prev) => prev.filter((w) => w.id !== activeId));
    const def = watchlists.find((w) => w.isDefault);
    if (def) { setActiveId(def.id); loadList(def.id); }
    setShowDeleteConfirm(false);
  }

  /* ── Remove movie ── */
  async function confirmRemove(movie: WatchlistMovie) {
    if (!activeId) return;
    setConfirmingRemove(null);
    setRemoving((prev) => new Set(prev).add(movie.id));
    const token = await getToken();
    if (!token) return;
    const res = await fetch(`/api/watchlist/${activeId}/movies/${movie.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setMovies((prev) => prev.filter((m) => m.id !== movie.id));
      setWatchlists((prev) => prev.map((w) => w.id === activeId ? { ...w, movieCount: w.movieCount - 1 } : w));
    }
    setRemoving((prev) => { const s = new Set(prev); s.delete(movie.id); return s; });
  }

  /* ── Toggle check-off ── */
  async function toggleCheck(movie: WatchlistMovie) {
    if (!activeId) return;
    const token = await getToken();
    if (!token) return;
    const res = await fetch(`/api/watchlist/${activeId}/movies/${movie.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setMovies((prev) => prev.map((m) => m.id === movie.id ? { ...m, isChecked: data.isChecked, checkedAt: data.checkedAt } : m));
    }
  }

  /* ── List picker for adding movie to other lists ── */
  async function openListPicker(movie: WatchlistMovie) {
    setListPickerMovie(movie);
    const token = await getToken();
    if (!token) return;
    const res = await fetch(`/api/movies/${movie.tmdbId}/watchlist`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    setMovieLists(data.lists ?? []);
  }

  async function toggleMovieList(listId: string) {
    if (!listPickerMovie) return;
    setTogglingListId(listId);
    const token = await getToken();
    if (!token) return;
    const list = movieLists.find((l) => l.id === listId);
    if (!list) { setTogglingListId(null); return; }

    if (list.hasMovie) {
      const res = await fetch(`/api/watchlist/${listId}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      const entry = data.movies?.find((m: { tmdbId: number }) => m.tmdbId === listPickerMovie.tmdbId);
      if (entry) {
        await fetch(`/api/watchlist/${listId}/movies/${entry.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      }
      setMovieLists((prev) => prev.map((l) => l.id === listId ? { ...l, hasMovie: false } : l));
      // If removed from the currently viewed list, remove from grid
      if (listId === activeId) {
        setMovies((prev) => prev.filter((m) => m.tmdbId !== listPickerMovie.tmdbId));
        setWatchlists((prev) => prev.map((w) => w.id === activeId ? { ...w, movieCount: w.movieCount - 1 } : w));
      }
    } else {
      await fetch(`/api/watchlist/${listId}/movies`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ tmdbId: listPickerMovie.tmdbId, title: listPickerMovie.title, posterPath: listPickerMovie.posterPath }),
      });
      setMovieLists((prev) => prev.map((l) => l.id === listId ? { ...l, hasMovie: true } : l));
      // Update count for the list it was added to
      setWatchlists((prev) => prev.map((w) => w.id === listId ? { ...w, movieCount: w.movieCount + 1 } : w));
    }
    setTogglingListId(null);
  }

  /* ── Collect all genres from current movie set ── */
  const allGenres = useMemo(() => {
    const set = new Set<string>();
    movies.forEach((m) => m.genres.forEach((g) => set.add(g)));
    return [...set].sort();
  }, [movies]);

  /* ── Filter + sort ── */
  const filtered = useMemo(() => {
    let list = movies;
    if (query) list = list.filter((m) => m.title.toLowerCase().includes(query.toLowerCase()));
    if (seenFilter === "checked") list = list.filter((m) => m.isChecked);
    if (seenFilter === "unchecked") list = list.filter((m) => !m.isChecked);
    if (genreFilter) list = list.filter((m) => m.genres.includes(genreFilter));

    list = [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "title": cmp = a.title.localeCompare(b.title); break;
        case "year": cmp = (a.year || "").localeCompare(b.year || ""); break;
        case "rating": cmp = (a.ratistRating ?? a.estimatedRating ?? -1) - (b.ratistRating ?? b.estimatedRating ?? -1); break;
        case "community": cmp = (a.voteAverage ?? -1) - (b.voteAverage ?? -1); break;
        default: cmp = new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime();
      }
      return sortAsc ? cmp : -cmp;
    });

    return list;
  }, [movies, query, seenFilter, genreFilter, sortKey, sortAsc]);

  const checkedCount = movies.filter((m) => m.isChecked).length;
  const uncheckedCount = movies.length - checkedCount;

  /* ── Render ── */
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <Bookmark className="w-6 h-6 text-[var(--ratist-red)]" />
        <h1 className="text-2xl font-bold text-white">My Watchlists</h1>
      </div>
      <p className="text-[var(--foreground-muted)] mb-1">Organize the movies you want to watch.</p>
      <Link href="/seen" className="text-sm text-[var(--ratist-red)] hover:underline mb-6 inline-block">
        View movies you&apos;ve already seen &rarr;
      </Link>

      {!user ? (
        <div className="text-center py-20 text-[var(--foreground-muted)]">
          <Link href="/auth/signin" className="text-[var(--ratist-red)] hover:underline">Sign in</Link> to see your watchlists.
        </div>
      ) : loading ? (
        <p className="text-[var(--foreground-muted)] text-center py-10">Loading&hellip;</p>
      ) : (
        <div className="flex flex-col lg:flex-row gap-6">
          {/* ── Sidebar: list switcher ── */}
          <div className="lg:w-56 shrink-0">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-white">Lists</h2>
              <button onClick={() => setShowCreate(true)} className="text-[var(--ratist-red)] hover:text-white transition-colors" title="Create new list">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-1">
              {watchlists.map((wl) => (
                <button
                  key={wl.id}
                  onClick={() => loadList(wl.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition-colors ${
                    wl.id === activeId
                      ? "bg-[var(--surface-2)] text-white border border-[var(--ratist-red)]/30"
                      : "text-[var(--foreground-muted)] hover:bg-[var(--surface)] hover:text-white"
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    {wl.isPrivate && <Lock className="w-3 h-3 shrink-0 opacity-50" />}
                    <span className="truncate">{wl.name}</span>
                  </span>
                  <span className="text-xs opacity-60 shrink-0 ml-2">{wl.movieCount}</span>
                </button>
              ))}
            </div>

            {/* Create new list modal */}
            {showCreate && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}>
                <div className="w-full max-w-sm bg-[var(--background)] border border-[var(--border)] rounded-2xl p-6 mx-4">
                  <h3 className="text-base font-semibold text-white mb-4">New Watchlist</h3>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="List name"
                    className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] mb-3"
                    autoFocus
                  />
                  <textarea
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="Description (optional)"
                    rows={2}
                    className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] resize-none mb-3"
                  />
                  <label className="flex items-center gap-2 text-sm text-[var(--foreground-muted)] mb-4 cursor-pointer">
                    <input type="checkbox" checked={newPrivate} onChange={(e) => setNewPrivate(e.target.checked)} className="accent-[var(--ratist-red)]" />
                    Private list
                  </label>
                  <div className="flex gap-3">
                    <button onClick={createWatchlist} disabled={!newName.trim() || creating} className="flex-1 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50">
                      {creating ? "Creating..." : "Create"}
                    </button>
                    <button onClick={() => setShowCreate(false)} className="px-4 border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white rounded-xl transition-colors">Cancel</button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Main content ── */}
          <div className="flex-1 min-w-0">
            {activeList && (
              <>
                {/* List header */}
                <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-white">{activeList.name}</h2>
                      {activeList.isPrivate && <Lock className="w-3.5 h-3.5 text-[var(--foreground-muted)]" />}
                    </div>
                    {activeList.description && <p className="text-sm text-[var(--foreground-muted)] mt-0.5">{activeList.description}</p>}
                    <div className="flex gap-4 mt-1 text-xs text-[var(--foreground-muted)]">
                      <span>{movies.length} movie{movies.length !== 1 ? "s" : ""}</span>
                      {checkedCount > 0 && <span className="text-green-400">{checkedCount} watched</span>}
                      {uncheckedCount > 0 && <span>{uncheckedCount} to go</span>}
                    </div>
                  </div>
                  {activeList.isOwner && !activeList.isDefault && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setEditingList(true); setEditName(activeList.name); setEditDesc(activeList.description ?? ""); setEditPrivate(activeList.isPrivate); }}
                        className="p-2 rounded-lg text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--surface)] transition-colors"
                        title="Edit list"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="p-2 rounded-lg text-[var(--foreground-muted)] hover:text-red-400 hover:bg-[var(--surface)] transition-colors"
                        title="Delete list"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Search + filter bar */}
                {movies.length > 0 && (
                  <div className="flex flex-wrap gap-3 mb-4">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)]" />
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search this list..."
                        className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl pl-10 pr-4 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
                      />
                    </div>

                    {/* Sort */}
                    <div className="relative">
                      <select
                        value={sortKey}
                        onChange={(e) => setSortKey(e.target.value as SortKey)}
                        className="appearance-none bg-[var(--surface)] border border-[var(--border)] rounded-xl pl-3 pr-8 py-2 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)] cursor-pointer"
                      >
                        <option value="added">Date Added</option>
                        <option value="title">Title</option>
                        <option value="year">Year</option>
                        <option value="rating">Ratist Rating</option>
                        <option value="community">Community Rating</option>
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)] pointer-events-none" />
                    </div>

                    <button
                      onClick={() => setSortAsc(!sortAsc)}
                      className="p-2 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-[var(--foreground-muted)] hover:text-white transition-colors"
                      title={sortAsc ? "Ascending" : "Descending"}
                    >
                      <ArrowUpDown className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => setShowFilters(!showFilters)}
                      className={`p-2 border rounded-xl transition-colors ${showFilters ? "bg-[var(--ratist-red)]/10 border-[var(--ratist-red)]/30 text-[var(--ratist-red)]" : "bg-[var(--surface)] border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"}`}
                      title="Filters"
                    >
                      <SlidersHorizontal className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Expanded filters */}
                {showFilters && movies.length > 0 && (
                  <div className="flex flex-wrap gap-3 mb-4 p-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
                    <div>
                      <label className="text-xs text-[var(--foreground-muted)] mb-1 block">Status</label>
                      <select
                        value={seenFilter}
                        onChange={(e) => setSeenFilter(e.target.value as SeenFilter)}
                        className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none"
                      >
                        <option value="all">All</option>
                        <option value="unchecked">Unwatched</option>
                        <option value="checked">Watched</option>
                      </select>
                    </div>
                    {allGenres.length > 0 && (
                      <div>
                        <label className="text-xs text-[var(--foreground-muted)] mb-1 block">Genre</label>
                        <select
                          value={genreFilter}
                          onChange={(e) => setGenreFilter(e.target.value)}
                          className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none"
                        >
                          <option value="">All Genres</option>
                          {allGenres.map((g) => <option key={g} value={g}>{g}</option>)}
                        </select>
                      </div>
                    )}
                    {(seenFilter !== "all" || genreFilter) && (
                      <button onClick={() => { setSeenFilter("all"); setGenreFilter(""); }} className="self-end text-xs text-[var(--ratist-red)] hover:underline pb-1">
                        Clear filters
                      </button>
                    )}
                  </div>
                )}

                {/* Movie grid */}
                {loadingMovies ? (
                  <p className="text-[var(--foreground-muted)] text-center py-10">Loading&hellip;</p>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-16 text-[var(--foreground-muted)]">
                    {movies.length === 0 ? (
                      <>
                        <Bookmark className="w-12 h-12 mx-auto mb-4 opacity-30" />
                        <p className="mb-2">This list is empty.</p>
                        <p className="text-sm">Browse movies and add them to this list.</p>
                        <Link href="/movies" className="mt-4 inline-block text-sm text-[var(--ratist-red)] hover:underline">Browse movies &rarr;</Link>
                      </>
                    ) : (
                      <p>No movies match your filters.</p>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
                    {filtered.map((movie) => (
                      <div key={movie.id} className="group flex flex-col relative">
                        {/* Confirm remove overlay */}
                        {confirmingRemove === movie.id ? (
                          <div className="absolute inset-0 z-10 bg-black/80 rounded-lg flex flex-col items-center justify-center gap-2 p-2">
                            <p className="text-xs text-white text-center font-medium">Remove<br /><span className="text-[var(--foreground-muted)]">{movie.title}</span>?</p>
                            <div className="flex gap-2">
                              <button onClick={() => confirmRemove(movie)} className="px-3 py-1 text-xs rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors">Remove</button>
                              <button onClick={() => setConfirmingRemove(null)} className="px-3 py-1 text-xs rounded-lg bg-[var(--surface-2)] text-white border border-[var(--border)] hover:border-white/30 transition-colors">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {/* Remove button */}
                            <button
                              onClick={() => setConfirmingRemove(movie.id)}
                              disabled={removing.has(movie.id)}
                              className="absolute -top-1.5 -right-1.5 z-10 w-6 h-6 rounded-full bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-600 hover:border-red-600 transition-all"
                              title="Remove from list"
                            >
                              <X className="w-3.5 h-3.5 text-[var(--foreground-muted)] hover:text-white" />
                            </button>
                            {/* Add to other lists */}
                            {watchlists.length > 1 && (
                              <button
                                onClick={() => openListPicker(movie)}
                                className="absolute bottom-[calc(100%-2.5rem)] right-6 z-10 w-6 h-6 rounded-full bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-blue-600 hover:border-blue-600 transition-all"
                                title="Add to other lists"
                              >
                                <ListPlus className="w-3.5 h-3.5 text-[var(--foreground-muted)] hover:text-white" />
                              </button>
                            )}
                            {/* Check-off button */}
                            <button
                              onClick={() => toggleCheck(movie)}
                              className={`absolute -top-1.5 -left-1.5 z-10 w-6 h-6 rounded-full border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all ${
                                movie.isChecked
                                  ? "bg-green-600 border-green-600 text-white opacity-100"
                                  : "bg-[var(--surface-2)] border-[var(--border)] hover:bg-green-600 hover:border-green-600"
                              }`}
                              title={movie.isChecked ? "Unmark as watched" : "Mark as watched"}
                            >
                              <Check className={`w-3.5 h-3.5 ${movie.isChecked ? "text-white" : "text-[var(--foreground-muted)] hover:text-white"}`} />
                            </button>
                          </>
                        )}

                        <Link href={`/movies/${movie.tmdbId}`} className={`flex flex-col ${movie.isChecked ? "opacity-60" : ""}`}>
                          <div className={`relative aspect-[2/3] rounded-lg overflow-hidden bg-[var(--surface-2)] border transition-colors mb-1.5 ${
                            movie.isChecked ? "border-green-500/30" : "border-[var(--border)] group-hover:border-[var(--ratist-red)]"
                          }`}>
                            {movie.posterPath ? (
                              <Image src={posterUrl(movie.posterPath, "w185")} alt={movie.title} fill sizes="120px" className="object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-sm text-[var(--foreground-muted)]">?</div>
                            )}
                            {movie.isChecked && (
                              <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                                <Check className="w-8 h-8 text-green-400" />
                              </div>
                            )}
                          </div>
                          <p className={`text-xs font-medium line-clamp-1 transition-colors ${
                            movie.isChecked ? "text-[var(--foreground-muted)] line-through" : "text-white group-hover:text-[var(--ratist-red)]"
                          }`}>{movie.title}</p>
                          <p className="text-xs text-[var(--foreground-muted)]">{movie.year}</p>
                          <div className="flex items-center gap-2 flex-wrap mt-0.5">
                            {movie.voteAverage != null && movie.voteAverage > 0 && (
                              <RatingBadge type="community" score={movie.voteAverage} size="sm" />
                            )}
                            {movie.ratistRating != null ? (
                              <RatingBadge type="ratist" score={movie.ratistRating} size="sm" />
                            ) : movie.estimatedRating != null ? (
                              <RatingBadge type="ratist" score={movie.estimatedRating} size="sm" isEstimate />
                            ) : null}
                          </div>
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Edit list modal */}
      {editingList && activeList && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setEditingList(false); }}>
          <div className="w-full max-w-sm bg-[var(--background)] border border-[var(--border)] rounded-2xl p-6 mx-4">
            <h3 className="text-base font-semibold text-white mb-4">Edit List</h3>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="List name"
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] mb-3"
              autoFocus
            />
            <textarea
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] resize-none mb-3"
            />
            <label className="flex items-center gap-2 text-sm text-[var(--foreground-muted)] mb-4 cursor-pointer">
              <input type="checkbox" checked={editPrivate} onChange={(e) => setEditPrivate(e.target.checked)} className="accent-[var(--ratist-red)]" />
              Private list
            </label>
            <div className="flex gap-3">
              <button onClick={saveEdit} disabled={!editName.trim()} className="flex-1 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50">Save</button>
              <button onClick={() => setEditingList(false)} className="px-4 border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white rounded-xl transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* List picker modal */}
      {listPickerMovie && movieLists.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setListPickerMovie(null); }}>
          <div className="w-full max-w-xs bg-[var(--background)] border border-[var(--border)] rounded-2xl p-5 mx-4">
            <h3 className="text-sm font-semibold text-white mb-1">Manage lists</h3>
            <p className="text-xs text-[var(--foreground-muted)] mb-3 truncate">{listPickerMovie.title}</p>
            <div className="space-y-0.5">
              {movieLists.map((list) => (
                <button
                  key={list.id}
                  onClick={() => toggleMovieList(list.id)}
                  disabled={togglingListId === list.id}
                  className="w-full flex items-center justify-between px-2 py-1.5 text-sm rounded-lg hover:bg-[var(--surface)] transition-colors disabled:opacity-50"
                >
                  <span className="text-white truncate">
                    {list.name}
                    {list.isDefault && <span className="text-[var(--foreground-muted)] text-xs ml-1">(default)</span>}
                  </span>
                  {list.hasMovie ? (
                    <Check className="w-4 h-4 text-green-400 shrink-0" />
                  ) : (
                    <Plus className="w-4 h-4 text-[var(--foreground-muted)] shrink-0" />
                  )}
                </button>
              ))}
            </div>
            <button onClick={() => setListPickerMovie(null)} className="w-full text-center text-xs text-[var(--foreground-muted)] hover:text-white mt-3 py-1 transition-colors">
              Done
            </button>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {showDeleteConfirm && activeList && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setShowDeleteConfirm(false); }}>
          <div className="w-full max-w-sm bg-[var(--background)] border border-[var(--border)] rounded-2xl p-6 mx-4 text-center">
            <h3 className="text-base font-semibold text-white mb-2">Delete &ldquo;{activeList.name}&rdquo;?</h3>
            <p className="text-sm text-[var(--foreground-muted)] mb-5">This will permanently delete this list and remove all movies from it. This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={deleteWatchlist} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-xl transition-colors">Delete</button>
              <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white rounded-xl transition-colors py-2.5">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
