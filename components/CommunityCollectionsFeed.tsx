"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Search, Filter, Loader2, Users, Flame, Sparkles, Shield, Target, Lightbulb, Star, ArrowLeft, Plus, Bookmark, BookmarkCheck, Lock } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { posterUrl } from "@/lib/tmdb";
import CommunityCollectionCard, { CommunityCollectionCardData } from "./CommunityCollectionCard";
import CollectionsPaywallCard from "./CollectionsPaywallCard";

type Tab = "match" | "admin" | "following" | "popular" | "new" | "theme" | "bookmarked";

// "Match" leads — it's the differentiator that makes this Ratist rather
// than a generic Letterboxd-list feed. Theme is conditional and only
// surfaces when at least one prompt is currently active.
const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "match",      label: "Match",     icon: Target },
  { id: "theme",      label: "Theme",     icon: Lightbulb },
  { id: "admin",      label: "Featured",  icon: Shield },
  { id: "following",  label: "Following", icon: Users },
  { id: "popular",    label: "Popular",   icon: Flame },
  { id: "new",        label: "New",       icon: Sparkles },
  { id: "bookmarked", label: "Bookmarks", icon: BookmarkCheck },
];

interface ThemePromptPreview {
  id: string;
  name: string;
  slug: string | null;
  saveCount: number;
  isOfficial: boolean;
  curator: { firebaseUid: string; name: string };
  previewPosters: string[];
}

interface ThemePrompt {
  id: string;
  title: string;
  description: string | null;
  featured: boolean;
  activeFrom: string | null;
  activeTo: string | null;
  responseCount: number;
  previews?: ThemePromptPreview[];
}

// Picker shape for "respond to this theme using an existing collection".
// Mirrors the comment linked-collection picker so private collections
// can be published inline rather than forcing the user back to the
// builder just to flip visibility.
interface MyCollection {
  id: string;
  name: string;
  slug: string | null;
  visibility: "private" | "public" | "unlisted";
  itemCount: number;
  previewPosters: string[];
  // Surfaced so the theme-respond picker can warn before overwriting an
  // existing tag — themePromptId is single-valued on a collection.
  themePromptId: string | null;
  themePromptTitle: string | null;
}

// Tab gating for non-Backstage / anonymous users. Featured ("admin")
// is the only readable surface; everything else is the paid value prop.
const FREE_TABS: Tab[] = ["admin"];
const TAB_PAYWALL_COPY: Record<Tab, { title: string; body: string }> = {
  match:      { title: "Match scores need a Backstage Pass", body: "We score every collection against your taste profile so you see the most relevant lists first. Rate a few movies and shows to seed your persona." },
  theme:      { title: "Themed prompts need a Backstage Pass", body: "Editorial prompts curators are responding to right now (e.g. 'Films that aged like wine'). Browse responses or build your own." },
  admin:      { title: "", body: "" }, // never used — featured is free
  following:  { title: "Following is a Backstage Pass feature", body: "See new collections from curators you follow as soon as they publish." },
  popular:    { title: "Popular is a Backstage Pass feature", body: "Browse the most-saved collections this week, sorted by community engagement." },
  new:        { title: "New is a Backstage Pass feature", body: "See the latest published collections from curators across the community." },
  bookmarked: { title: "Bookmarks are a Backstage Pass feature", body: "Save collections you want to come back to and find them all in one place." },
};

