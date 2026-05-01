"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Search, X, ArrowUp, ArrowDown, Save, Send, Loader2, Tv, Film, Lightbulb, Trash2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import TagInput from "@/components/forum/TagInput";

export interface BuilderItem {
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string | null;
  releaseDate: string | null;
  voteAverage: number | null;
  blurb: string;
}

interface SearchResult {
  id: number;
  title?: string;
  name?: string;
  posterPath: string | null;
  releaseDate?: string;
  firstAirDate?: string;
  voteAverage?: number;
  popularity?: number;
}

export interface BuilderInitialState {
  title?: string;
  description?: string;
  items?: BuilderItem[];
  tags?: string[];
  themePromptId?: string | null;
  isOfficial?: boolean;
  // For edit mode — was the collection already public when we loaded it?
  alreadyPublic?: boolean;
  // Default the publish-to-community toggle to ON. Used by the admin
  // /admin/collections → New Ratist flow so the admin doesn't have to
  // hunt for the toggles every time.
  preferPublish?: boolean;
  // Hide and lock both publish checkboxes — used by the admin Ratist
  // flow where both are implicit. The save action becomes "Save &
  // publish as Ratist" automatically.
  lockOfficial?: boolean;
}

export interface CollectionBuilderProps {
  mode: "create" | "edit";
  collectionId?: string; // required when mode === "edit"
  initialState?: BuilderInitialState;
  // Called after a successful save so the parent page can navigate. The
  // resolved slug is non-null when the save also published; null when the
  // collection stayed private.
  onSaved: (collectionId: string, slug: string | null) => void;
  // Optional delete handler for edit mode — when provided, a Delete
  // button surfaces in the actions area.
  onDelete?: () => Promise<void>;
}

const MAX_ITEMS = 50;
const MIN_ITEMS_TO_PUBLISH = 5;

