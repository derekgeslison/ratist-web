"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Bookmark, Search, X, Plus, Check, ChevronDown, Lock, Star,
  ArrowUpDown, Pencil, Trash2, SlidersHorizontal, ListPlus, Users, UserPlus, LogOut,
  Film, Tv,
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
  ownerName?: string;
  ownerUid?: string;
  myRole: string | null;
  collaboratorCount: number;
  createdAt: string;
}

interface Collaborator {
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: string;
  status: string;
}

interface PendingInvite {
  watchlistId: string;
  listName: string;
  listDescription: string | null;
  movieCount: number;
  ownerName: string;
  ownerAvatar: string | null;
  ownerUid: string;
  role: string;
  invitedAt: string;
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
  mediaType?: "movie" | "tv";
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
  const [mediaFilter, setMediaFilter] = useState<"all" | "movie" | "tv">("all");
  const [genreFilter, setGenreFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  /* ── Add movie search ── */
  const [addMovieQuery, setAddMovieQuery] = useState("");
  const [addMovieResults, setAddMovieResults] = useState<{ id: number; title: string; posterPath: string | null; releaseDate: string; mediaType: "movie" | "tv" }[]>([]);
  const [addingMovie, setAddingMovie] = useState<number | null>(null);

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
  const [showCollaborators, setShowCollaborators] = useState(false);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [inviteCode, setInviteCode] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [showInvites, setShowInvites] = useState(false);
  const [listPickerMovie, setListPickerMovie] = useState<WatchlistMovie | null>(null);
  const [movieLists, setMovieLists] = useState<{ id: string; name: string; isDefault: boolean; hasMovie: boolean }[]>([]);
  const [togglingListId, setTogglingListId] = useState<string | null>(null);

  const activeList = watchlists.find((w) => w.id === activeId) ?? null;

  /* ── Helpers ── */
  const getToken = useCallback(async () => {
    if (!user) return null;
    return user.getIdToken();
  }, [user]);

  /* ── Load watchlists + pending invites ── */
  useEffect(() => {
    if (!user) { setLoading(false); return; }
    (async () => {
      const token = await getToken();
      if (!token) return;
      const [listRes, inviteRes] = await Promise.all([
        fetch("/api/watchlist", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/watchlist/invites", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const data = await listRes.json();
      const inviteData = await inviteRes.json();
      setWatchlists(data.watchlists ?? []);
      setMovies(data.defaultMovies ?? []);
      setPendingInvites(inviteData.invites ?? []);
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

  /* ── Collaborator management ── */
  async function openCollaborators() {
    if (!activeId) return;
    const token = await getToken();
    if (!token) return;
    const res = await fetch(`/api/watchlist/${activeId}/collaborators`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      setCollaborators(data.collaborators ?? []);
    }
    setInviteCode("");
    setInviteError("");
    setShowCollaborators(true);
  }

  async function inviteByCode() {
    if (!activeId || !inviteCode.trim() || inviting) return;
    setInviting(true);
    setInviteError("");
    const token = await getToken();
    if (!token) return;
    const res = await fetch(`/api/watchlist/${activeId}/collaborators`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ inviteCode: inviteCode.trim(), role: inviteRole }),
    });
    const data = await res.json();
    if (res.ok && data.collaborator) {
      setCollaborators((prev) => [...prev, data.collaborator]);
      setWatchlists((prev) => prev.map((w) => w.id === activeId ? { ...w, collaboratorCount: w.collaboratorCount + 1 } : w));
      setInviteCode("");
    } else {
      setInviteError(data.error ?? "Failed to invite");
    }
    setInviting(false);
  }

  async function respondToInvite(watchlistId: string, action: "accept" | "decline") {
    setRespondingTo(watchlistId);
    const token = await getToken();
    if (!token) return;
    await fetch(`/api/watchlist/${watchlistId}/collaborators`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setPendingInvites((prev) => prev.filter((i) => i.watchlistId !== watchlistId));
    if (action === "accept") {
      // Reload the sidebar to include the new list
      const res = await fetch("/api/watchlist", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setWatchlists(data.watchlists ?? []);
    }
    setRespondingTo(null);
  }

  async function changeRole(userId: string, role: string) {
    if (!activeId) return;
    const token = await getToken();
    if (!token) return;
    await fetch(`/api/watchlist/${activeId}/collaborators`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role }),
    });
    setCollaborators((prev) => prev.map((c) => c.userId === userId ? { ...c, role } : c));
  }

  async function removeCollaborator(userId: string) {
    if (!activeId) return;
    const token = await getToken();
    if (!token) return;
    await fetch(`/api/watchlist/${activeId}/collaborators`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    setCollaborators((prev) => prev.filter((c) => c.userId !== userId));
    setWatchlists((prev) => prev.map((w) => w.id === activeId ? { ...w, collaboratorCount: w.collaboratorCount - 1 } : w));
  }

  async function leaveList() {
    if (!activeId || !user) return;
    const token = await getToken();
    if (!token) return;
    await fetch(`/api/watchlist/${activeId}/collaborators`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.uid }),
    });
    setWatchlists((prev) => prev.filter((w) => w.id !== activeId));
    const def = watchlists.find((w) => w.isDefault);
    if (def) { setActiveId(def.id); loadList(def.id); }
  }

  /* ── Export to rankings ── */
  async function exportToRankings() {
    if (!activeList || !user) return;
    const name = prompt("Name for your custom rankings list:", activeList.name);
    if (!name?.trim()) return;
    const token = await getToken();
    if (!token) return;
    const res = await fetch("/api/tools/rankings/lists", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), fromWatchlistId: activeList.id }),
    });
    if (res.ok) {
      alert(`Rankings list "${name}" created! You can find it on the Rankings page.`);
    }
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

  /* ── Add movie/show search ── */
  useEffect(() => {
    if (addMovieQuery.length < 2) { setAddMovieResults([]); return; }
    const t = setTimeout(async () => {
      const q = encodeURIComponent(addMovieQuery);
      const [movieRes, tvRes] = await Promise.all([
        fetch(`/api/tmdb/movie/search?q=${q}`),
        fetch(`/api/tmdb/tv/search?q=${q}`),
      ]);
      const movieData = await movieRes.json();
      const tvData = await tvRes.json();
      const movies = (movieData.results ?? []).map((m: { id: number; title: string; posterPath: string | null; releaseDate: string }) => ({ ...m, mediaType: "movie" as const }));
      const shows = (tvData.results ?? []).map((s: { id: number; title: string; posterPath: string | null; releaseDate: string }) => ({ ...s, mediaType: "tv" as const }));
      // Interleave: alternate movie, show, to give balanced results
      const combined: typeof movies = [];
      const maxLen = Math.max(movies.length, shows.length);
      for (let i = 0; i < maxLen; i++) {
        if (i < movies.length) combined.push(movies[i]);
        if (i < shows.length) combined.push(shows[i]);
      }
      setAddMovieResults(combined.slice(0, 12));
    }, 300);
    return () => clearTimeout(t);
  }, [addMovieQuery]);

  async function addMovieToList(m: { id: number; title: string; posterPath: string | null; releaseDate: string; mediaType: "movie" | "tv" }) {
    if (!user || !activeList || addingMovie) return;
    setAddingMovie(m.id);
    const token = await user.getIdToken();
    await fetch(`/api/watchlist/${activeList.id}/movies`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ tmdbId: m.id, title: m.title, posterPath: m.posterPath, releaseDate: m.releaseDate, mediaType: m.mediaType }),
    });
    setAddingMovie(null);
    setAddMovieQuery("");
    setAddMovieResults([]);
    // Refresh movies for current list
    const token2 = await user.getIdToken();
    const res2 = await fetch(`/api/watchlist/${activeList.id}`, { headers: { Authorization: `Bearer ${token2}` } });
    const data2 = await res2.json();
    setMovies(data2.movies ?? []);
    // Update list count
    setWatchlists((prev) => prev.map((l) => l.id === activeList.id ? { ...l, movieCount: l.movieCount + 1 } : l));
  }

  /* ── List picker for adding movie to other lists ── */
  async function openListPicker(movie: WatchlistMovie) {
    setListPickerMovie(movie);
    const token = await getToken();
    if (!token) return;
    const endpoint = (movie.mediaType === "tv") ? `/api/shows/${movie.tmdbId}/watchlist` : `/api/movies/${movie.tmdbId}/watchlist`;
    const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
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
        body: JSON.stringify({ tmdbId: listPickerMovie.tmdbId, title: listPickerMovie.title, posterPath: listPickerMovie.posterPath, mediaType: listPickerMovie.mediaType }),
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
    if (mediaFilter !== "all") list = list.filter((m) => (m.mediaType ?? "movie") === mediaFilter);
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
  }, [movies, query, seenFilter, mediaFilter, genreFilter, sortKey, sortAsc]);

  const canEdit = activeList ? (activeList.isOwner || activeList.myRole === "editor") : false;
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
      <p className="text-[var(--foreground-muted)] mb-1">Organize movies &amp; shows you want to watch.</p>
      <Link href="/seen" className="text-sm text-[var(--ratist-red)] hover:underline mb-6 inline-block">
        View what you&apos;ve already seen &rarr;
      </Link>

      {!user ? (
        <div className="text-center py-20 text-[var(--foreground-muted)]">
          <Link href="/auth/signin" className="text-[var(--ratist-red)] hover:underline">Sign in</Link> to see your watchlists.
        </div>
      ) : loading ? (
        <p className="text-[var(--foreground-muted)] text-center py-10">Loading&hellip;</p>
      ) : (
        <>
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
                  <span className="flex flex-col truncate">
                    <span className="flex items-center gap-1.5 truncate">
                      {wl.isPrivate && <Lock className="w-3 h-3 shrink-0 opacity-50" />}
                      {wl.collaboratorCount > 0 && <Users className="w-3 h-3 shrink-0 opacity-50" />}
                      <span className="truncate">{wl.name}</span>
                    </span>
                    {!wl.isOwner && wl.ownerName && (
                      <span className="text-[10px] opacity-50 truncate">by {wl.ownerName}</span>
                    )}
                  </span>
                  <span className="text-xs opacity-60 shrink-0 ml-2">{wl.movieCount}</span>
                </button>
              ))}
            </div>

            {/* Pending invites — collapsible in sidebar */}
            {pendingInvites.length > 0 && (
              <div className="mt-3">
                <button
                  onClick={() => setShowInvites(!showInvites)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm bg-[var(--ratist-red)]/10 border border-[var(--ratist-red)]/20 text-[var(--ratist-red)] hover:bg-[var(--ratist-red)]/20 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <UserPlus className="w-3.5 h-3.5" />
                    Invites
                  </span>
                  <span className="bg-[var(--ratist-red)] text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {pendingInvites.length}
                  </span>
                </button>
                {showInvites && (
                  <div className="mt-2 space-y-2">
                    {pendingInvites.map((inv) => (
                      <div key={inv.watchlistId} className="p-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg">
                        <p className="text-xs text-white font-medium truncate">{inv.listName}</p>
                        <p className="text-[10px] text-[var(--foreground-muted)] mb-2">
                          from {inv.ownerName} · {inv.movieCount} item{inv.movieCount !== 1 ? "s" : ""} · {inv.role}
                        </p>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => respondToInvite(inv.watchlistId, "accept")}
                            disabled={respondingTo === inv.watchlistId}
                            className="flex-1 px-2 py-1 text-[10px] font-semibold bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white rounded-md transition-colors disabled:opacity-50"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => respondToInvite(inv.watchlistId, "decline")}
                            disabled={respondingTo === inv.watchlistId}
                            className="flex-1 px-2 py-1 text-[10px] font-semibold border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white rounded-md transition-colors disabled:opacity-50"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

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
                    {!activeList.isOwner && activeList.ownerName && (
                      <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
                        by <Link href={`/profile/${activeList.ownerUid}`} className="text-[var(--ratist-red)] hover:underline">{activeList.ownerName}</Link>
                        {activeList.myRole && <span> · you&apos;re {activeList.myRole === "editor" ? "an editor" : "a viewer"}</span>}
                      </p>
                    )}
                    <div className="flex gap-4 mt-1 text-xs text-[var(--foreground-muted)]">
                      <span>{movies.length} item{movies.length !== 1 ? "s" : ""}</span>
                      {checkedCount > 0 && <span className="text-green-400">{checkedCount} watched</span>}
                      {uncheckedCount > 0 && <span>{uncheckedCount} to go</span>}
                    </div>
                  </div>
                  {!activeList.isDefault && (
                    <div className="flex gap-2">
                      {activeList.isOwner && (
                        <>
                          <button
                            onClick={() => { setEditingList(true); setEditName(activeList.name); setEditDesc(activeList.description ?? ""); setEditPrivate(activeList.isPrivate); }}
                            className="p-2 rounded-lg text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--surface)] transition-colors"
                            title="Edit list"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={openCollaborators}
                            className="p-2 rounded-lg text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--surface)] transition-colors"
                            title="Manage collaborators"
                          >
                            <Users className="w-4 h-4" />
                          </button>
                          <button
                            onClick={exportToRankings}
                            className="p-2 rounded-lg text-[var(--foreground-muted)] hover:text-purple-400 hover:bg-[var(--surface)] transition-colors"
                            title="Export to Rankings"
                          >
                            <Star className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setShowDeleteConfirm(true)}
                            className="p-2 rounded-lg text-[var(--foreground-muted)] hover:text-red-400 hover:bg-[var(--surface)] transition-colors"
                            title="Delete list"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      {!activeList.isOwner && (
                        <button
                          onClick={leaveList}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-[var(--foreground-muted)] hover:text-red-400 hover:bg-[var(--surface)] transition-colors"
                          title="Leave this list"
                        >
                          <LogOut className="w-4 h-4" /> Leave
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Add movie search */}
                {(activeList.isOwner || activeList.myRole === "editor") && (
                  <div className="relative mb-4">
                    <div className="flex items-center gap-2 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-3 py-2">
                      <Plus className="w-4 h-4 text-[var(--ratist-red)]" />
                      <input
                        value={addMovieQuery}
                        onChange={(e) => setAddMovieQuery(e.target.value)}
                        placeholder="Search movies & shows to add..."
                        className="flex-1 bg-transparent text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none"
                      />
                      {addMovieQuery && (
                        <button onClick={() => { setAddMovieQuery(""); setAddMovieResults([]); }}>
                          <X className="w-4 h-4 text-[var(--foreground-muted)]" />
                        </button>
                      )}
                    </div>
                    {addMovieResults.length > 0 && (
                      <div className="absolute z-20 mt-1 w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl max-h-64 overflow-y-auto">
                        {addMovieResults.map((m) => {
                          const alreadyIn = movies.some((mv) => mv.tmdbId === m.id);
                          return (
                            <button key={m.id} onClick={() => !alreadyIn && addMovieToList(m)}
                              disabled={alreadyIn || addingMovie === m.id}
                              className={`flex items-center gap-3 w-full px-3 py-2 text-left ${alreadyIn ? "opacity-40" : "hover:bg-[var(--surface-2)]"}`}>
                              <div className="w-8 h-12 rounded overflow-hidden bg-[var(--surface-2)] flex-shrink-0">
                                {m.posterPath && <Image src={posterUrl(m.posterPath, "w92")} alt={m.title} width={32} height={48} className="object-cover w-full h-full" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-white flex items-center gap-1.5">
                                  <span className="truncate">{m.title}</span>
                                  {m.mediaType === "tv" && (
                                    <span className="shrink-0 bg-blue-600/90 text-white rounded px-1 py-0.5 flex items-center gap-0.5">
                                      <Tv className="w-2.5 h-2.5" />
                                      <span className="text-[8px] font-bold leading-none">TV</span>
                                    </span>
                                  )}
                                </p>
                                <p className="text-xs text-[var(--foreground-muted)]">{m.releaseDate?.slice(0, 4)}</p>
                              </div>
                              {alreadyIn && <span className="text-[9px] text-[var(--foreground-muted)]">Already in list</span>}
                              {addingMovie === m.id && <span className="text-[9px] text-[var(--ratist-red)]">Adding...</span>}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

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
                      <label className="text-xs text-[var(--foreground-muted)] mb-1 block">Type</label>
                      <div className="flex gap-1">
                        {([
                          { value: "all" as const, label: "All" },
                          { value: "movie" as const, label: "Movies", icon: Film },
                          { value: "tv" as const, label: "Shows", icon: Tv },
                        ]).map(({ value, label, icon: Icon }) => (
                          <button
                            key={value}
                            onClick={() => setMediaFilter(value)}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                              mediaFilter === value
                                ? value === "tv" ? "bg-blue-600/20 border border-blue-500/40 text-blue-400" : "bg-[var(--ratist-red)]/10 border border-[var(--ratist-red)]/40 text-white"
                                : "border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"
                            }`}
                          >
                            {Icon && <Icon className="w-3 h-3" />}
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
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
                    {(seenFilter !== "all" || genreFilter || mediaFilter !== "all") && (
                      <button onClick={() => { setSeenFilter("all"); setGenreFilter(""); setMediaFilter("all"); }} className="self-end text-xs text-[var(--ratist-red)] hover:underline pb-1">
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
                        <p className="mb-2">Nothing in this list yet.</p>
                        <p className="text-sm">Search above or browse to add movies &amp; shows.</p>
                        <Link href="/movies" className="mt-4 inline-block text-sm text-[var(--ratist-red)] hover:underline">Browse &rarr;</Link>
                      </>
                    ) : (
                      <p>Nothing matches your filters.</p>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
                    {filtered.map((movie) => (
                      <div key={movie.id} className="group flex flex-col relative">
                        {/* Confirm remove overlay */}
                        {canEdit && confirmingRemove === movie.id ? (
                          <div className="absolute inset-0 z-10 bg-black/80 rounded-lg flex flex-col items-center justify-center gap-2 p-2">
                            <p className="text-xs text-white text-center font-medium">Remove<br /><span className="text-[var(--foreground-muted)]">{movie.title}</span>?</p>
                            <div className="flex gap-2">
                              <button onClick={() => confirmRemove(movie)} className="px-3 py-1 text-xs rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors">Remove</button>
                              <button onClick={() => setConfirmingRemove(null)} className="px-3 py-1 text-xs rounded-lg bg-[var(--surface-2)] text-white border border-[var(--border)] hover:border-white/30 transition-colors">Cancel</button>
                            </div>
                          </div>
                        ) : canEdit ? (
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
                            {/* Add to other lists — top center */}
                            {watchlists.length > 1 && (
                              <button
                                onClick={() => openListPicker(movie)}
                                className="absolute -top-1.5 left-1/2 -translate-x-1/2 z-10 w-6 h-6 rounded-full bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-blue-600 hover:border-blue-600 transition-all"
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
                        ) : null}

                        <Link href={`/${movie.mediaType === "tv" ? "shows" : "movies"}/${movie.tmdbId}`} className={`flex flex-col ${movie.isChecked ? "opacity-60" : ""}`}>
                          <div className={`relative aspect-[2/3] rounded-lg overflow-hidden bg-[var(--surface-2)] border transition-colors mb-1.5 ${
                            movie.isChecked ? "border-green-500/30" : "border-[var(--border)] group-hover:border-[var(--ratist-red)]"
                          }`}>
                            {movie.posterPath ? (
                              <Image src={posterUrl(movie.posterPath, "w185")} alt={movie.title} fill sizes="120px" className="object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-sm text-[var(--foreground-muted)]">?</div>
                            )}
                            {movie.mediaType === "tv" && (
                              <div className="absolute top-1 left-1 bg-blue-600/90 text-white rounded px-1 py-0.5 flex items-center gap-0.5 z-10">
                                <Tv className="w-2.5 h-2.5" />
                                <span className="text-[8px] font-bold leading-none">TV</span>
                              </div>
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
        </>
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

      {/* Collaborator management modal */}
      {showCollaborators && activeList && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) setShowCollaborators(false); }}>
          <div className="w-full max-w-md bg-[var(--background)] border border-[var(--border)] rounded-2xl p-6 mx-4">
            <h3 className="text-base font-semibold text-white mb-1">Collaborators</h3>
            <p className="text-xs text-[var(--foreground-muted)] mb-4">{activeList.name}</p>

            {/* Invite by code */}
            <div className="mb-4">
              <p className="text-xs text-[var(--foreground-muted)] mb-2">Paste someone&apos;s invite code to add them.</p>
              <div className="flex gap-2">
                <input
                  value={inviteCode}
                  onChange={(e) => { setInviteCode(e.target.value); setInviteError(""); }}
                  placeholder="e.g. R-7KX9M2"
                  className="flex-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] font-mono"
                  onKeyDown={(e) => { if (e.key === "Enter") inviteByCode(); }}
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as "editor" | "viewer")}
                  className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2 py-2 text-sm text-white focus:outline-none"
                >
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button
                  onClick={inviteByCode}
                  disabled={!inviteCode.trim() || inviting}
                  className="flex items-center gap-1.5 px-3 py-2 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                >
                  <UserPlus className="w-4 h-4" />
                </button>
              </div>
              {inviteError && <p className="text-xs text-red-400 mt-2">{inviteError}</p>}
            </div>

            {/* Current collaborators */}
            {collaborators.length === 0 ? (
              <p className="text-sm text-[var(--foreground-muted)] text-center py-4">No collaborators yet. Invite someone above.</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {collaborators.map((c) => (
                  <div key={c.userId} className="flex items-center justify-between gap-3 p-2 rounded-lg bg-[var(--surface)]">
                    <div className="flex items-center gap-2 min-w-0">
                      {c.avatarUrl ? (
                        <Image src={c.avatarUrl} alt={c.name} width={28} height={28} className="rounded-full shrink-0" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-[var(--surface-2)] flex items-center justify-center text-xs text-[var(--foreground-muted)] shrink-0">
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm text-white truncate">{c.name}</p>
                        {c.status === "pending" && <p className="text-[10px] text-yellow-400">Pending</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        value={c.role}
                        onChange={(e) => changeRole(c.userId, e.target.value)}
                        className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs text-white focus:outline-none"
                      >
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      <button
                        onClick={() => removeCollaborator(c.userId)}
                        className="p-1 rounded text-[var(--foreground-muted)] hover:text-red-400 transition-colors"
                        title="Remove"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button onClick={() => setShowCollaborators(false)} className="w-full text-center text-sm text-[var(--foreground-muted)] hover:text-white mt-4 py-2 transition-colors">
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
            <p className="text-sm text-[var(--foreground-muted)] mb-5">This will permanently delete this list and remove everything from it. This cannot be undone.</p>
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