export default function CommunityCollectionsFeed() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { hasPass } = useSubscription();
  const isBackstage = !!user && hasPass;

  // Default subtab depends on subscription tier: Backstage users land
  // on Match (the headline differentiator); free + anonymous users land
  // on Featured (the only tab they can read).
  const defaultTab: Tab = isBackstage ? "match" : "admin";
  const tab = (searchParams.get("subtab") as Tab) ?? defaultTab;
  const activeTab: Tab = TABS.some((t) => t.id === tab) ? tab : defaultTab;
  const isLocked = !isBackstage && !FREE_TABS.includes(activeTab);
  const tag = searchParams.get("tag") ?? "";
  const initialSearch = searchParams.get("search") ?? "";
  const themePromptId = searchParams.get("themePromptId") ?? "";

  const [search, setSearch] = useState(initialSearch);
  // Sync the input with the URL when the URL changes externally (e.g.
  // navigating in via a link or another component clearing the param).
  // useState only honors the initial value on mount, which leaves the
  // box stale otherwise.
  useEffect(() => { setSearch(initialSearch); }, [initialSearch]);
  // Debounced search — push the trimmed value to the URL ~300ms after
  // the user stops typing. No Enter required. The URL change drives the
  // refetch via the existing useEffect on fetchPage's identity.
  useEffect(() => {
    const trimmed = search.trim();
    if (trimmed === initialSearch) return; // avoid replace-loops
    const handle = setTimeout(() => {
      updateUrl({ search: trimmed || null });
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);
  const [collections, setCollections] = useState<CommunityCollectionCardData[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activePrompts, setActivePrompts] = useState<ThemePrompt[]>([]);
  // Theme-respond inline picker state — only one prompt's picker is
  // expanded at a time so the surface stays focused.
  const [respondingPrompt, setRespondingPrompt] = useState<string | null>(null);
  const [myCollections, setMyCollections] = useState<MyCollection[] | null>(null);
  const [loadingMy, setLoadingMy] = useState(false);
  const [taggingId, setTaggingId] = useState<string | null>(null);
  const [respondError, setRespondError] = useState<string | null>(null);

  // Sync URL state when filters change locally — keeps the Back button and
  // shareable links honest. Replaces (no history pollution) so back goes
  // to wherever the user came from, not through every filter mutation.
  const updateUrl = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value == null || value === "") params.delete(key);
      else params.set(key, value);
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  const fetchPage = useCallback(async (pageNum: number, replace: boolean) => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams({ tab: activeTab, page: String(pageNum) });
      if (tag) params.set("tag", tag);
      if (initialSearch) params.set("search", initialSearch);
      if (themePromptId) params.set("themePromptId", themePromptId);
      const res = await fetch(`/api/community-collections?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (replace) setCollections([]);
        setHasMore(false);
        return;
      }
      const data = await res.json();
      // Defensive: if the response shape is missing collections (server
      // returned something unexpected), don't crash — just treat as empty.
      const incoming: CommunityCollectionCardData[] = Array.isArray(data?.collections) ? data.collections : [];
      setCollections((prev) => replace ? incoming : [...prev, ...incoming]);
      setHasMore(!!data?.hasMore);
      setPage(pageNum);
    } catch {
      // Network blip, JSON parse error, etc. — clear when replacing so
      // the empty state shows the right message rather than stale data.
      if (replace) setCollections([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [user, activeTab, tag, initialSearch, themePromptId]);

  // Reset + refetch whenever the filter shape changes. Skip the fetch
  // when the active tab is locked for the current viewer — the body
  // renders a paywall card instead of any list.
  useEffect(() => {
    setCollections([]);
    setPage(1);
    if (!isLocked) fetchPage(1, true);
  }, [fetchPage, isLocked]);

  // Active prompts drive both the "Theme" tab strip and the
  // "responding to a theme" picker on the create flow. We fetch once on
  // mount; admin changes show up next session, which is fine since
  // prompts are slow-moving.
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

  function setTab(next: Tab) {
    // Clear themePromptId when leaving the Theme tab — its picker only
    // makes sense in that surface.
    updateUrl({ subtab: next, ...(next !== "theme" ? { themePromptId: null } : {}) });
  }

  function setThemePrompt(next: string | null) {
    updateUrl({ themePromptId: next });
  }

  function setTag(next: string | null) {
    updateUrl({ tag: next });
  }

  async function loadMyCollections() {
    if (!user || loadingMy) return;
    setLoadingMy(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/custom-collections", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { setMyCollections([]); return; }
      const data = await res.json();
      type Incoming = {
        id: string; name: string; slug: string | null;
        visibility?: "private" | "public" | "unlisted";
        previewPosters: (string | null)[]; itemCount: number;
        themePromptId?: string | null; themePromptTitle?: string | null;
      };
      setMyCollections((data.collections ?? []).map((c: Incoming): MyCollection => ({
        id: c.id, name: c.name, slug: c.slug ?? null,
        visibility: c.visibility ?? "private",
        itemCount: c.itemCount,
        previewPosters: (c.previewPosters ?? []).filter((p: string | null): p is string => typeof p === "string"),
        themePromptId: c.themePromptId ?? null,
        themePromptTitle: c.themePromptTitle ?? null,
      })));
    } finally {
      setLoadingMy(false);
    }
  }

  function toggleRespondPicker(promptId: string) {
    setRespondError(null);
    setRespondingPrompt((cur) => (cur === promptId ? null : promptId));
    if (myCollections === null) loadMyCollections();
  }

  async function refreshThemes() {
    if (!user) return;
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
  }

  // PATCH the collection's themePromptId. Used to tag an already-public
  // collection without touching its visibility. Confirms before
  // overwriting an existing theme tag.
  async function tagWithTheme(promptId: string, c: MyCollection) {
    if (!user || taggingId) return;
    if (c.themePromptId && c.themePromptId !== promptId) {
      const newTitle = activePrompts.find((p) => p.id === promptId)?.title ?? "this theme";
      const oldTitle = c.themePromptTitle ?? "another theme";
      if (!window.confirm(
        `"${c.name}" is already responding to "${oldTitle}". A collection can only respond to one theme at a time — replace with "${newTitle}"?`,
      )) return;
    }
    setTaggingId(c.id);
    setRespondError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/custom-collections/${c.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ themePromptId: promptId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setRespondError(data.error ?? "Couldn't tag the collection.");
        return;
      }
      await Promise.all([loadMyCollections(), refreshThemes()]);
      setRespondingPrompt(null);
    } finally {
      setTaggingId(null);
    }
  }

  // For private collections: publish first, then PATCH the theme. Two
  // round-trips so the rate limit + 5-item floor enforce on /publish.
  // Confirms before flipping visibility (publishing makes the collection
  // public) and before overwriting an existing theme tag.
  async function publishAndTag(promptId: string, c: MyCollection) {
    if (!user || taggingId) return;
    if (c.themePromptId && c.themePromptId !== promptId) {
      const newTitle = activePrompts.find((p) => p.id === promptId)?.title ?? "this theme";
      const oldTitle = c.themePromptTitle ?? "another theme";
      if (!window.confirm(
        `"${c.name}" is already responding to "${oldTitle}". A collection can only respond to one theme at a time — replace with "${newTitle}"?`,
      )) return;
    }
    if (!window.confirm(
      `"${c.name}" is currently private. Publishing will make it visible on the community feed (and visible to anyone with the link). Continue?`,
    )) return;
    setTaggingId(c.id);
    setRespondError(null);
    try {
      const token = await user.getIdToken();
      const pubRes = await fetch(`/api/custom-collections/${c.id}/publish`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const pubData = await pubRes.json().catch(() => ({}));
      if (!pubRes.ok) {
        setRespondError(pubData.error ?? "Couldn't publish that collection.");
        return;
      }
      const patchRes = await fetch(`/api/custom-collections/${c.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ themePromptId: promptId }),
      });
      if (!patchRes.ok) {
        const data = await patchRes.json().catch(() => ({}));
        setRespondError(data.error ?? "Published, but couldn't tag the theme.");
        return;
      }
      await Promise.all([loadMyCollections(), refreshThemes()]);
      setRespondingPrompt(null);
    } finally {
      setTaggingId(null);
    }
  }

  const handleSavedChange = useCallback((id: string, isSaved: boolean, saveCount: number) => {
    setCollections((prev) => prev.map((c) => c.id === id ? { ...c, isSaved, saveCount } : c));
  }, []);

  const emptyState = useMemo(() => {
    if (loading || collections.length > 0) return null;
    // Filter-driven emptiness wins — show "no matches" copy regardless
    // of which tab the user is on, so the cold-start message doesn't
    // mask a tag/search that's actually responsible.
    if (tag || initialSearch) {
      return `No collections match ${tag ? `the "${tag}" tag` : ""}${tag && initialSearch ? " and " : ""}${initialSearch ? `"${initialSearch}"` : ""}.`;
    }
    if (activeTab === "following") {
      return "Collections from people you follow will show up here. Follow some curators or check the other tabs.";
    }
    if (activeTab === "match") {
      return "Rate more movies and shows to unlock taste-matched collections. The match score uses your persona — it gets sharper with every full Ratist rating you submit.";
    }
    if (activeTab === "bookmarked") {
      return "You haven't bookmarked any collections yet. Click the bookmark icon on any collection to save it here.";
    }
    if (activeTab === "theme") {
      if (activePrompts.length === 0) {
        return "No themed prompts active right now. Check back — they rotate.";
      }
      if (themePromptId) {
        return "No responses to this prompt yet. Be the first.";
      }
      return "No responses to any active prompt yet. Be the first.";
    }
    return "No public collections yet. Be the first to publish one.";
  }, [loading, collections.length, activeTab, tag, initialSearch, activePrompts.length, themePromptId]);

  return (
    <div>
      {/* Sub-tabs */}
      <div className="flex flex-wrap items-center gap-1 mb-4 border-b border-[var(--border)]">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          const tabLocked = !isBackstage && !FREE_TABS.includes(t.id);
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? "border-[var(--ratist-red)] text-white"
                  : "border-transparent text-[var(--foreground-muted)] hover:text-white"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
              {tabLocked && <Lock className="w-3 h-3 opacity-60" />}
            </button>
          );
        })}
      </div>

      {/* Locked tab → paywall card. Short-circuits everything below
          (theme tile view, search, grid) so the user just sees the
          upgrade prompt with a brief description of what the tab does. */}
      {isLocked ? (
        <CollectionsPaywallCard
          title={TAB_PAYWALL_COPY[activeTab].title}
          body={TAB_PAYWALL_COPY[activeTab].body}
        />
      ) : activeTab === "theme" && !themePromptId ? (
        activePrompts.length === 0 ? (
          <div className="py-12 text-center text-sm text-[var(--foreground-muted)]">
            No themed prompts active right now. Check back — they rotate.
          </div>
        ) : (
          <div className="space-y-4">
            {activePrompts.map((p) => (
              <div key={p.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {p.featured && <Star className="w-3.5 h-3.5 text-yellow-400 shrink-0" />}
                      <h3 className="text-sm font-semibold text-white">{p.title}</h3>
                      <span className="text-[10px] text-[var(--foreground-muted)]">{p.responseCount} response{p.responseCount === 1 ? "" : "s"}</span>
                    </div>
                    {p.description && <p className="text-xs text-[var(--foreground-muted)] mt-1">{p.description}</p>}
                  </div>
                  <button
                    onClick={() => toggleRespondPicker(p.id)}
                    className="flex items-center gap-1 text-[11px] text-white bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] rounded-full px-2.5 py-1 transition-colors shrink-0"
                  >
                    <Plus className="w-3 h-3" /> Respond
                  </button>
                </div>

                {p.previews && p.previews.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                    {p.previews.map((c) => (
                      <Link
                        key={c.id}
                        href={c.slug ? `/collections/${c.curator.firebaseUid}/${c.slug}` : "#"}
                        className="group bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--ratist-red)]/50 rounded-lg p-2 transition-colors"
                      >
                        <div className="flex gap-0.5 mb-2">
                          {Array.from({ length: 4 }).map((_, i) => {
                            const poster = c.previewPosters[i];
                            return (
                              <div key={i} className="relative w-1/4 aspect-[2/3] rounded-sm overflow-hidden bg-[var(--surface)]">
                                {poster && <Image src={posterUrl(poster, "w92")} alt="" fill sizes="40px" className="object-cover" />}
                              </div>
                            );
                          })}
                        </div>
                        <p className="text-[11px] text-white truncate group-hover:text-[var(--ratist-red)] transition-colors">{c.name}</p>
                        <div className="flex items-center justify-between text-[10px] text-[var(--foreground-muted)] mt-0.5">
                          <span className="truncate">
                            {c.isOfficial ? "✦ The Ratist" : c.curator.name}
                          </span>
                          <span className="flex items-center gap-0.5"><Bookmark className="w-2.5 h-2.5" /> {c.saveCount}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[var(--foreground-muted)] italic mt-3">No responses yet — be the first.</p>
                )}

                {p.responseCount > 0 && (
                  <button
                    onClick={() => setThemePrompt(p.id)}
                    className="mt-3 text-xs text-[var(--ratist-red)] hover:underline"
                  >
                    Explore all {p.responseCount} response{p.responseCount === 1 ? "" : "s"} →
                  </button>
                )}

                {respondingPrompt === p.id && (
                  <div className="mt-4 pt-4 border-t border-[var(--border)] space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-white font-semibold">Respond to this theme</p>
                      <button
                        onClick={() => setRespondingPrompt(null)}
                        className="text-[10px] text-[var(--foreground-muted)] hover:text-white"
                      >
                        Close
                      </button>
                    </div>

                    <Link
                      href={`/tools/collections/new?themePromptId=${p.id}`}
                      className="flex items-center gap-2 bg-[var(--surface-2)] hover:bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--ratist-red)]/50 rounded-lg px-3 py-2 text-xs text-white transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5 text-[var(--ratist-red)]" />
                      <span className="flex-1">Create a new collection for this theme</span>
                      <ArrowLeft className="w-3 h-3 rotate-180 text-[var(--foreground-muted)]" />
                    </Link>

                    {(myCollections?.length ?? 0) > 0 && (
                      <div>
                        <p className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wider px-1 mb-1.5">
                          Or use one of your collections
                        </p>
                        <div className="space-y-1 max-h-[280px] overflow-y-auto">
                          {(myCollections ?? []).map((c) => {
                            const isPublic = c.visibility === "public" && !!c.slug;
                            return (
                              <div key={c.id} className="flex items-center gap-2 hover:bg-[var(--surface-2)] rounded p-1.5 transition-colors">
                                <div className="flex gap-0.5 shrink-0">
                                  {Array.from({ length: 4 }).map((_, i) => {
                                    const poster = c.previewPosters[i];
                                    return (
                                      <div key={i} className="relative w-4 aspect-[2/3] rounded-sm overflow-hidden bg-[var(--surface)]">
                                        {poster && <Image src={posterUrl(poster, "w92")} alt="" fill sizes="16px" className="object-cover" />}
                                      </div>
                                    );
                                  })}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs text-white truncate flex items-center gap-1.5">
                                    {c.name}
                                    {!isPublic && <span className="text-[9px] uppercase tracking-wider text-[var(--foreground-muted)] bg-[var(--surface)] border border-[var(--border)] rounded px-1">Private</span>}
                                  </p>
                                  <p className="text-[10px] text-[var(--foreground-muted)]">{c.itemCount} title{c.itemCount === 1 ? "" : "s"}</p>
                                </div>
                                <button
                                  onClick={() => isPublic ? tagWithTheme(p.id, c) : publishAndTag(p.id, c)}
                                  disabled={taggingId === c.id}
                                  title={isPublic ? "Tag this collection with the theme" : "Publish & tag — makes it public and links it to the theme"}
                                  className={`text-[10px] font-semibold text-white rounded-full px-2 py-0.5 transition-colors shrink-0 disabled:opacity-50 ${
                                    isPublic ? "bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)]" : "bg-[var(--ratist-red)]/70 hover:bg-[var(--ratist-red)]"
                                  }`}
                                >
                                  {taggingId === c.id ? "…" : isPublic ? "Tag theme" : "Publish & tag"}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {loadingMy && (
                      <p className="text-xs text-[var(--foreground-muted)] py-2 text-center">Loading your collections…</p>
                    )}

                    {respondError && (
                      <div className="text-[11px] text-red-300 bg-red-500/10 border border-red-500/30 rounded px-2 py-1.5">
                        {respondError}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      ) : (
        <>
          {/* Drilled-in theme view — show the prompt header + back link
              before the regular grid. */}
          {activeTab === "theme" && themePromptId && (() => {
            const selected = activePrompts.find((p) => p.id === themePromptId);
            return selected ? (
              <div className="mb-4">
                <button
                  onClick={() => setThemePrompt(null)}
                  className="inline-flex items-center gap-1 text-xs text-[var(--foreground-muted)] hover:text-white mb-2"
                >
                  <ArrowLeft className="w-3 h-3" /> All themes
                </button>
                <h2 className="text-base font-semibold text-white">{selected.title}</h2>
                {selected.description && <p className="text-xs text-[var(--foreground-muted)] mt-1">{selected.description}</p>}
              </div>
            ) : null;
          })()}

          {/* Search (suppressed on Theme drill-in to keep that surface
              focused). Server-side search matches collection names AND
              tag values, so the tag-pills row is gone — type a word and
              you'll see collections with that tag mixed in. */}
          {activeTab !== "theme" && (
            <div className="flex flex-col sm:flex-row gap-2 mb-4">
              <div className="flex-1 relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--foreground-muted)]" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search collections by title or tag…"
                  className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
                />
              </div>
              {tag && (
                <button
                  onClick={() => setTag(null)}
                  className="flex items-center gap-1 text-xs text-white bg-[var(--ratist-red)]/15 border border-[var(--ratist-red)]/40 hover:border-[var(--ratist-red)] rounded-full px-3 py-1.5 transition-colors"
                >
                  <Filter className="w-3 h-3" />
                  {tag}
                  <span className="text-[var(--foreground-muted)]">✕</span>
                </button>
              )}
            </div>
          )}

          {/* Grid */}
          {emptyState ? (
            <div className="py-12 text-center text-sm text-[var(--foreground-muted)]">{emptyState}</div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {collections.map((c) => (
                  <CommunityCollectionCard key={c.id} collection={c} onSavedChange={handleSavedChange} />
                ))}
              </div>
              {hasMore && (
                <div className="text-center mt-6">
                  <button
                    onClick={() => fetchPage(page + 1, false)}
                    disabled={loading}
                    className="text-sm text-white bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--ratist-red)] rounded-full px-4 py-1.5 transition-colors disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" /> : "Load more"}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
