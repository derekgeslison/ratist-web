"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, AlertTriangle, UserPlus, UserCheck, Sparkles, Layers, Compass, Flame } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import CriticChip from "./CriticChip";

/**
 * User discovery surface for /community. Two tabs:
 *   - Taste Twins (signed-in only): public users ranked by match %
 *     against the viewer's taste profile.
 *   - Search: free-text fuzzy match on display name, available to
 *     everyone.
 *
 * State persists in the URL (?tab=twins|search&q=...) so back-nav from
 * a profile page restores both the active tab and the search query.
 * router.replace is used so each keystroke doesn't pile into the
 * browser history stack.
 *
 * Per-row signal: avatar, name, match %, follower count, Critic chip,
 * "limited taste data" warning if their rating count is low, and a
 * Follow / Following button. isFollowing is stamped server-side on
 * the API response — one query for all candidates instead of one per
 * row, which is both faster and (more importantly) was reading the
 * wrong response key in the previous fan-out shape.
 *
 * Pagination is a Load More button (30 per page) — less surprising
 * than infinite scroll on mobile.
 *
 * The consumer (/community/page.tsx) wraps this in <Suspense> because
 * useSearchParams forces dynamic rendering on Next.js 16.
 */

type Tab = "twins" | "genre" | "component" | "pulse" | "search";
type PulseMode = "active" | "newest" | "critics";

// TMDB genre IDs the site already exposes elsewhere. Kept inline to
// avoid pulling the whole MoviesFilterBar dependency tree into this
// component just for a label list.
const GENRES: { id: number; label: string }[] = [
  { id: 28, label: "Action" }, { id: 12, label: "Adventure" }, { id: 16, label: "Animation" },
  { id: 35, label: "Comedy" }, { id: 80, label: "Crime" }, { id: 99, label: "Documentary" },
  { id: 18, label: "Drama" }, { id: 10751, label: "Family" }, { id: 14, label: "Fantasy" },
  { id: 36, label: "History" }, { id: 27, label: "Horror" }, { id: 10402, label: "Music" },
  { id: 9648, label: "Mystery" }, { id: 10749, label: "Romance" }, { id: 878, label: "Science Fiction" },
  { id: 53, label: "Thriller" }, { id: 10752, label: "War" }, { id: 37, label: "Western" },
];

const COMPONENTS: { key: string; label: string }[] = [
  { key: "narrativeFocused", label: "Narrative-focused" },
  { key: "characterFocused", label: "Character-focused" },
  { key: "messageFocused", label: "Message-focused" },
  { key: "cinematicFocused", label: "Cinematic-focused" },
  { key: "performanceFocused", label: "Performance-focused" },
  { key: "entertainmentFocused", label: "Entertainment-focused" },
];

interface DiscoveryUser {
  id: string;
  firebaseUid: string;
  name: string;
  avatarUrl: string | null;
  match: number | null;
  followerCount: number;
  isCritic: boolean;
  // Full Ratist rating count. Drives both the limited-data warning
  // chip and the data-sufficient sort tier on the server. Quick /
  // basic ratings don't count toward this — only rows with
  // subfields actually filled in.
  fullRatistCount: number;
  isFollowing: boolean;
}

interface PageResponse {
  users: DiscoveryUser[];
  hasMore: boolean;
  needsProfile?: boolean;
  threshold?: number;
}

const PAGE_SIZE = 30;
const SEARCH_DEBOUNCE_MS = 300;

