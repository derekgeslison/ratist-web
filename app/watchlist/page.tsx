"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import SignInLink from "@/components/SignInLink";
import { DndContext, closestCenter, PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Bookmark, Search, X, Plus, Check, ChevronDown, Lock, Star,
  ArrowUpDown, Pencil, Trash2, SlidersHorizontal, ListPlus, Users, UserPlus, LogOut,
  Film, Tv, Monitor, ListOrdered, GripVertical, Copy, BarChart3, Sparkles, Layers, HelpCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { STREAMING_PROVIDERS } from "@/lib/tmdb";
import ProviderLogos from "@/components/ProviderLogos";
import { useAuth } from "@/context/AuthContext";
import { posterUrl } from "@/lib/tmdb";
import RatingBadge from "@/components/RatingBadge";
import WatchlistSettings from "@/components/WatchlistSettings";
import WatchlistStats from "@/components/WatchlistStats";
import TextareaWithEmoji from "@/components/TextareaWithEmoji";
import { useTouchReveal } from "@/hooks/useTouchReveal";
import TapHoldHint from "@/components/TapHoldHint";
import FirstVisitHint from "@/components/FirstVisitHint";

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

type SortKey = "custom" | "added" | "title" | "year" | "rating" | "community";
type SeenFilter = "all" | "checked" | "unchecked";

function WatchlistSortableItem({ item, index, total, onMove }: { item: { id: string; title: string; posterPath: string | null; mediaType?: string }; index: number; total: number; onMove: (from: number, to: number) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const [inputVal, setInputVal] = useState("");

  function handleMoveSubmit(e: React.FormEvent) {
    e.preventDefault();
    const num = parseInt(inputVal, 10);
    if (!isNaN(num) && num >= 1 && num <= total) {
      onMove(index, num - 1);
      setInputVal("");
    }
  }

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-2 hover:border-[var(--ratist-red)]/50 transition-colors">
      <span className="text-xs font-bold text-[var(--foreground-muted)] w-6 text-center">{index + 1}</span>
      <div className="flex flex-col shrink-0">
        <button onClick={() => index > 0 && onMove(index, index - 1)} disabled={index === 0}
          className="text-[var(--foreground-muted)] hover:text-white disabled:opacity-20 transition-colors p-0.5 text-xs">▲</button>
        <button onClick={() => index < total - 1 && onMove(index, index + 1)} disabled={index === total - 1}
          className="text-[var(--foreground-muted)] hover:text-white disabled:opacity-20 transition-colors p-0.5 text-xs">▼</button>
      </div>
      <button {...attributes} {...listeners} className="text-[var(--foreground-muted)] hover:text-white cursor-grab active:cursor-grabbing shrink-0 touch-none p-1"
        aria-label="Drag to reorder">
        <GripVertical className="w-4 h-4" />
      </button>
      {item.posterPath && (
        <Image src={posterUrl(item.posterPath, "w92")} alt="" width={28} height={42} className="rounded w-7 h-10 object-cover shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm text-white truncate">{item.title}</p>
          {item.mediaType === "tv" && <span className="text-[8px] font-bold text-blue-400 bg-blue-600/20 px-1 py-0.5 rounded leading-none">TV</span>}
        </div>
      </div>
      <form onSubmit={handleMoveSubmit} className="flex items-center gap-1 shrink-0">
        <input value={inputVal} onChange={(e) => setInputVal(e.target.value)} placeholder="#"
          className="w-10 bg-[var(--surface-2)] border border-[var(--border)] rounded px-1.5 py-1 text-xs text-white text-center focus:outline-none focus:border-[var(--ratist-red)]" />
      </form>
    </div>
  );
}

/**
 * Render-prop shell for a watchlist grid tile. Owns the long-press
 * reveal behavior (and the corresponding pointer-events flip) so the
 * .map can stay readable. The child receives the `overlayClass` to
 * splat onto each of the three corner buttons — keeps the existing
 * tile JSX intact while gating it on hover OR long-press.
 */
function WatchlistTileShell({
  children,
}: {
  children: (overlayClass: string, revealed: boolean) => React.ReactNode;
}) {
  const touch = useTouchReveal();
  const overlayClass = `tile-hover-overlay${touch.revealed ? " revealed" : ""}`;
  return (
    <div className="tile-hover-parent group flex flex-col relative" {...touch.containerProps}>
      {children(overlayClass, touch.revealed)}
    </div>
  );
}

export default function WatchlistPage() {
  const { user } = useAuth();

  /* ── Data state ── */
  const [watchlists, setWatchlists] = useState<WatchlistMeta[]>([]);
  const [activeId, setActiveIdState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try { return sessionStorage.getItem("ratist-watchlist-active") || null; } catch { return null; }
  });
  function setActiveId(id: string | null) {
    setActiveIdState(id);
    try { if (id) sessionStorage.setItem("ratist-watchlist-active", id); else sessionStorage.removeItem("ratist-watchlist-active"); } catch { /* ignore */ }
  }
  const [movies, setMovies] = useState<WatchlistMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMovies, setLoadingMovies] = useState(false);

  /* ── Filter / sort state ── */
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("custom");
  const [sortAsc, setSortAsc] = useState(true);
  const [seenFilter, setSeenFilter] = useState<SeenFilter>("all");
  const [mediaFilter, setMediaFilter] = useState<"all" | "movie" | "tv">("all");
  const [genreFilter, setGenreFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // pinCheckedToBottom is a live setting (settings panel can flip it
  // and we want the list to react). defaultWatchlistFilter is a
  // mount-only seed — once the user is on the page we don't want to
  // yank the filter back if they deliberately changed it in-session.
  const [pinCheckedToBottom, setPinCheckedToBottom] = useState(false);
  const [settingsApplied, setSettingsApplied] = useState(false);
  useEffect(() => {
    if (!user || settingsApplied) return;
    user.getIdToken().then((token) =>
      fetch("/api/me/watchlist-settings", { headers: { Authorization: `Bearer ${token}` } })
    ).then((r) => r.ok ? r.json() : null).then((d) => {
      if (d?.defaultWatchlistFilter === "unwatched") setSeenFilter("unchecked");
      if (typeof d?.pinCheckedToBottom === "boolean") setPinCheckedToBottom(d.pinCheckedToBottom);
      setSettingsApplied(true);
    }).catch(() => setSettingsApplied(true));
  }, [user, settingsApplied]);

  /* ── Reorder mode ── */
  // Open by default; lets users (especially on mobile, where the
  // sidebar stacks above the active list) hide the list switcher
  // when they have many lists and want to focus on items below.
  const [listsExpanded, setListsExpanded] = useState(true);

  const [reorderMode, setReorderMode] = useState(false);
  const [reorderItems, setReorderItems] = useState<WatchlistMovie[]>([]);
  const reorderSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function enterReorder() {
    setReorderItems([...movies].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
    setReorderMode(true);
  }

  function moveItem(from: number, to: number) {
    setReorderItems((items) => {
      const arr = [...items];
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      return arr;
    });
  }

  function handleReorderDragEnd(event: { active: { id: string | number }; over: { id: string | number } | null }) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setReorderItems((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        const arr = [...items];
        const [moved] = arr.splice(oldIndex, 1);
        arr.splice(newIndex, 0, moved);
        return arr;
      });
    }
  }

  async function saveReorder() {
    if (!user || !activeId) return;
    const token = await user.getIdToken();
    await fetch(`/api/watchlist/${activeId}/reorder`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ items: reorderItems.map((m) => ({ id: m.id, mediaType: m.mediaType ?? "movie" })) }),
    });
    setReorderMode(false);
    setSortKey("custom");
    // Refresh
    setLoadingMovies(true);
    const res = await fetch(`/api/watchlist/${activeId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) { const data = await res.json(); setMovies(data.movies ?? []); }
    setLoadingMovies(false);
  }

  /* ── Streaming state ── */
  const [showStreaming, setShowStreaming] = useState(false);
  const [selectedProviders, setSelectedProviders] = useState<Set<string>>(new Set());
  const [providerData, setProviderData] = useState<Record<string, { flatrate: { name: string; logo: string }[]; rent: { name: string; logo: string }[] }>>({});
  const [loadingProviders, setLoadingProviders] = useState(false);

  // Fetch providers when streaming toggle is on. The /api/providers
  // endpoint caps each request at 30 items (TMDB rate-limit headroom),
  // so we chunk client-side and merge results as they come in.
  useEffect(() => {
    if (!showStreaming || movies.length === 0) return;
    // Only fetch for movies we don't already have data for
    const needed = movies.filter((m) => !providerData[`${m.mediaType ?? "movie"}-${m.tmdbId}`]);
    if (needed.length === 0) return;
    setLoadingProviders(true);
    let cancelled = false;
    (async () => {
      const CHUNK = 30;
      for (let i = 0; i < needed.length; i += CHUNK) {
        if (cancelled) return;
        const slice = needed.slice(i, i + CHUNK);
        try {
          const r = await fetch("/api/providers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: slice.map((m) => ({ tmdbId: m.tmdbId, mediaType: m.mediaType ?? "movie" })) }),
          });
          if (!r.ok || cancelled) continue;
          const data = await r.json();
          if (cancelled) return;
          setProviderData((prev) => ({ ...prev, ...(data.providers ?? {}) }));
        } catch { /* swallow — next chunk continues */ }
      }
      if (!cancelled) setLoadingProviders(false);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showStreaming, movies.length]);

  function toggleProvider(providerShort: string) {
    setSelectedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(providerShort)) next.delete(providerShort); else next.add(providerShort);
      // Auto-enable streaming display when a provider is selected
      if (next.size > 0 && !showStreaming) setShowStreaming(true);
      if (next.size === 0) setShowStreaming(false);
      return next;
    });
  }

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
  // Duplicate flow — copies the entire list (incl. checked items) into a
  // brand-new watchlist owned by the current user. Works on the default
  // list too, unlike Edit/Delete which are gated behind isDefault.
  const [showStats, setShowStats] = useState(false);
  const [showIconKey, setShowIconKey] = useState(false);
  const [showDuplicate, setShowDuplicate] = useState(false);
  const [dupName, setDupName] = useState("");
  const [dupPrivate, setDupPrivate] = useState(false);
  const [dupIncludeChecked, setDupIncludeChecked] = useState(true);
  const [dupSubmitting, setDupSubmitting] = useState(false);
  const [dupError, setDupError] = useState("");
  const router = useRouter();
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

  /* ── Error / success banners ── */
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function showError(msg: string) { setError(msg); setTimeout(() => setError(null), 5000); }
  function showSuccess(msg: string) { setSuccess(msg); setTimeout(() => setSuccess(null), 5000); }

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
      try {
        const token = await getToken();
        if (!token) return;
        const [listRes, inviteRes] = await Promise.all([
          fetch("/api/watchlist", { headers: { Authorization: `Bearer ${token}` } }),
          fetch("/api/watchlist/invites", { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        if (!listRes.ok) { showError("Failed to load watchlists."); setLoading(false); return; }
        if (!inviteRes.ok) { showError("Failed to load invites."); }
        const data = await listRes.json();
        const inviteData = inviteRes.ok ? await inviteRes.json() : { invites: [] };
        setWatchlists(data.watchlists ?? []);
        setPendingInvites(inviteData.invites ?? []);
        // Honor the sessionStorage-restored activeId so navigating to
        // a movie/show from inside a custom list and coming back lands
        // the user where they left off, not on the default list.
        // Falls through to the default when there's nothing
        // persisted, when the persisted ID is stale (list was deleted
        // / collaborator removed), or when the user is loading the
        // page for the first time.
        const lists: WatchlistMeta[] = data.watchlists ?? [];
        const def = lists.find((w) => w.isDefault);
        const persisted = activeId ? lists.find((w) => w.id === activeId) : null;
        const target = persisted ?? def ?? null;
        if (target) {
          if (target.isDefault) {
            setMovies(data.defaultMovies ?? []);
            setActiveId(target.id);
          } else {
            // Need a separate fetch for non-default lists since the
            // bulk endpoint only ships the default's items.
            setActiveId(target.id);
            setLoadingMovies(true);
            try {
              const detailRes = await fetch(`/api/watchlist/${target.id}`, { headers: { Authorization: `Bearer ${token}` } });
              if (detailRes.ok) {
                const detail = await detailRes.json();
                setMovies(detail.movies ?? []);
              }
            } finally {
              setLoadingMovies(false);
            }
          }
        } else {
          setMovies(data.defaultMovies ?? []);
        }
      } catch { showError("Failed to load watchlists."); }
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
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/watchlist/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { showError("Failed to load list."); setLoadingMovies(false); return; }
      const data = await res.json();
      setMovies(data.movies ?? []);
    } catch { showError("Failed to load list."); }
    setLoadingMovies(false);
  }

  /* ── Create watchlist ── */
  async function createWatchlist() {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || null, isPrivate: newPrivate }),
      });
      if (!res.ok) { showError("Failed to create watchlist."); setCreating(false); return; }
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
    } catch { showError("Failed to create watchlist."); }
    setCreating(false);
  }

  /* ── Edit watchlist ── */
  async function saveEdit() {
    if (!activeId) return;
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/watchlist/${activeId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), description: editDesc.trim() || null, isPrivate: editPrivate }),
      });
      if (!res.ok) { showError("Failed to save list changes."); return; }
      setWatchlists((prev) => prev.map((w) => w.id === activeId ? { ...w, name: editName.trim(), description: editDesc.trim() || null, isPrivate: editPrivate } : w));
      setEditingList(false);
    } catch { showError("Failed to save list changes."); }
  }

  /* ── Delete watchlist ── */
  async function deleteWatchlist() {
    if (!activeId) return;
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/watchlist/${activeId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { showError("Failed to delete watchlist."); return; }
      setWatchlists((prev) => prev.filter((w) => w.id !== activeId));
      const def = watchlists.find((w) => w.isDefault);
      if (def) { setActiveId(def.id); loadList(def.id); }
      setShowDeleteConfirm(false);
    } catch { showError("Failed to delete watchlist."); }
  }

  /* ── Collaborator management ── */
  async function openCollaborators() {
    if (!activeId) return;
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/watchlist/${activeId}/collaborators`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { showError("Failed to load collaborators."); return; }
      const data = await res.json();
      setCollaborators(data.collaborators ?? []);
      setInviteCode("");
      setInviteError("");
      setShowCollaborators(true);
    } catch { showError("Failed to load collaborators."); }
  }

  async function inviteByCode() {
    if (!activeId || !inviteCode.trim() || inviting) return;
    setInviting(true);
    setInviteError("");
    try {
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
    } catch { setInviteError("Failed to send invite."); }
    setInviting(false);
  }

  async function respondToInvite(watchlistId: string, action: "accept" | "decline") {
    setRespondingTo(watchlistId);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/watchlist/${watchlistId}/collaborators`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) { showError(`Failed to ${action} invite.`); setRespondingTo(null); return; }
      setPendingInvites((prev) => prev.filter((i) => i.watchlistId !== watchlistId));
      if (action === "accept") {
        const listRes = await fetch("/api/watchlist", { headers: { Authorization: `Bearer ${token}` } });
        if (listRes.ok) {
          const data = await listRes.json();
          setWatchlists(data.watchlists ?? []);
        }
      }
    } catch { showError(`Failed to ${action} invite.`); }
    setRespondingTo(null);
  }

  async function changeRole(userId: string, role: string) {
    if (!activeId) return;
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/watchlist/${activeId}/collaborators`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
      });
      if (!res.ok) { showError("Failed to change role."); return; }
      setCollaborators((prev) => prev.map((c) => c.userId === userId ? { ...c, role } : c));
    } catch { showError("Failed to change role."); }
  }

  async function removeCollaborator(userId: string) {
    if (!activeId) return;
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/watchlist/${activeId}/collaborators`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) { showError("Failed to remove collaborator."); return; }
      setCollaborators((prev) => prev.filter((c) => c.userId !== userId));
      setWatchlists((prev) => prev.map((w) => w.id === activeId ? { ...w, collaboratorCount: w.collaboratorCount - 1 } : w));
    } catch { showError("Failed to remove collaborator."); }
  }

  async function leaveList() {
    if (!activeId || !user) return;
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/watchlist/${activeId}/collaborators`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.uid }),
      });
      if (!res.ok) { showError("Failed to leave list."); return; }
      setWatchlists((prev) => prev.filter((w) => w.id !== activeId));
      const def = watchlists.find((w) => w.isDefault);
      if (def) { setActiveId(def.id); loadList(def.id); }
    } catch { showError("Failed to leave list."); }
  }

  /* ── Duplicate (copy entire list incl. checked items) ── */
  function openDuplicate() {
    if (!activeList) return;
    setDupName(`Copy of ${activeList.name}`);
    setDupPrivate(activeList.isPrivate);
    setDupIncludeChecked(true);
    setDupError("");
    setShowDuplicate(true);
  }
  async function submitDuplicate() {
    if (!activeList || !user || dupSubmitting) return;
    if (!dupName.trim()) { setDupError("Name is required"); return; }
    setDupSubmitting(true);
    setDupError("");
    try {
      const token = await getToken();
      if (!token) { setDupError("Sign in required"); setDupSubmitting(false); return; }
      const res = await fetch(`/api/watchlist/${activeList.id}/copy`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: dupName.trim(),
          isPrivate: dupPrivate,
          includeChecked: dupIncludeChecked,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setDupError(data.error ?? `Failed to duplicate (${res.status})`); setDupSubmitting(false); return; }
      // Refetch the watchlists index so the new list shows up in the
      // sidebar BEFORE we flip active to it. The /copy response only
      // returns {id, slug, name} — not enough to reconstruct a full
      // WatchlistMeta — so we'd otherwise leave the sidebar stale.
      const listsRes = await fetch("/api/watchlist", { headers: { Authorization: `Bearer ${token}` } });
      if (listsRes.ok) {
        const listsData = await listsRes.json();
        setWatchlists(listsData.watchlists ?? []);
      }
      setShowDuplicate(false);
      // Open the new list. loadList() handles setActiveId (persisted to
      // sessionStorage so back-from-movie returns here) and fetches the
      // items grid. We need this rather than a bare setActiveId because
      // there's no useEffect that watches activeId to load movies.
      await loadList(data.watchlist.id);
    } catch {
      setDupError("Network error — please try again.");
    } finally {
      setDupSubmitting(false);
    }
  }

  /* ── Export to rankings ── */
  async function exportToRankings() {
    if (!activeList || !user) return;
    const name = prompt("Name for your custom rankings list:", activeList.name);
    if (!name?.trim()) return;
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch("/api/tools/rankings/lists", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), fromWatchlistId: activeList.id }),
      });
      if (!res.ok) { showError("Failed to export to rankings."); return; }
      showSuccess(`Rankings list "${name}" created! Find it on the Rankings page.`);
    } catch { showError("Failed to export to rankings."); }
  }

  /* ── Remove movie ── */
  async function confirmRemove(movie: WatchlistMovie) {
    if (!activeId) return;
    setConfirmingRemove(null);
    setRemoving((prev) => new Set(prev).add(movie.id));
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/watchlist/${activeId}/movies/${movie.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setMovies((prev) => prev.filter((m) => m.id !== movie.id));
        setWatchlists((prev) => prev.map((w) => w.id === activeId ? { ...w, movieCount: w.movieCount - 1 } : w));
      } else { showError("Failed to remove movie."); }
    } catch { showError("Failed to remove movie."); }
    setRemoving((prev) => { const s = new Set(prev); s.delete(movie.id); return s; });
  }

  /* ── Toggle check-off ── */
  async function toggleCheck(movie: WatchlistMovie) {
    if (!activeId) return;
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/watchlist/${activeId}/movies/${movie.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMovies((prev) => prev.map((m) => m.id === movie.id ? { ...m, isChecked: data.isChecked, checkedAt: data.checkedAt } : m));

        // When autoSeenOnWatchlistCheck fired (markedAsSeen=true),
        // open the date prompt. For movies, lets the user override
        // or clear the auto-set watch date. For shows, just shows
        // a hint about season/episode tracking. The row is dropped
        // (if applicable) only after the prompt is dismissed.
        if (data.markedAsSeen) {
          setSeenPrompt({
            entryId: movie.id,
            mediaType: data.mediaType,
            tmdbId: data.tmdbId,
            initialDate: data.watchedDate ? String(data.watchedDate).slice(0, 10) : "",
            removedFromActiveList: !!data.removedFromActiveList,
          });
        }
      } else { showError("Failed to update watched status."); }
    } catch { showError("Failed to update watched status."); }
  }

  /* ── Date prompt after auto-mark-seen ── */
  interface SeenPrompt {
    entryId: string;
    mediaType: "movie" | "tv";
    tmdbId: number;
    initialDate: string; // YYYY-MM-DD or ""
    removedFromActiveList: boolean;
  }
  const [seenPrompt, setSeenPrompt] = useState<SeenPrompt | null>(null);

  async function closeSeenPrompt(opts?: { saveDate?: string | null }) {
    const prompt = seenPrompt;
    if (!prompt) return;
    setSeenPrompt(null);

    // For movies, optionally PATCH the watch date the user picked.
    // The server already created the favorite with autoDateOnSeen's
    // value; this only matters if the user actually adjusted it.
    if (prompt.mediaType === "movie" && opts && "saveDate" in opts) {
      try {
        const token = await getToken();
        if (token) {
          await fetch(`/api/movies/${prompt.tmdbId}/seen`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ watchedDate: opts.saveDate }),
          });
        }
      } catch { /* non-critical */ }
    }

    if (prompt.removedFromActiveList) {
      setMovies((prev) => prev.filter((m) => m.id !== prompt.entryId));
    }
  }

  /* ── Add movie/show search ── */
  useEffect(() => {
    if (addMovieQuery.length < 2) { setAddMovieResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const q = encodeURIComponent(addMovieQuery);
        const [movieRes, tvRes] = await Promise.all([
          fetch(`/api/tmdb/movie/search?q=${q}`),
          fetch(`/api/tmdb/tv/search?q=${q}`),
        ]);
        if (!movieRes.ok && !tvRes.ok) { showError("Search failed."); return; }
        const movieData = movieRes.ok ? await movieRes.json() : { results: [] };
        const tvData = tvRes.ok ? await tvRes.json() : { results: [] };
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
      } catch { showError("Search failed."); }
    }, 300);
    return () => clearTimeout(t);
  }, [addMovieQuery]);

  async function addMovieToList(m: { id: number; title: string; posterPath: string | null; releaseDate: string; mediaType: "movie" | "tv" }) {
    if (!user || !activeList || addingMovie) return;
    setAddingMovie(m.id);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/watchlist/${activeList.id}/movies`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ tmdbId: m.id, title: m.title, posterPath: m.posterPath, releaseDate: m.releaseDate, mediaType: m.mediaType }),
      });
      if (!res.ok) { showError("Failed to add to list."); setAddingMovie(null); return; }
      setAddMovieQuery("");
      setAddMovieResults([]);
      // Refresh movies for current list
      const token2 = await user.getIdToken();
      const res2 = await fetch(`/api/watchlist/${activeList.id}`, { headers: { Authorization: `Bearer ${token2}` } });
      if (res2.ok) {
        const data2 = await res2.json();
        setMovies(data2.movies ?? []);
      }
      // Update list count
      setWatchlists((prev) => prev.map((l) => l.id === activeList.id ? { ...l, movieCount: l.movieCount + 1 } : l));
    } catch { showError("Failed to add to list."); }
    setAddingMovie(null);
  }

  /* ── List picker for adding movie to other lists ── */
  async function openListPicker(movie: WatchlistMovie) {
    setListPickerMovie(movie);
    try {
      const token = await getToken();
      if (!token) return;
      const endpoint = (movie.mediaType === "tv") ? `/api/shows/${movie.tmdbId}/watchlist` : `/api/movies/${movie.tmdbId}/watchlist`;
      const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { showError("Failed to load list info."); setListPickerMovie(null); return; }
      const data = await res.json();
      setMovieLists(data.lists ?? []);
    } catch { showError("Failed to load list info."); setListPickerMovie(null); }
  }

  async function toggleMovieList(listId: string) {
    if (!listPickerMovie) return;
    setTogglingListId(listId);
    try {
      const token = await getToken();
      if (!token) return;
      const list = movieLists.find((l) => l.id === listId);
      if (!list) { setTogglingListId(null); return; }

      if (list.hasMovie) {
        const res = await fetch(`/api/watchlist/${listId}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) { showError("Failed to update list."); setTogglingListId(null); return; }
        const data = await res.json();
        const entry = data.movies?.find((m: { tmdbId: number }) => m.tmdbId === listPickerMovie.tmdbId);
        if (entry) {
          const delRes = await fetch(`/api/watchlist/${listId}/movies/${entry.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
          if (!delRes.ok) { showError("Failed to remove from list."); setTogglingListId(null); return; }
        }
        setMovieLists((prev) => prev.map((l) => l.id === listId ? { ...l, hasMovie: false } : l));
        if (listId === activeId) {
          setMovies((prev) => prev.filter((m) => m.tmdbId !== listPickerMovie.tmdbId));
          setWatchlists((prev) => prev.map((w) => w.id === activeId ? { ...w, movieCount: w.movieCount - 1 } : w));
        }
      } else {
        const addRes = await fetch(`/api/watchlist/${listId}/movies`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ tmdbId: listPickerMovie.tmdbId, title: listPickerMovie.title, posterPath: listPickerMovie.posterPath, mediaType: listPickerMovie.mediaType }),
        });
        if (!addRes.ok) { showError("Failed to add to list."); setTogglingListId(null); return; }
        setMovieLists((prev) => prev.map((l) => l.id === listId ? { ...l, hasMovie: true } : l));
        setWatchlists((prev) => prev.map((w) => w.id === listId ? { ...w, movieCount: w.movieCount + 1 } : w));
      }
    } catch { showError("Failed to update list."); }
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

    // Filter by selected streaming providers
    if (selectedProviders.size > 0) {
      const providerNames = new Set<string>();
      for (const short of selectedProviders) {
        const sp = STREAMING_PROVIDERS.find((p) => p.short === short);
        if (sp) providerNames.add(sp.name);
      }
      list = list.filter((m) => {
        const key = `${m.mediaType ?? "movie"}-${m.tmdbId}`;
        const pd = providerData[key];
        if (!pd) return false;
        return pd.flatrate.some((p) => providerNames.has(p.name)) || pd.rent.some((p) => providerNames.has(p.name));
      });
    }

    // Secondary sort: pin checked items below unchecked ones,
    // regardless of the active sort key. Skipped when the user is
    // explicitly viewing only checked items (everything would be
    // checked, so the pass is a no-op anyway). This is purely a
    // display sort — sortOrder values on rows are untouched, so
    // reorder mode still reflects the user's true custom order.
    const applyPin = pinCheckedToBottom && seenFilter !== "checked";

    list = [...list].sort((a, b) => {
      if (applyPin && a.isChecked !== b.isChecked) {
        return a.isChecked ? 1 : -1;
      }
      let cmp = 0;
      switch (sortKey) {
        case "custom": cmp = (a.sortOrder ?? 0) - (b.sortOrder ?? 0); break;
        case "title": cmp = a.title.localeCompare(b.title); break;
        case "year": cmp = (a.year || "").localeCompare(b.year || ""); break;
        case "rating": cmp = (a.ratistRating ?? a.estimatedRating ?? -1) - (b.ratistRating ?? b.estimatedRating ?? -1); break;
        case "community": cmp = (a.voteAverage ?? -1) - (b.voteAverage ?? -1); break;
        default: cmp = new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime();
      }
      return sortAsc ? cmp : -cmp;
    });

    return list;
  }, [movies, query, seenFilter, mediaFilter, genreFilter, sortKey, sortAsc, selectedProviders, providerData, pinCheckedToBottom]);

  const canEdit = activeList ? (activeList.isOwner || activeList.myRole === "editor") : false;
  const checkedCount = movies.filter((m) => m.isChecked).length;
  const uncheckedCount = movies.length - checkedCount;

  // Count of currently-applied filters. Surfaced as a badge on the
  // filter button so users (especially those with the "default to
  // unwatched" setting on) don't get confused when items appear to
  // be missing. Search query is intentionally excluded — the input
  // is always visible, hard to forget about.
  const activeFilterCount =
    (seenFilter !== "all" ? 1 : 0) +
    (mediaFilter !== "all" ? 1 : 0) +
    (genreFilter ? 1 : 0) +
    (selectedProviders.size > 0 ? 1 : 0);

  function clearAllFilters() {
    setSeenFilter("all");
    setMediaFilter("all");
    setGenreFilter("");
    setSelectedProviders(new Set());
    setShowStreaming(false);
  }

  /* ── Render ── */
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-3">
          <Bookmark className="w-6 h-6 text-[var(--ratist-red)]" />
          <h1 className="text-2xl font-bold text-white">My Watchlists</h1>
        </div>
        <WatchlistSettings onChange={(s) => setPinCheckedToBottom(s.pinCheckedToBottom)} />
      </div>
      <p className="text-[var(--foreground-muted)] mb-1">Organize movies &amp; shows you want to watch.</p>
      <div className="mb-6">
        <Link href="/seen" className="text-sm text-[var(--ratist-red)] hover:underline">
          View what you&apos;ve already seen &rarr;
        </Link>
      </div>

      {/* Error / success banners */}
      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-600/10 border border-red-500/30 text-red-400 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-3 hover:text-white transition-colors"><X className="w-4 h-4" /></button>
        </div>
      )}
      {success && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-green-600/10 border border-green-500/30 text-green-400 text-sm flex items-center justify-between">
          <span>{success}</span>
          <button onClick={() => setSuccess(null)} className="ml-3 hover:text-white transition-colors"><X className="w-4 h-4" /></button>
        </div>
      )}

      {!user ? (
        <div className="text-center py-20 text-[var(--foreground-muted)]">
          <SignInLink className="text-[var(--ratist-red)] hover:underline">Sign in</SignInLink> to see your watchlists.
        </div>
      ) : loading ? (
        <p className="text-[var(--foreground-muted)] text-center py-10">Loading&hellip;</p>
      ) : (
        <>
        <div className="flex flex-col lg:flex-row gap-6">
          {/* ── Sidebar: list switcher ── */}
          <div className="lg:w-56 shrink-0">
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => setListsExpanded((v) => !v)}
                className="flex items-center gap-1.5 text-sm font-semibold text-white hover:text-[var(--ratist-red)] transition-colors"
                aria-expanded={listsExpanded}
                aria-controls="watchlist-sidebar-lists"
              >
                <ChevronDown className={`w-4 h-4 transition-transform ${listsExpanded ? "" : "-rotate-90"}`} />
                Lists
                <span className="text-xs font-normal text-[var(--foreground-muted)]">({watchlists.length})</span>
              </button>
              <button onClick={() => setShowCreate(true)} className="text-[var(--ratist-red)] hover:text-white transition-colors" title="Create new list">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            {listsExpanded && (
            <div id="watchlist-sidebar-lists">
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
                  <TextareaWithEmoji
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
                      {activeList.isDefault && activeList.isOwner && (
                        <button
                          onClick={async () => {
                            if (!user) return;
                            const token = await user.getIdToken();
                            const newVal = !activeList.isPrivate;
                            await fetch(`/api/watchlist/${activeList.id}`, {
                              method: "PATCH",
                              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                              body: JSON.stringify({ isPrivate: newVal }),
                            });
                            setWatchlists((prev) => prev.map((w) => w.id === activeList.id ? { ...w, isPrivate: newVal } : w));
                          }}
                          className="text-[10px] px-2 py-0.5 rounded-full border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white hover:border-[var(--ratist-red)] transition-colors"
                          title={activeList.isPrivate ? "Make public" : "Make private"}
                        >
                          {activeList.isPrivate ? "Make public" : "Make private"}
                        </button>
                      )}
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
                  {(movies.length > 0 || activeList.isOwner || !activeList.isDefault) && (
                    // Action button row. Order: help, edit, collaborators,
                    // duplicate, save as collection, export to rankings,
                    // reorder, stats, delete. Trash is always last; stats
                    // sits next to it. Icons gate on ownership and list
                    // type — we keep the gating but render them in the
                    // user-requested visual order regardless.
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowIconKey(true)}
                        className="p-2 rounded-lg text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--surface)] transition-colors"
                        title="What do these icons mean?"
                        aria-label="Icon key"
                      >
                        <HelpCircle className="w-4 h-4" />
                      </button>
                      {activeList.isOwner && !activeList.isDefault && (
                        <button
                          onClick={() => { setEditingList(true); setEditName(activeList.name); setEditDesc(activeList.description ?? ""); setEditPrivate(activeList.isPrivate); }}
                          className="p-2 rounded-lg text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--surface)] transition-colors"
                          title="Edit list"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                      {activeList.isOwner && !activeList.isDefault && (
                        <button
                          onClick={openCollaborators}
                          className="p-2 rounded-lg text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--surface)] transition-colors"
                          title="Manage collaborators"
                        >
                          <Users className="w-4 h-4" />
                        </button>
                      )}
                      {activeList.isOwner && (
                        <button
                          onClick={openDuplicate}
                          className="p-2 rounded-lg text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--surface)] transition-colors"
                          title="Duplicate list"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      )}
                      {activeList.isOwner && movies.length > 0 && (
                        <Link
                          href={`/tools/collections/new?from=watchlist&id=${activeList.id}`}
                          className="p-2 rounded-lg text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] hover:bg-[var(--surface)] transition-colors"
                          title="Save as collection"
                        >
                          <Layers className="w-4 h-4" />
                        </Link>
                      )}
                      {activeList.isOwner && !activeList.isDefault && (
                        <button
                          onClick={exportToRankings}
                          className="p-2 rounded-lg text-[var(--foreground-muted)] hover:text-purple-400 hover:bg-[var(--surface)] transition-colors"
                          title="Export to Rankings"
                        >
                          <Star className="w-4 h-4" />
                        </button>
                      )}
                      {activeList.isOwner && !activeList.isDefault && (
                        <button
                          onClick={enterReorder}
                          className="p-2 rounded-lg text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] hover:bg-[var(--surface)] transition-colors"
                          title="Reorder items"
                        >
                          <ListOrdered className="w-4 h-4" />
                        </button>
                      )}
                      {movies.length > 0 && (
                        <button
                          onClick={() => setShowStats(true)}
                          className="p-2 rounded-lg text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] hover:bg-[var(--surface)] transition-colors"
                          title="Stats"
                        >
                          <BarChart3 className="w-4 h-4" />
                        </button>
                      )}
                      {activeList.isOwner && !activeList.isDefault && (
                        <button
                          onClick={() => setShowDeleteConfirm(true)}
                          className="p-2 rounded-lg text-[var(--foreground-muted)] hover:text-red-400 hover:bg-[var(--surface)] transition-colors"
                          title="Delete list"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      {!activeList.isOwner && !activeList.isDefault && (
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
                        <option value="custom">Custom Order</option>
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
                      onClick={enterReorder}
                      className="p-2 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] transition-colors"
                      title="Reorder items"
                    >
                      <ListOrdered className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => setShowFilters(!showFilters)}
                      className={`relative p-2 border rounded-xl transition-colors ${showFilters || activeFilterCount > 0 ? "bg-[var(--ratist-red)]/10 border-[var(--ratist-red)]/30 text-[var(--ratist-red)]" : "bg-[var(--surface)] border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"}`}
                      title={activeFilterCount > 0 ? `${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"} applied` : "Filters"}
                    >
                      <SlidersHorizontal className="w-4 h-4" />
                      {activeFilterCount > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 bg-[var(--ratist-red)] text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center leading-none">
                          {activeFilterCount}
                        </span>
                      )}
                    </button>

                    {activeFilterCount > 0 && (
                      <button
                        onClick={clearAllFilters}
                        className="p-2 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] hover:border-[var(--ratist-red)]/40 transition-colors"
                        title="Clear filters"
                        aria-label="Clear filters"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
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
                    {/* Streaming */}
                    <div className="w-full border-t border-[var(--border)] pt-3 mt-1">
                      <div className="flex items-center gap-3 mb-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <div
                            onClick={() => { setShowStreaming(!showStreaming); if (showStreaming) setSelectedProviders(new Set()); }}
                            className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${showStreaming ? "bg-[var(--ratist-red)]" : "bg-[var(--surface-2)] border border-[var(--border)]"}`}
                          >
                            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${showStreaming ? "translate-x-4" : ""}`} />
                          </div>
                          <span className="text-xs text-[var(--foreground-muted)]">Show streaming</span>
                        </label>
                        {loadingProviders && <span className="text-xs text-[var(--foreground-muted)]">Loading...</span>}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {STREAMING_PROVIDERS.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => toggleProvider(p.short as string)}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                              selectedProviders.has(p.short as string)
                                ? "bg-[var(--ratist-red)]/10 border border-[var(--ratist-red)]/40 text-white"
                                : "border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"
                            }`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={`https://image.tmdb.org/t/p/w45${p.logo}`} alt="" className="w-4 h-4 rounded" />
                            {p.short}
                          </button>
                        ))}
                      </div>
                    </div>
                    {activeFilterCount > 0 && (
                      <button onClick={clearAllFilters} className="self-end text-xs text-[var(--ratist-red)] hover:underline pb-1">
                        Clear filters
                      </button>
                    )}
                  </div>
                )}

                {/* Reorder mode with drag-and-drop */}
                {reorderMode && (
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-white">Reorder Items — drag to move or use arrows</h3>
                      <div className="flex gap-2">
                        <button onClick={saveReorder} className="px-3 py-1.5 bg-[var(--ratist-red)] text-white text-xs font-semibold rounded-lg hover:bg-[var(--ratist-red-hover)] transition-colors">
                          Save Order
                        </button>
                        <button onClick={() => setReorderMode(false)} className="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] text-xs text-[var(--foreground-muted)] rounded-lg hover:text-white transition-colors">
                          Cancel
                        </button>
                      </div>
                    </div>
                    <DndContext sensors={reorderSensors} collisionDetection={closestCenter} onDragEnd={handleReorderDragEnd}>
                      <SortableContext items={reorderItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-1">
                          {reorderItems.map((item, idx) => (
                            <WatchlistSortableItem key={item.id} item={item} index={idx} total={reorderItems.length} onMove={moveItem} />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  </div>
                )}

                {/* Movie grid */}
                {reorderMode ? null : loadingMovies ? (
                  <p className="text-[var(--foreground-muted)] text-center py-10">Loading&hellip;</p>
                ) : filtered.length === 0 ? (
                  <>
                    {movies.length === 0 && (
                      <FirstVisitHint
                        storageKey="watchlist-empty"
                        icon={Bookmark}
                        title="Your Watchlist"
                        cta={{ label: "Browse movies", href: "/movies" }}
                      >
                        Bookmark anything you want to come back to. We&rsquo;ll show where it&rsquo;s currently streaming so you don&rsquo;t have to google it. Reorder by priority, mark Seen when you watch, or build a second list (Rewatch shelf, Guys&rsquo; Night) and invite collaborators to fill it together.
                      </FirstVisitHint>
                    )}
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
                  </>
                ) : (
                  <>
                  <TapHoldHint pageKey="watchlist" message="Tip: tap and hold a tile to reveal actions like checking it off or removing it." />
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
                    {filtered.map((movie) => (
                      <WatchlistTileShell key={movie.id}>
                        {(overlayClass, revealed) => (<>
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
                              className={`absolute -top-2 -right-2 z-20 w-9 h-9 rounded-full bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center hover:bg-red-600 hover:border-red-600 transition-all ${overlayClass}`}
                              title="Remove from list"
                            >
                              <X className="w-5 h-5 text-[var(--foreground-muted)] hover:text-white" />
                            </button>
                            {/* Add to other lists — top center */}
                            {watchlists.length > 1 && (
                              <button
                                onClick={() => openListPicker(movie)}
                                className={`absolute -top-2 left-1/2 -translate-x-1/2 z-20 w-9 h-9 rounded-full bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center hover:bg-blue-600 hover:border-blue-600 transition-all ${overlayClass}`}
                                title="Add to other lists"
                              >
                                <ListPlus className="w-5 h-5 text-[var(--foreground-muted)] hover:text-white" />
                              </button>
                            )}
                            {/* Check-off button. When already checked it
                                stays visible as a status indicator
                                regardless of hover/long-press; otherwise
                                follows the same reveal rule as the
                                other corner buttons. */}
                            <button
                              onClick={() => toggleCheck(movie)}
                              className={`absolute -top-2 -left-2 z-20 w-9 h-9 rounded-full border flex items-center justify-center transition-all ${
                                movie.isChecked
                                  ? "bg-green-600 border-green-600 text-white opacity-100 pointer-events-auto"
                                  : `bg-[var(--surface-2)] border-[var(--border)] hover:bg-green-600 hover:border-green-600 ${overlayClass}`
                              }`}
                              title={movie.isChecked ? "Unmark as watched" : "Mark as watched"}
                            >
                              <Check className={`w-5 h-5 ${movie.isChecked ? "text-white" : "text-[var(--foreground-muted)] hover:text-white"}`} />
                            </button>
                          </>
                        ) : null}

                        <Link href={`/${movie.mediaType === "tv" ? "shows" : "movies"}/${movie.tmdbId}`} className={`flex flex-col ${movie.isChecked ? "opacity-60" : ""}`}>
                          <div className={`relative aspect-[2/3] rounded-lg overflow-hidden bg-[var(--surface-2)] border transition-colors mb-1.5 ${
                            movie.isChecked ? "border-green-500/30" : "border-[var(--border)] group-hover:border-[var(--ratist-red)]"
                          }`}>
                            <Image src={movie.posterPath ? posterUrl(movie.posterPath, "w185") : "/placeholder-poster.svg"} alt={movie.title} fill sizes="120px" className="object-cover" />
                            {movie.mediaType === "tv" && !revealed && (
                              // Hidden while the long-press overlay is
                              // revealed because the check-off button
                              // sits in the same top-left corner; the
                              // overlap was making the TV chip look
                              // like it was on top of the action.
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
                          {showStreaming && (() => {
                            const pd = providerData[`${movie.mediaType ?? "movie"}-${movie.tmdbId}`];
                            if (!pd) return null;
                            const stream = pd.flatrate;
                            const rent = pd.rent;
                            return stream.length > 0 ? (
                              <div className="mt-0.5"><ProviderLogos providers={stream} size={16} label="Stream" contentTitle={movie.title} contentType={movie.mediaType === "tv" ? "tv" : "movie"} /></div>
                            ) : rent.length > 0 ? (
                              <div className="mt-0.5"><ProviderLogos providers={rent} size={16} label="Rent" contentTitle={movie.title} contentType={movie.mediaType === "tv" ? "tv" : "movie"} /></div>
                            ) : null;
                          })()}
                        </Link>
                        </>)}
                      </WatchlistTileShell>
                    ))}
                  </div>
                  </>
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
            <TextareaWithEmoji
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

      {/* Stats modal */}
      {activeList && (
        <WatchlistStats watchlistId={activeList.id} open={showStats} onClose={() => setShowStats(false)} />
      )}

      {/* Duplicate modal */}
      {showDuplicate && activeList && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget && !dupSubmitting) setShowDuplicate(false); }}>
          <div className="w-full max-w-md bg-[var(--background)] border border-[var(--border)] rounded-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Copy className="w-4 h-4 text-[var(--ratist-red)]" /> Duplicate watchlist
              </h2>
              <button onClick={() => !dupSubmitting && setShowDuplicate(false)} className="text-[var(--foreground-muted)] hover:text-white" disabled={dupSubmitting}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-[var(--foreground-muted)]">
                Creates a new list on your account with the items from &ldquo;{activeList.name}&rdquo;.
              </p>
              <div>
                <label className="block text-sm font-medium text-[var(--foreground-muted)] mb-1.5">Name</label>
                <input
                  value={dupName}
                  onChange={(e) => setDupName(e.target.value)}
                  maxLength={80}
                  autoFocus
                  className="w-full bg-[var(--surface)] border border-[var(--border)] text-sm text-white rounded-lg px-3 py-2 focus:outline-none focus:border-[var(--ratist-red)]"
                />
              </div>
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={dupIncludeChecked} onChange={(e) => setDupIncludeChecked(e.target.checked)}
                  className="accent-[var(--ratist-red)] w-3.5 h-3.5 mt-0.5" />
                <span className="text-sm text-[var(--foreground-muted)]">
                  Include items already marked watched
                  <span className="block text-[11px] opacity-70">Uncheck to copy only the unwatched items.</span>
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={dupPrivate} onChange={(e) => setDupPrivate(e.target.checked)}
                  className="accent-[var(--ratist-red)] w-3.5 h-3.5" />
                <span className="text-sm text-[var(--foreground-muted)]">Make private</span>
              </label>
              {dupError && <p className="text-sm text-red-400">{dupError}</p>}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
                <button onClick={() => setShowDuplicate(false)} disabled={dupSubmitting}
                  className="px-3 py-1.5 text-sm text-[var(--foreground-muted)] hover:text-white disabled:opacity-40">Cancel</button>
                <button onClick={submitDuplicate} disabled={dupSubmitting || !dupName.trim()}
                  className="flex items-center gap-1.5 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold px-4 py-2 rounded-full transition-colors disabled:opacity-40">
                  <Check className="w-3.5 h-3.5" />
                  {dupSubmitting ? "Duplicating..." : "Create copy"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Icon key — explains what each watchlist action button does. */}
      {showIconKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowIconKey(false); }}>
          <div className="w-full max-w-md bg-[var(--background)] border border-[var(--border)] rounded-2xl p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-white">Watchlist actions</h3>
              <button onClick={() => setShowIconKey(false)} className="text-[var(--foreground-muted)] hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <ul className="space-y-3">
              {[
                { Icon: Pencil, label: "Edit list", desc: "Change the name, description, or privacy of this list." },
                { Icon: Users, label: "Manage collaborators", desc: "Invite others as editors or viewers." },
                { Icon: Copy, label: "Duplicate list", desc: "Create a brand-new list with a copy of every item." },
                { Icon: Layers, label: "Save as collection", desc: "Publish a curated, taste-scored collection from this list." },
                { Icon: Star, label: "Export to Rankings", desc: "Send this list to a personal ranking you can drag-to-order." },
                { Icon: ListOrdered, label: "Reorder items", desc: "Drag items into your preferred watch order." },
                { Icon: BarChart3, label: "Stats", desc: "Genres, year spread, runtime totals, and other quick metrics." },
                { Icon: Trash2, label: "Delete list", desc: "Permanently remove this list and everything in it.", color: "text-red-400" },
              ].map(({ Icon, label, desc, color }) => (
                <li key={label} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center shrink-0">
                    <Icon className={`w-4 h-4 ${color ?? "text-[var(--foreground-muted)]"}`} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{label}</p>
                    <p className="text-xs text-[var(--foreground-muted)]">{desc}</p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-[var(--foreground-muted)] mt-4">
              Some actions only appear on lists you own (and only on non-default lists for edit / collaborators / delete / reorder).
            </p>
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

      {/* Mark-as-seen prompt: appears after a check-off when
          autoSeenOnWatchlistCheck is enabled. Movies get a date
          picker; shows get an info-only message because
          UserFavoriteShow has no watchedDate column. Dismissing
          via X / outside-click also drops the row from view if
          auto-remove applies to the active list. */}
      {seenPrompt && <SeenPromptModal prompt={seenPrompt} onClose={closeSeenPrompt} />}
    </div>
  );
}

function SeenPromptModal({
  prompt,
  onClose,
}: {
  prompt: { mediaType: "movie" | "tv"; initialDate: string };
  onClose: (opts?: { saveDate?: string | null }) => void;
}) {
  const [date, setDate] = useState(prompt.initialDate);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm bg-[var(--background)] border border-[var(--border)] rounded-t-2xl sm:rounded-2xl p-5">
        <div className="flex items-start justify-between mb-3 gap-3">
          <h3 className="text-base font-semibold text-white">Marked as seen</h3>
          <button
            onClick={() => onClose()}
            className="text-[var(--foreground-muted)] hover:text-white shrink-0"
            aria-label="Dismiss"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {prompt.mediaType === "movie" ? (
          <>
            <p className="text-sm text-[var(--foreground-muted)] mb-3">Set or adjust the watch date.</p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                autoFocus
                className="flex-1 bg-[var(--surface)] border border-[var(--border)] focus:border-[var(--ratist-red)] text-white text-sm rounded-lg px-3 py-2 focus:outline-none [color-scheme:dark]"
              />
              <button
                onClick={() => onClose({ saveDate: date || null })}
                className="text-green-400 hover:text-green-300 transition-colors p-2"
                title="Save date"
                aria-label="Save date"
              >
                <Check className="w-5 h-5" />
              </button>
              {date && (
                <button
                  onClick={() => onClose({ saveDate: null })}
                  className="text-[var(--foreground-muted)] hover:text-red-400 transition-colors p-2"
                  title="Clear date"
                  aria-label="Clear date"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-[var(--foreground-muted)]">
            Visit the show&rsquo;s page to mark season or episode watch dates.
          </p>
        )}
      </div>
    </div>
  );
}
