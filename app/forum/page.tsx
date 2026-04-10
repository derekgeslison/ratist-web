"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { MessageSquare, Search, ChevronDown, Bell } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import ThreadCard from "@/components/forum/ThreadCard";
import AdUnit from "@/components/AdUnit";

const TYPES = [
  { value: "", label: "All" },
  { value: "discussion", label: "Discussion" },
  { value: "theory", label: "Theory" },
  { value: "poll", label: "Poll" },
  { value: "recommendation", label: "Recommendation" },
  { value: "debate", label: "Debate" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "trending", label: "Trending" },
  { value: "replies", label: "Most Replies" },
  { value: "views", label: "Most Viewed" },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Thread = any;

export default function ForumPage() {
  const { user } = useAuth();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState("");
  const [tag, setTag] = useState("");
  const [sort, setSort] = useState("newest");
  const [followingOnly, setFollowingOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [popularTags, setPopularTags] = useState<{ tag: string; count: number }[]>([]);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchThreads = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (tag) params.set("tag", tag);
    if (sort) params.set("sort", sort);
    if (search) params.set("search", search);
    if (followingOnly) params.set("following", "true");
    params.set("page", String(page));

    const headers: Record<string, string> = {};
    if (followingOnly && user) {
      const token = await user.getIdToken();
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`/api/forum/threads?${params}`, { headers }).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setThreads(data.threads ?? []);
      setTotalPages(data.totalPages ?? 1);
    }
    setLoading(false);
  }, [type, tag, sort, search, page, followingOnly, user]);

  useEffect(() => { fetchThreads(); }, [fetchThreads]);

  // Fetch popular tags once
  useEffect(() => {
    fetch("/api/forum/tags").then((r) => r.json()).then((d) => setPopularTags(d.tags ?? [])).catch(() => {});
  }, []);

  // Read tag from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlTag = params.get("tag");
    if (urlTag) setTag(urlTag);
  }, []);

  function handleSearchInput(value: string) {
    setSearchInput(value);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      setSearch(value);
      setPage(1);
    }, 400);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <MessageSquare className="w-6 h-6 text-cyan-400" />
          <h1 className="text-2xl font-bold text-white">Forums</h1>
        </div>
        <Link
          href="/forum/new"
          className="flex items-center gap-2 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold px-4 py-2 rounded-full transition-colors"
        >
          + New Thread
        </Link>
      </div>

      {/* Search */}
      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)]" />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => handleSearchInput(e.target.value)}
          placeholder="Search threads, movies, actors, tags..."
          className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
        />
      </div>

      {/* Type tabs + Following filter */}
      <div className="flex items-center gap-1 mb-3 overflow-x-auto pb-1">
        {user && (
          <button
            onClick={() => { setFollowingOnly(!followingOnly); setPage(1); }}
            className={`flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap transition-colors ${
              followingOnly
                ? "bg-[var(--ratist-red)] text-white"
                : "bg-[var(--surface)] text-[var(--foreground-muted)] hover:text-white border border-[var(--border)]"
            }`}
          >
            <Bell className="w-3 h-3" /> Following
          </button>
        )}
        {TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => { setType(t.value); setPage(1); }}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap transition-colors ${
              type === t.value
                ? "bg-[var(--ratist-red)] text-white"
                : "bg-[var(--surface)] text-[var(--foreground-muted)] hover:text-white border border-[var(--border)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tags + Sort row */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-1.5 overflow-x-auto flex-1 min-w-0">
          {tag && (
            <button
              onClick={() => { setTag(""); setPage(1); }}
              className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--ratist-red)]/20 text-[var(--ratist-red)] font-semibold whitespace-nowrap"
            >
              {tag} ✕
            </button>
          )}
          {popularTags.filter((t) => t.tag !== tag).slice(0, 8).map((t) => (
            <button
              key={t.tag}
              onClick={() => { setTag(t.tag); setPage(1); }}
              className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--surface-2)] text-[var(--foreground-muted)] hover:text-white whitespace-nowrap transition-colors"
            >
              {t.tag}
            </button>
          ))}
        </div>
        <div className="relative shrink-0">
          <select
            value={sort}
            onChange={(e) => { setSort(e.target.value); setPage(1); }}
            className="appearance-none bg-[var(--surface)] border border-[var(--border)] rounded-lg pl-3 pr-8 py-1.5 text-xs text-white focus:outline-none cursor-pointer"
          >
            {SORT_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--foreground-muted)] pointer-events-none" />
        </div>
      </div>

      <AdUnit slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_COMMUNITY ?? ""} format="auto" className="mb-4" />

      {/* Thread feed */}
      {loading ? (
        <p className="text-[var(--foreground-muted)] text-center py-10">Loading...</p>
      ) : threads.length === 0 ? (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-8 text-center">
          <MessageSquare className="w-10 h-10 text-[var(--foreground-muted)] mx-auto mb-3 opacity-40" />
          <p className="text-[var(--foreground-muted)] mb-1">No threads found.</p>
          <p className="text-xs text-[var(--foreground-muted)] opacity-70">Be the first to start a discussion!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {threads.map((t: Thread) => (
            <ThreadCard key={t.id} {...t} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 text-xs text-[var(--foreground-muted)] border border-[var(--border)] rounded-lg hover:text-white disabled:opacity-30 transition-colors"
          >
            Previous
          </button>
          <span className="text-xs text-[var(--foreground-muted)]">Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 text-xs text-[var(--foreground-muted)] border border-[var(--border)] rounded-lg hover:text-white disabled:opacity-30 transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