export default function UserDiscoveryList() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isSignedIn = !!user;

  // Read initial tab + query from URL. If the URL has q=... but tab
  // isn't set, infer "search" so a back-nav to /community?q=foo
  // lands the user on the right tab.
  const urlTab = (searchParams.get("tab") as Tab | null) ?? null;
  const urlQuery = searchParams.get("q") ?? "";
  const validTabs: Tab[] = ["twins", "genre", "component", "pulse", "search"];
  const inferredTab: Tab = urlTab && validTabs.includes(urlTab)
    ? urlTab
    : urlQuery
      ? "search"
      : isSignedIn ? "twins" : "search";
  const [tab, setTab] = useState<Tab>(inferredTab);

  // Once auth resolves, if there's nothing in the URL, default
  // signed-in users to twins. Don't override an explicit URL choice.
  useEffect(() => {
    if (authLoading) return;
    if (urlTab) return;
    setTab(urlQuery ? "search" : isSignedIn ? "twins" : "search");
  }, [authLoading, isSignedIn, urlTab, urlQuery]);

  // Push tab changes to the URL with replace so we don't accumulate
  // history entries. We strip `q` whenever we leave the search tab so
  // the URL doesn't carry stale query state on the twins side.
  const pushTabToUrl = useCallback((next: Tab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    if (next !== "search") params.delete("q");
    const qs = params.toString();
    router.replace(`/community${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [router, searchParams]);

  function selectTab(next: Tab) {
    setTab(next);
    pushTabToUrl(next);
  }

  return (
    <div>
      {/* Tabs — horizontal scroll on mobile so 5 tabs still fit. */}
      <div className="flex items-center gap-1 border-b border-[var(--border)] mb-4 overflow-x-auto">
        {isSignedIn && (
          <TabButton active={tab === "twins"} onClick={() => selectTab("twins")}>
            <Sparkles className="w-3.5 h-3.5" /> Taste Twins
          </TabButton>
        )}
        <TabButton active={tab === "genre"} onClick={() => selectTab("genre")}>
          <Layers className="w-3.5 h-3.5" /> By Genre
        </TabButton>
        <TabButton active={tab === "component"} onClick={() => selectTab("component")}>
          <Compass className="w-3.5 h-3.5" /> By Focus
        </TabButton>
        <TabButton active={tab === "pulse"} onClick={() => selectTab("pulse")}>
          <Flame className="w-3.5 h-3.5" /> Pulse
        </TabButton>
        <TabButton active={tab === "search"} onClick={() => selectTab("search")}>
          <Search className="w-3.5 h-3.5" /> Search
        </TabButton>
      </div>

      {!isSignedIn && tab === "twins" && (
        <p className="text-xs text-[var(--foreground-muted)] mb-3">
          Sign in to see your taste twins.
        </p>
      )}

      {tab === "twins" && isSignedIn && <TwinsTab />}
      {tab === "genre" && <GenreTab />}
      {tab === "component" && <ComponentTab />}
      {tab === "pulse" && <PulseTab />}
      {tab === "search" && <SearchTab signedIn={isSignedIn} initialQuery={urlQuery} />}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 text-sm font-medium px-4 py-2.5 border-b-2 transition-colors ${
        active
          ? "border-[var(--ratist-red)] text-white"
          : "border-transparent text-[var(--foreground-muted)] hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function TwinsTab() {
  const { user } = useAuth();
  const [users, setUsers] = useState<DiscoveryUser[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [needsProfile, setNeedsProfile] = useState(false);
  const [threshold, setThreshold] = useState(10);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadPage = useCallback(async (cursor: number, append: boolean) => {
    if (!user) return;
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/community/discover/twins?cursor=${cursor}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data: PageResponse = await res.json();
      setUsers((prev) => append ? [...prev, ...data.users] : data.users);
      setHasMore(data.hasMore);
      setNeedsProfile(!!data.needsProfile);
      if (data.threshold) setThreshold(data.threshold);
    } catch { /* silent — empty state covers it */ }
    if (append) setLoadingMore(false); else setLoading(false);
  }, [user]);

  useEffect(() => { loadPage(0, false); }, [loadPage]);

  // Optimistic follow toggle — flip the row locally, then call POST.
  // Roll back on failure so the UI doesn't lie if the API rejected.
  const onToggleFollow = useCallback((id: string, next: boolean) => {
    setUsers((prev) => prev.map((u) => u.id === id ? { ...u, isFollowing: next, followerCount: u.followerCount + (next ? 1 : -1) } : u));
  }, []);

  if (loading) {
    return <p className="text-sm text-[var(--foreground-muted)] text-center py-8">Loading taste twins…</p>;
  }
  if (needsProfile) {
    return (
      <div className="text-center py-12 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
        <p className="text-sm text-white font-semibold mb-1">Rate at least 5 films to find your taste twins</p>
        <p className="text-xs text-[var(--foreground-muted)] mb-4">
          Your matches are computed against your taste profile — and that profile is built from your ratings.
        </p>
        <Link href="/movies" className="text-sm text-[var(--ratist-red)] hover:underline">
          Browse movies →
        </Link>
      </div>
    );
  }
  if (users.length === 0) {
    return <p className="text-sm text-[var(--foreground-muted)] text-center py-8">No taste twins to show yet.</p>;
  }

  return (
    <div>
      <div className="space-y-2">
        {users.map((u) => <UserRow key={u.id} u={u} threshold={threshold} onToggleFollow={onToggleFollow} />)}
      </div>
      {hasMore && (
        <div className="mt-4 text-center">
          <button
            onClick={() => loadPage(users.length, true)}
            disabled={loadingMore}
            className="px-4 py-2 text-sm font-semibold bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--ratist-red)] text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}

function SearchTab({ signedIn, initialQuery }: { signedIn: boolean; initialQuery: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(initialQuery);
  const [committedQuery, setCommittedQuery] = useState(initialQuery);
  const [users, setUsers] = useState<DiscoveryUser[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [threshold, setThreshold] = useState(10);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Memo the URL update so the typing-debounce effect below doesn't
  // re-run on every searchParams/router identity change.
  const pushQueryToUrl = useMemo(() => (q: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "search");
    if (q) params.set("q", q); else params.delete("q");
    const qs = params.toString();
    router.replace(`/community${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [router, searchParams]);

  // 300ms debounce — commits the typed query, pushes it to the URL so
  // back-nav restores both the tab and the search term.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const trimmed = query.trim();
      setCommittedQuery(trimmed);
      pushQueryToUrl(trimmed);
    }, SEARCH_DEBOUNCE_MS);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, pushQueryToUrl]);

  const loadPage = useCallback(async (cursor: number, append: boolean, q: string) => {
    if (q.length === 0) {
      setUsers([]); setHasMore(false); setLoading(false); setLoadingMore(false);
      return;
    }
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (user) headers["Authorization"] = `Bearer ${await user.getIdToken()}`;
      const res = await fetch(`/api/community/discover/search?q=${encodeURIComponent(q)}&cursor=${cursor}`, { headers });
      if (!res.ok) return;
      const data: PageResponse = await res.json();
      setUsers((prev) => append ? [...prev, ...data.users] : data.users);
      setHasMore(data.hasMore);
      if (data.threshold) setThreshold(data.threshold);
    } catch { /* silent */ }
    if (append) setLoadingMore(false); else setLoading(false);
  }, [user]);

  useEffect(() => { loadPage(0, false, committedQuery); }, [loadPage, committedQuery]);

  const onToggleFollow = useCallback((id: string, next: boolean) => {
    setUsers((prev) => prev.map((u) => u.id === id ? { ...u, isFollowing: next, followerCount: u.followerCount + (next ? 1 : -1) } : u));
  }, []);

  return (
    <div>
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)]" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by display name…"
          className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
        />
      </div>

      {!signedIn && committedQuery.length === 0 && (
        <p className="text-xs text-[var(--foreground-muted)] text-center py-3">
          Type to search for cinephiles by name.
        </p>
      )}

      {loading ? (
        <p className="text-sm text-[var(--foreground-muted)] text-center py-8">Searching…</p>
      ) : committedQuery.length > 0 && users.length === 0 ? (
        <p className="text-sm text-[var(--foreground-muted)] text-center py-8">No users match &ldquo;{committedQuery}&rdquo;.</p>
      ) : (
        <>
          <div className="space-y-2">
            {users.map((u) => <UserRow key={u.id} u={u} threshold={threshold} onToggleFollow={onToggleFollow} />)}
          </div>
          {hasMore && (
            <div className="mt-4 text-center">
              <button
                onClick={() => loadPage(users.length, true, committedQuery)}
                disabled={loadingMore}
                className="px-4 py-2 text-sm font-semibold bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--ratist-red)] text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Shared list renderer for the browse-mode tabs. Each browse tab
 *  composes a selector + this list; the list itself handles fetch,
 *  pagination, follow-toggle, and empty / loading states identically. */
function BrowseList({
  endpoint,
  selectorKey,
  emptyMessage,
}: {
  /** Fully-qualified API URL incl. query string (mode + sub-params). */
  endpoint: string | null;
  /** Anything that uniquely identifies the current selection — used
   *  as the effect dep so the list reloads when the dropdown / pill
   *  changes. Set to null when no selection (initial empty state). */
  selectorKey: string | null;
  emptyMessage: string;
}) {
  const { user } = useAuth();
  const [users, setUsers] = useState<DiscoveryUser[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [threshold, setThreshold] = useState(10);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadPage = useCallback(async (cursor: number, append: boolean) => {
    if (!endpoint) {
      setUsers([]); setHasMore(false); setLoading(false); setLoadingMore(false);
      return;
    }
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (user) headers["Authorization"] = `Bearer ${await user.getIdToken()}`;
      const url = `${endpoint}${endpoint.includes("?") ? "&" : "?"}cursor=${cursor}`;
      const res = await fetch(url, { headers });
      if (!res.ok) return;
      const data: PageResponse = await res.json();
      setUsers((prev) => append ? [...prev, ...data.users] : data.users);
      setHasMore(data.hasMore);
      if (data.threshold) setThreshold(data.threshold);
    } catch { /* silent */ }
    if (append) setLoadingMore(false); else setLoading(false);
  }, [endpoint, user]);

  useEffect(() => { loadPage(0, false); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [selectorKey]);

  const onToggleFollow = useCallback((id: string, next: boolean) => {
    setUsers((prev) => prev.map((u) => u.id === id ? { ...u, isFollowing: next, followerCount: u.followerCount + (next ? 1 : -1) } : u));
  }, []);

  if (selectorKey === null) {
    return <p className="text-sm text-[var(--foreground-muted)] text-center py-8">{emptyMessage}</p>;
  }
  if (loading) {
    return <p className="text-sm text-[var(--foreground-muted)] text-center py-8">Loading…</p>;
  }
  if (users.length === 0) {
    return <p className="text-sm text-[var(--foreground-muted)] text-center py-8">No users to show yet.</p>;
  }
  return (
    <div>
      <div className="space-y-2">
        {users.map((u) => <UserRow key={u.id} u={u} threshold={threshold} onToggleFollow={onToggleFollow} />)}
      </div>
      {hasMore && (
        <div className="mt-4 text-center">
          <button
            onClick={() => loadPage(users.length, true)}
            disabled={loadingMore}
            className="px-4 py-2 text-sm font-semibold bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--ratist-red)] text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}

/** Visual style shared by all single-select pill rows in the
 *  discovery tabs. Matches the Pulse tab pill row so the three sub-
 *  selector surfaces feel like the same control. */
const PILL_BASE = "text-xs font-semibold px-3 py-1.5 rounded-full transition-colors whitespace-nowrap";
const PILL_ACTIVE = "bg-[var(--ratist-red)] text-white";
const PILL_INACTIVE = "bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white";

function GenreTab() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initial = searchParams.get("genreId") ?? "";
  const [genreId, setGenreId] = useState(initial);

  function onChange(next: string) {
    setGenreId(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "genre");
    if (next) params.set("genreId", next); else params.delete("genreId");
    router.replace(`/community?${params.toString()}`, { scroll: false });
  }

  return (
    <div>
      <div className="mb-4">
        <div className="flex items-center gap-1.5 flex-wrap">
          {GENRES.map((g) => {
            const idStr = String(g.id);
            const active = genreId === idStr;
            return (
              <button
                key={g.id}
                onClick={() => onChange(active ? "" : idStr)}
                className={`${PILL_BASE} ${active ? PILL_ACTIVE : PILL_INACTIVE}`}
              >
                {g.label}
              </button>
            );
          })}
        </div>
        {genreId && (
          <p className="text-xs text-[var(--foreground-muted)] mt-2">
            Ranked by their average rating in {GENRES.find((g) => String(g.id) === genreId)?.label}.
          </p>
        )}
      </div>
      <BrowseList
        endpoint={genreId ? `/api/community/discover/browse?mode=genre&genreId=${genreId}` : null}
        selectorKey={genreId || null}
        emptyMessage="Pick a genre above to see who reviews it best."
      />
    </div>
  );
}

function ComponentTab() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initial = searchParams.get("component") ?? "";
  const [component, setComponent] = useState(initial);

  function onChange(next: string) {
    setComponent(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "component");
    if (next) params.set("component", next); else params.delete("component");
    router.replace(`/community?${params.toString()}`, { scroll: false });
  }

  return (
    <div>
      <div className="mb-4">
        <div className="flex items-center gap-1.5 flex-wrap">
          {COMPONENTS.map((c) => {
            const active = component === c.key;
            return (
              <button
                key={c.key}
                onClick={() => onChange(active ? "" : c.key)}
                className={`${PILL_BASE} ${active ? PILL_ACTIVE : PILL_INACTIVE}`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
        {component && (
          <p className="text-xs text-[var(--foreground-muted)] mt-2">
            Users whose taste profile leans into {COMPONENTS.find((c) => c.key === component)?.label.toLowerCase()} cinema.
          </p>
        )}
      </div>
      <BrowseList
        endpoint={component ? `/api/community/discover/browse?mode=component&component=${component}` : null}
        selectorKey={component || null}
        emptyMessage="Pick a focus above to see who shares it."
      />
    </div>
  );
}

function PulseTab() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initial = (searchParams.get("pulse") as PulseMode | null) ?? "active";
  const [pulse, setPulse] = useState<PulseMode>(initial);

  function onChange(next: PulseMode) {
    setPulse(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "pulse");
    params.set("pulse", next);
    router.replace(`/community?${params.toString()}`, { scroll: false });
  }

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        {(["active", "newest", "critics"] as const).map((m) => (
          <button
            key={m}
            onClick={() => onChange(m)}
            className={`${PILL_BASE} ${pulse === m ? PILL_ACTIVE : PILL_INACTIVE}`}
          >
            {m === "active" ? "Active this week" : m === "newest" ? "Newest cinephiles" : "Critics"}
          </button>
        ))}
      </div>
      <BrowseList
        endpoint={`/api/community/discover/browse?mode=${pulse}`}
        selectorKey={pulse}
        emptyMessage="Loading…"
      />
    </div>
  );
}

function UserRow({
  u, threshold, onToggleFollow,
}: {
  u: DiscoveryUser;
  threshold: number;
  onToggleFollow: (id: string, nextFollowing: boolean) => void;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

  async function toggleFollow(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    if (!user || busy) return;
    setBusy(true);
    const desired = !u.isFollowing;
    onToggleFollow(u.id, desired); // optimistic
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/users/${u.firebaseUid}/follow`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        onToggleFollow(u.id, !desired); // rollback
      } else {
        const data = await res.json();
        const actual = !!data.following;
        // Trust the server's final answer in case of pending state
        // (private targets) etc.
        if (actual !== desired) onToggleFollow(u.id, actual);
      }
    } catch {
      onToggleFollow(u.id, !desired); // rollback
    }
    setBusy(false);
  }

  const matchColor =
    u.match == null ? "text-[var(--foreground-muted)]"
      : u.match >= 80 ? "text-emerald-400"
      : u.match >= 60 ? "text-amber-400"
      : "text-[var(--foreground-muted)]";

  return (
    <Link
      href={`/profile/${u.firebaseUid}`}
      className="flex items-center gap-3 p-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl hover:border-[var(--ratist-red)] transition-colors group"
    >
      <div className="relative w-11 h-11 rounded-full overflow-hidden bg-[var(--surface-2)] border border-[var(--border)] shrink-0">
        {u.avatarUrl ? (
          <Image src={u.avatarUrl} alt={u.name} fill sizes="44px" className="object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-sm font-bold text-white bg-[var(--ratist-red)]">
            {(u.name || "?")[0].toUpperCase()}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-sm font-semibold text-white group-hover:text-[var(--ratist-red)] transition-colors truncate">{u.name}</p>
          {u.isCritic && <CriticChip />}
          {u.fullRatistCount < threshold && (
            <span title="Limited taste data — match score may be rougher for them.">
              <AlertTriangle className="w-3 h-3 text-amber-400" />
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-[var(--foreground-muted)] mt-0.5">
          <span>
            <span className={`font-semibold tabular-nums ${matchColor}`}>
              {u.match != null ? `${u.match}%` : "—"}
            </span> match
          </span>
          <span className="tabular-nums">
            {u.followerCount} {u.followerCount === 1 ? "follower" : "followers"}
          </span>
        </div>
      </div>

      {user && (
        <button
          onClick={toggleFollow}
          disabled={busy}
          className={`shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${
            u.isFollowing
              ? "bg-[var(--surface-2)] border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"
              : "bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white"
          }`}
        >
          {u.isFollowing ? <><UserCheck className="w-3 h-3" /> Following</> : <><UserPlus className="w-3 h-3" /> Follow</>}
        </button>
      )}
    </Link>
  );
}
