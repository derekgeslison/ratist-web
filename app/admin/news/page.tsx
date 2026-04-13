"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { Plus, Trash2, Eye, EyeOff, ExternalLink, RefreshCw, Newspaper, Rss, PenSquare, X, Play } from "lucide-react";

interface NewsItem {
  id: string;
  type: string;
  title: string;
  slug: string | null;
  published: boolean;
  publishedAt: string | null;
  createdAt: string;
  viewCount: number;
  sourceName: string | null;
  youtubeKey: string | null;
  author: { name: string } | null;
}

interface RssHeadline {
  id: string;
  feedSource: string;
  title: string;
  url: string;
  description: string | null;
  imageUrl: string | null;
  fetchedAt: string;
}

export default function AdminNewsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"published" | "rss">("published");
  const [items, setItems] = useState<NewsItem[]>([]);
  const [headlines, setHeadlines] = useState<RssHeadline[]>([]);
  const [loading, setLoading] = useState(true);
  const [rssLoading, setRssLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [rssFilter, setRssFilter] = useState("");
  const [fetchingTrailers, setFetchingTrailers] = useState(false);
  const [trailerStatus, setTrailerStatus] = useState<string | null>(null);

  async function fetchItems() {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch("/api/admin/news", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      setItems(data.items);
    }
    setLoading(false);
  }

  async function fetchRss() {
    if (!user) return;
    setRssLoading(true);
    const token = await user.getIdToken();
    const res = await fetch(`/api/admin/news/rss${rssFilter ? `?source=${encodeURIComponent(rssFilter)}` : ""}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setHeadlines(data.headlines);
    }
    setRssLoading(false);
  }

  async function refreshRss() {
    if (!user) return;
    setRefreshing(true);
    const token = await user.getIdToken();
    await fetch("/api/admin/news/rss", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "refresh" }),
    });
    await fetchRss();
    setRefreshing(false);
  }

  async function dismissHeadline(id: string) {
    if (!user) return;
    const token = await user.getIdToken();
    await fetch("/api/admin/news/rss", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dismiss", id }),
    });
    setHeadlines((prev) => prev.filter((h) => h.id !== id));
  }

  async function deleteItem(id: string) {
    if (!user || !confirm("Delete this news item?")) return;
    const token = await user.getIdToken();
    await fetch(`/api/admin/news/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  useEffect(() => { fetchItems(); }, [user]);
  useEffect(() => { if (tab === "rss") fetchRss(); }, [tab, user, rssFilter]);

  const sources = [...new Set(headlines.map((h) => h.feedSource))].sort();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">News</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              if (!user) return;
              setFetchingTrailers(true);
              setTrailerStatus(null);
              const token = await user.getIdToken();
              const res = await fetch("/api/admin/news/fetch-trailers", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
              });
              const data = await res.json();
              setTrailerStatus(`Checked ${data.checked} titles, found ${data.created} new trailer${data.created !== 1 ? "s" : ""}`);
              setFetchingTrailers(false);
              if (data.created > 0) fetchItems();
              setTimeout(() => setTrailerStatus(null), 5000);
            }}
            disabled={fetchingTrailers}
            className="inline-flex items-center gap-2 px-3 py-2 bg-[var(--surface)] border border-[var(--border)] text-white text-sm rounded-lg hover:border-[var(--ratist-red)] transition-colors disabled:opacity-50"
          >
            <Play className={`w-3.5 h-3.5 ${fetchingTrailers ? "animate-pulse" : ""}`} /> {fetchingTrailers ? "Fetching..." : "Fetch Trailers"}
          </button>
          <Link
            href="/admin/news/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--ratist-red)] text-white text-sm font-semibold rounded-lg hover:bg-[var(--ratist-red-hover)] transition-colors"
          >
            <Plus className="w-4 h-4" /> New Article
          </Link>
        </div>
      </div>
      {trailerStatus && <p className="text-sm text-[var(--foreground-muted)]">{trailerStatus}</p>}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[var(--border)]">
        <button
          onClick={() => setTab("published")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === "published"
              ? "border-[var(--ratist-red)] text-white"
              : "border-transparent text-[var(--foreground-muted)] hover:text-white"
          }`}
        >
          <Newspaper className="w-4 h-4" /> Articles ({items.length})
        </button>
        <button
          onClick={() => setTab("rss")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === "rss"
              ? "border-[var(--ratist-red)] text-white"
              : "border-transparent text-[var(--foreground-muted)] hover:text-white"
          }`}
        >
          <Rss className="w-4 h-4" /> RSS Inbox ({headlines.length})
        </button>
      </div>

      {/* Articles tab */}
      {tab === "published" && (
        loading ? (
          <p className="text-[var(--foreground-muted)]">Loading...</p>
        ) : items.length === 0 ? (
          <p className="text-[var(--foreground-muted)] text-center py-10">No news articles yet. Create one or write about an RSS headline.</p>
        ) : (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl divide-y divide-[var(--border)]">
            {items.map((item) => (
              <div key={item.id} className="flex items-center justify-between px-5 py-3 gap-4">
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/news/${item.id}/edit`} className="text-sm font-medium text-white hover:text-[var(--ratist-red)] transition-colors line-clamp-1">
                    {item.title}
                  </Link>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-[var(--foreground-muted)]">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${item.type === "EDITORIAL" ? "bg-blue-500/10 text-blue-400" : "bg-purple-500/10 text-purple-400"}`}>
                      {item.type}
                    </span>
                    {item.author && <span>by {item.author.name}</span>}
                    {item.sourceName && <span>via {item.sourceName}</span>}
                    <span>{item.viewCount} views</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {item.published ? (
                    <span className="text-emerald-400"><Eye className="w-4 h-4" /></span>
                  ) : (
                    <span className="text-[var(--foreground-muted)]"><EyeOff className="w-4 h-4" /></span>
                  )}
                  <button onClick={() => deleteItem(item.id)} className="text-[var(--foreground-muted)] hover:text-red-400 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* RSS Inbox tab */}
      {tab === "rss" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button
              onClick={refreshRss}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm text-[var(--foreground-muted)] hover:text-white hover:border-[var(--ratist-red)] transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh Feeds
            </button>
            {sources.length > 0 && (
              <select
                value={rssFilter}
                onChange={(e) => setRssFilter(e.target.value)}
                className="bg-[var(--surface)] border border-[var(--border)] text-sm text-white rounded-lg px-3 py-1.5 focus:outline-none focus:border-[var(--ratist-red)]"
              >
                <option value="">All Sources</option>
                {sources.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
          </div>

          {rssLoading ? (
            <p className="text-[var(--foreground-muted)]">Loading RSS headlines...</p>
          ) : headlines.length === 0 ? (
            <p className="text-[var(--foreground-muted)] text-center py-10">No new headlines. Click &quot;Refresh Feeds&quot; to fetch the latest.</p>
          ) : (
            <div className="space-y-2">
              {headlines.map((h) => (
                <div key={h.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex gap-4">
                  {h.imageUrl && (
                    <div className="w-20 h-14 rounded-lg overflow-hidden bg-[var(--surface-2)] shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={h.imageUrl} alt="" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white line-clamp-2">{h.title}</p>
                    {h.description && <p className="text-xs text-[var(--foreground-muted)] line-clamp-1 mt-0.5">{h.description}</p>}
                    <div className="flex items-center gap-2 mt-1.5 text-xs text-[var(--foreground-muted)]">
                      <span className="font-medium">{h.feedSource}</span>
                      <span>{new Date(h.fetchedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <Link
                      href={`/admin/news/new?rss=${h.id}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-[var(--ratist-red)]/10 text-[var(--ratist-red)] text-xs font-medium rounded-lg hover:bg-[var(--ratist-red)]/20 transition-colors"
                    >
                      <PenSquare className="w-3 h-3" /> Write
                    </Link>
                    <a
                      href={h.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[var(--foreground-muted)] text-xs rounded-lg hover:text-white transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" /> Source
                    </a>
                    <button
                      onClick={() => dismissHeadline(h.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[var(--foreground-muted)] text-xs rounded-lg hover:text-red-400 transition-colors"
                    >
                      <X className="w-3 h-3" /> Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