export default function CollectionBuilder({
  mode,
  collectionId,
  initialState,
  onSaved,
  onDelete,
}: CollectionBuilderProps) {
  const { user } = useAuth();

  const [title, setTitle] = useState(initialState?.title ?? "");
  const [description, setDescription] = useState(initialState?.description ?? "");
  const [items, setItems] = useState<BuilderItem[]>(initialState?.items ?? []);
  const [tags, setTags] = useState<string[]>(initialState?.tags ?? []);
  const [themePromptId, setThemePromptId] = useState<string | null>(initialState?.themePromptId ?? null);
  const [activePrompts, setActivePrompts] = useState<{ id: string; title: string; description: string | null; featured: boolean }[]>([]);
  const [publishAsOfficial, setPublishAsOfficial] = useState(initialState?.isOfficial ?? false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<(SearchResult & { mediaType: "movie" | "tv" })[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [saving, setSaving] = useState(false);
  // In edit mode the toggle reflects current visibility; the save handler
  // diffs against initialState.alreadyPublic to decide publish vs unpublish.
  // preferPublish opts the toggle on for create-time defaults (e.g. admin
  // "New Ratist collection" path) without affecting edit-mode behavior.
  const [publishToCommunity, setPublishToCommunity] = useState(
    initialState?.alreadyPublic ?? initialState?.preferPublish ?? false,
  );
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Active themed prompts — drives the "Responding to a theme?" picker.
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/community-collections/themes", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setActivePrompts(data.prompts ?? []);
        }
      } catch { /* ignore */ }
    })();
  }, [user]);

  // Admin status — gates the "Publish as Ratist" checkbox.
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/auth/admin-check", { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          setIsAdmin(!!data.isAdmin);
        }
      } catch { /* ignore */ }
    })();
  }, [user]);

  // TMDB search across movies + TV.
  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const [movieRes, tvRes] = await Promise.all([
        fetch(`/api/tmdb/movie/search?q=${encodeURIComponent(q)}`).then((r) => r.json()),
        fetch(`/api/tmdb/tv/search?q=${encodeURIComponent(q)}`).then((r) => r.json()),
      ]);
      const movies = (movieRes.results ?? []).map((r: SearchResult) => ({ ...r, mediaType: "movie" as const }));
      const shows = (tvRes.results ?? []).map((r: SearchResult) => ({ ...r, mediaType: "tv" as const }));
      const merged = [...movies, ...shows].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
      setResults(merged);
    } catch {
      setResults([]);
    }
    setSearching(false);
  }, []);

  function handleQueryChange(q: string) {
    setQuery(q);
    setShowDropdown(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(q), 300);
  }

  function addItem(r: SearchResult & { mediaType: "movie" | "tv" }) {
    if (items.length >= MAX_ITEMS) {
      setError(`Collections cap at ${MAX_ITEMS} titles.`);
      return;
    }
    if (items.some((it) => it.tmdbId === r.id && it.mediaType === r.mediaType)) return;
    setItems([...items, {
      tmdbId: r.id, mediaType: r.mediaType,
      title: r.title ?? r.name ?? "Unknown",
      posterPath: r.posterPath,
      releaseDate: r.releaseDate ?? r.firstAirDate ?? null,
      voteAverage: r.voteAverage ?? null,
      blurb: "",
    }]);
    setQuery("");
    setResults([]);
    setShowDropdown(false);
  }

  function removeItem(idx: number) { setItems(items.filter((_, i) => i !== idx)); }
  function moveItem(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[idx], next[target]] = [next[target], next[idx]];
    setItems(next);
  }
  function setBlurb(idx: number, blurb: string) {
    const next = [...items];
    next[idx] = { ...next[idx], blurb };
    setItems(next);
  }

  // Outside-click dismiss for the search dropdown.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setShowDropdown(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const itemsPayload = () => items.map((i) => ({
    mediaType: i.mediaType, tmdbId: i.tmdbId, title: i.title,
    posterPath: i.posterPath, releaseDate: i.releaseDate, voteAverage: i.voteAverage,
    blurb: i.blurb.trim() || null,
  }));

  // Saves the collection. Returns the collection id (existing for edit,
  // new for create) plus the publish slug if the save also flipped public.
  async function save(): Promise<void> {
    if (!user) return;
    if (!title.trim()) { setError("Title is required."); return; }
    if (items.length === 0) { setError("Add at least one title."); return; }
    if (publishToCommunity && items.length < MIN_ITEMS_TO_PUBLISH) {
      setError(`A public collection needs at least ${MIN_ITEMS_TO_PUBLISH} titles.`);
      return;
    }

    setSaving(true);
    setError(null);
    const token = await user.getIdToken();
    let resolvedId = collectionId ?? null;

    try {
      if (mode === "create") {
        const res = await fetch("/api/custom-collections", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            name: title.trim(),
            description: description.trim() || null,
            // Non-AI builder leaves prompt empty.
            prompt: "",
            mediaType: items.length > 0 && items.every((i) => i.mediaType === "tv") ? "tv" : "movie",
            themePromptId,
            // Admin-only: when the builder was opened in official mode,
            // stamp the row as official at creation so it gets filtered
            // out of the personal list immediately. Server still gates on
            // user.isAdmin so non-admins sending this are silently ignored.
            isOfficial: isAdmin && publishAsOfficial,
            // POST doesn't take blurbs/tags; PATCH does. Send items
            // without blurbs here so the row exists, then PATCH them.
            items: itemsPayload().map(({ blurb, ...rest }) => { void blurb; return rest; }),
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? "Failed to save collection.");
          return;
        }
        const data = await res.json();
        resolvedId = data.collection?.id ?? null;
        if (!resolvedId) { setError("Failed to save collection."); return; }
      }

      // Apply blurbs + tags + theme via PATCH. For edit mode this is the
      // entire save. For create mode it's a follow-up that fills in the
      // fields POST didn't accept.
      const patchBody: Record<string, unknown> = {
        name: title.trim(),
        description: description.trim() || null,
        items: itemsPayload(),
        tags,
        themePromptId,
      };
      const patchRes = await fetch(`/api/custom-collections/${resolvedId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(patchBody),
      });
      if (!patchRes.ok) {
        const data = await patchRes.json().catch(() => ({}));
        setError(data.error ?? "Saved partially — couldn't update some fields.");
        // Still treat as success enough to navigate.
      }

      // Visibility transitions:
      //   wasPublic + want public → if isOfficial flag changed on the toggle
      //                              for an admin, PATCH already updated it
      //                              (admin path). Nothing else to do.
      //   wasPublic + want private → POST DELETE on /publish
      //   wasPrivate + want public → POST /publish (with isOfficial)
      const wasPublic = !!initialState?.alreadyPublic;
      let publishedSlug: string | null = null;

      if (publishToCommunity && !wasPublic) {
        const pubRes = await fetch(`/api/custom-collections/${resolvedId}/publish`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ isOfficial: isAdmin && publishAsOfficial }),
        });
        const data = await pubRes.json().catch(() => ({}));
        if (!pubRes.ok) {
          setError(data.error ?? "Saved as private — couldn't publish.");
        } else {
          publishedSlug = data.slug ?? null;
        }
      } else if (!publishToCommunity && wasPublic) {
        await fetch(`/api/custom-collections/${resolvedId}/publish`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
      } else if (publishToCommunity && wasPublic && isAdmin) {
        // Toggling official-ness on an already-public collection — handled
        // via PATCH so the row updates without re-publishing.
        await fetch(`/api/custom-collections/${resolvedId}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ isOfficial: publishAsOfficial }),
        });
      }

      onSaved(resolvedId!, publishedSlug);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!onDelete || deleting) return;
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <div>
      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-200 text-sm rounded-lg px-4 py-2.5 mb-4 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-white ml-3">✕</button>
        </div>
      )}

      <label className="block text-sm font-medium text-[var(--foreground-muted)] mb-1.5">Title</label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={80}
        placeholder="e.g. Heist films that actually feel like work"
        className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] mb-4"
      />

      <label className="block text-sm font-medium text-[var(--foreground-muted)] mb-1.5">Description <span className="text-xs opacity-60">(optional)</span></label>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={500}
        rows={3}
        placeholder="What's the throughline? What kind of viewer should pick this up?"
        className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] resize-y mb-4"
      />

      {/* Theme association is read-only here. Adding to a theme is done
          from the Theme tab → Respond flow (so the builder picker doesn't
          balloon as years of past prompts pile up). The chip just shows
          the current binding with an inline X to clear it. */}
      {themePromptId && (() => {
        const current = activePrompts.find((p) => p.id === themePromptId);
        return (
          <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-[var(--ratist-red)]/10 border border-[var(--ratist-red)]/30 rounded-lg text-xs">
            <Lightbulb className="w-3.5 h-3.5 text-[var(--ratist-red)] shrink-0" />
            <span className="text-[var(--foreground-muted)]">Responding to:</span>
            <span className="text-white font-medium flex-1 truncate">
              {current?.title ?? "this theme"}
            </span>
            <button
              type="button"
              onClick={() => setThemePromptId(null)}
              title="Remove from theme"
              className="text-[var(--foreground-muted)] hover:text-red-400 transition-colors shrink-0"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })()}

      <div className="mb-4">
        <TagInput tags={tags} onChange={setTags} />
      </div>

      <div ref={containerRef} className="relative mb-4">
        <label className="block text-sm font-medium text-[var(--foreground-muted)] mb-1.5">Add titles</label>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--foreground-muted)]" />
          <input
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onFocus={() => setShowDropdown(true)}
            placeholder="Search movies and TV shows…"
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
          />
        </div>
        {showDropdown && query.length >= 2 && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg max-h-[320px] overflow-y-auto z-20 shadow-xl">
            {searching ? (
              <p className="text-xs text-[var(--foreground-muted)] py-3 text-center">Searching…</p>
            ) : results.length === 0 ? (
              <p className="text-xs text-[var(--foreground-muted)] py-3 text-center">No results.</p>
            ) : (
              results.slice(0, 30).map((r) => (
                <button
                  key={`${r.mediaType}-${r.id}`}
                  onClick={() => addItem(r)}
                  className="w-full flex items-center gap-2 hover:bg-[var(--surface-2)] p-2 text-left transition-colors"
                >
                  {r.posterPath ? (
                    <div className="relative w-8 aspect-[2/3] rounded overflow-hidden bg-[var(--surface-2)] shrink-0">
                      <Image src={`https://image.tmdb.org/t/p/w92${r.posterPath}`} alt="" fill sizes="32px" className="object-cover" />
                    </div>
                  ) : (
                    <div className="w-8 aspect-[2/3] rounded bg-[var(--surface-2)] shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white truncate flex items-center gap-1">
                      {r.mediaType === "tv" ? <Tv className="w-3 h-3 text-blue-400" /> : <Film className="w-3 h-3 text-[var(--foreground-muted)]" />}
                      {r.title ?? r.name}
                    </p>
                    {(r.releaseDate || r.firstAirDate) && (
                      <p className="text-[10px] text-[var(--foreground-muted)]">
                        {(r.releaseDate ?? r.firstAirDate ?? "").slice(0, 4)}
                      </p>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <div className="mb-6">
        <div className="flex items-baseline justify-between mb-2 gap-2">
          <p className="text-sm text-[var(--foreground-muted)]">
            {items.length}/{MAX_ITEMS} title{items.length === 1 ? "" : "s"}
            {items.length > 0 && items.length < MIN_ITEMS_TO_PUBLISH && (
              <span className="text-[var(--ratist-red)]"> · {MIN_ITEMS_TO_PUBLISH - items.length} more to publish</span>
            )}
          </p>
          <p className="text-[10px] text-[var(--foreground-muted)] italic">
            Collections cap at {MAX_ITEMS} titles.
          </p>
        </div>
        {items.length === 0 ? (
          <div className="text-center py-8 text-sm text-[var(--foreground-muted)] border border-dashed border-[var(--border)] rounded-lg">
            Search above to start adding titles.
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((it, idx) => (
              <li key={`${it.mediaType}-${it.tmdbId}`} className="flex items-start gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-lg p-2">
                <div className="flex flex-col items-center gap-0.5 shrink-0 pt-1">
                  <button onClick={() => moveItem(idx, -1)} disabled={idx === 0} className="text-[var(--foreground-muted)] hover:text-white disabled:opacity-30">
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  {/* 1-based ordinal makes the order obvious without
                      having to count. Keeps step with reorder buttons. */}
                  <span className="text-[10px] font-mono text-[var(--foreground-muted)] tabular-nums">
                    {idx + 1}
                  </span>
                  <button onClick={() => moveItem(idx, 1)} disabled={idx === items.length - 1} className="text-[var(--foreground-muted)] hover:text-white disabled:opacity-30">
                    <ArrowDown className="w-3 h-3" />
                  </button>
                </div>
                {it.posterPath ? (
                  <div className="relative w-10 aspect-[2/3] rounded overflow-hidden bg-[var(--surface-2)] shrink-0">
                    <Image src={`https://image.tmdb.org/t/p/w92${it.posterPath}`} alt="" fill sizes="40px" className="object-cover" />
                  </div>
                ) : (
                  <div className="w-10 aspect-[2/3] rounded bg-[var(--surface-2)] shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white flex items-center gap-1">
                    {it.mediaType === "tv" && <Tv className="w-3 h-3 text-blue-400" />}
                    <span className="truncate">{it.title}</span>
                  </p>
                  <input
                    value={it.blurb}
                    onChange={(e) => setBlurb(idx, e.target.value)}
                    maxLength={280}
                    placeholder="Why this one? (optional, 280 chars)"
                    className="w-full mt-1 bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
                  />
                </div>
                <button onClick={() => removeItem(idx)} className="text-[var(--foreground-muted)] hover:text-red-400 p-1 shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="pt-4 border-t border-[var(--border)] space-y-3">
        {initialState?.lockOfficial ? (
          // Admin Ratist flow — both toggles are implicit. Show a small
          // banner instead of redundant checkboxes.
          <div className="flex items-start gap-2 px-3 py-2 bg-[var(--ratist-red)]/10 border border-[var(--ratist-red)]/30 rounded-lg text-xs text-white">
            <span className="text-[var(--ratist-red)] font-semibold shrink-0">✦</span>
            <span>
              This will publish as an official Ratist collection — listed on the Featured tab and attributed to The Ratist.
              {items.length < MIN_ITEMS_TO_PUBLISH && (
                <span className="block text-[var(--foreground-muted)] mt-1">
                  Add at least {MIN_ITEMS_TO_PUBLISH} titles to publish (currently {items.length}).
                </span>
              )}
            </span>
          </div>
        ) : (
          <>
            <label className="flex items-start gap-2 text-sm text-white cursor-pointer">
              <input
                type="checkbox"
                checked={publishToCommunity}
                onChange={(e) => setPublishToCommunity(e.target.checked)}
                disabled={items.length < MIN_ITEMS_TO_PUBLISH && !publishToCommunity}
                className="mt-0.5 accent-[var(--ratist-red)]"
              />
              <span className="flex-1">
                <span className="block">
                  {initialState?.alreadyPublic ? "Keep published to the community" : "Also publish to the community"}
                </span>
                <span className="block text-[11px] text-[var(--foreground-muted)] mt-0.5">
                  {items.length < MIN_ITEMS_TO_PUBLISH && !publishToCommunity
                    ? `Add at least ${MIN_ITEMS_TO_PUBLISH} titles to publish (currently ${items.length}).`
                    : initialState?.alreadyPublic && !publishToCommunity
                      ? "Unchecking will unpublish — the public URL stops resolving until you republish."
                      : "Public collections appear in the Community feed for paid members. You can unpublish later."}
                </span>
              </span>
            </label>

            {publishToCommunity && isAdmin && (
              <label className="flex items-start gap-2 text-sm text-white cursor-pointer ml-6">
                <input
                  type="checkbox"
                  checked={publishAsOfficial}
                  onChange={(e) => setPublishAsOfficial(e.target.checked)}
                  className="mt-0.5 accent-[var(--ratist-red)]"
                />
                <span className="flex-1">
                  <span className="block">Publish as Ratist (official curation)</span>
                  <span className="block text-[11px] text-[var(--foreground-muted)] mt-0.5">
                    Replaces your name with the Ratist mark and surfaces this on the Featured tab.
                  </span>
                </span>
              </label>
            )}
          </>
        )}

        <div className="flex items-center justify-between gap-2">
          {onDelete ? (
            confirmingDelete ? (
              <span className="flex items-center gap-2 text-xs">
                <button onClick={handleDelete} disabled={deleting} className="text-red-400 hover:text-red-300 font-medium">
                  {deleting ? "Deleting…" : "Confirm delete"}
                </button>
                <button onClick={() => setConfirmingDelete(false)} className="text-[var(--foreground-muted)] hover:text-white">Cancel</button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmingDelete(true)}
                className="flex items-center gap-1 text-xs text-[var(--foreground-muted)] hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-3 h-3" /> Delete collection
              </button>
            )
          ) : <span />}

          <button
            onClick={save}
            disabled={saving || items.length === 0 || !title.trim() || (initialState?.lockOfficial && items.length < MIN_ITEMS_TO_PUBLISH)}
            className="flex items-center justify-center gap-1.5 text-sm font-semibold text-white bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] rounded-full px-5 py-2 transition-colors disabled:opacity-40"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : publishToCommunity ? <Send className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
            {saving
              ? "Saving…"
              : initialState?.lockOfficial
                ? "Save & publish as Ratist"
                : publishToCommunity && !initialState?.alreadyPublic
                  ? "Save & publish"
                  : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
