"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import SignInLink from "@/components/SignInLink";
import { useAuth } from "@/context/AuthContext";
import { Users, Sparkles, TrendingUp, Bookmark, BookmarkCheck, AlertCircle, RefreshCw, Star, ChevronDown, Eye, EyeOff, Check, Settings, GripVertical, X, CalendarHeart, MessageSquare } from "lucide-react";
import Image from "next/image";
import { posterUrl } from "@/lib/tmdb";
import RatingBadge from "@/components/RatingBadge";
import { scoreColor } from "@/lib/ratings";
import { useMovieUserState } from "@/hooks/useMovieUserState";
import MovieCard from "@/components/MovieCard";
import ShowCard from "@/components/ShowCard";
import SpotlightCards from "@/components/SpotlightCards";
import AdUnit from "@/components/AdUnit";
import FirstVisitHint from "@/components/FirstVisitHint";
import { useWatchlistFlow } from "@/components/WatchlistFlow";

interface MediaItem {
  type: "movie" | "tv";
  tmdbId: number;
  title: string;
  posterPath: string | null;
  voteAverage: number;
  releaseDate: string | null;
  user?: { name: string; firebaseUid: string; avatarUrl: string | null };
  userRating?: number | null;
}

interface BecauseYouLikedSection {
  source: { tmdbId: number; title: string; posterPath: string | null };
  recs: MediaItem[];
}

interface IncompleteItem {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  voteAverage: number;
  releaseDate: string | null;
  currentRating: number | null;
  reviewType: string;
}

interface TopPick {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  releaseDate: string | null;
  voteAverage: number | null;
  communityRatistAvg?: number | null;
  estimatedRating: number;
}

interface AnticipatedItem extends MediaItem {
  followingCount: number;
}

interface ForumActivityItem {
  threadId: string;
  threadSlug: string;
  threadTitle: string;
  threadType: string;
  createdAt: string;
  user: { firebaseUid: string; name: string; avatarUrl: string | null };
}

interface FeedData {
  topPicks: TopPick[];
  followActivity: MediaItem[];
  followedForumActivity: ForumActivityItem[];
  becauseYouLiked: BecauseYouLikedSection[];
  trendingInCluster: MediaItem[];
  unwatchedWatchlist: MediaItem[];
  anticipated: AnticipatedItem[];
  completeTheRating: IncompleteItem[];
  ratistReviewCount?: number;
  sectionOrder?: string[] | null;
}

const DEFAULT_SECTION_ORDER = ["topPicks", "anticipated", "becauseYouLiked", "trending", "watchlist", "following", "incomplete"];
const SECTION_LABELS: Record<string, string> = {
  topPicks: "Top Picks For You",
  anticipated: "Anticipated by People You Follow",
  becauseYouLiked: "Because You Liked",
  trending: "Trending on The Ratist",
  watchlist: "From Your Watchlist",
  following: "From People You Follow",
  incomplete: "Complete Your Rating",
};

function toMovieProps(item: MediaItem) {
  return {
    id: item.tmdbId,
    title: item.title,
    poster_path: item.posterPath,
    vote_average: item.voteAverage ?? 0,
    release_date: item.releaseDate ?? "",
    backdrop_path: null,
    overview: "",
    genre_ids: [],
  };
}

function toShowProps(item: MediaItem) {
  return {
    id: item.tmdbId,
    name: item.title,
    poster_path: item.posterPath,
    vote_average: item.voteAverage ?? 0,
    first_air_date: item.releaseDate ?? "",
    backdrop_path: null,
    overview: "",
    genre_ids: [],
  };
}

function mergeSectionOrder(saved: string[] | null): string[] {
  if (!saved) return [...DEFAULT_SECTION_ORDER];
  const result = saved.filter((k) => DEFAULT_SECTION_ORDER.includes(k));
  for (let i = 0; i < DEFAULT_SECTION_ORDER.length; i++) {
    const key = DEFAULT_SECTION_ORDER[i];
    if (!result.includes(key)) {
      result.splice(Math.min(i, result.length), 0, key);
    }
  }
  return result;
}

function AnticipatedGrid({ items }: { items: AnticipatedItem[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
      {items.map((item) => (
        <div key={`${item.type}-${item.tmdbId}`} className="relative">
          {item.type === "tv" ? (
            <ShowCard show={toShowProps(item) as never} />
          ) : (
            <MovieCard movie={toMovieProps(item) as never} />
          )}
          {/* Subtle "+N following" badge — static, no popover. The
              count is per visibility-gated watchlist (private
              watchlists already filtered server-side). */}
          <span className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-black/75 border border-[var(--ratist-red)]/60 text-white">
            <Users className="w-3 h-3 text-[var(--ratist-red)]" />
            +{item.followingCount} following
          </span>
        </div>
      ))}
    </div>
  );
}

function MediaGrid({ items, showUser }: { items: MediaItem[]; showUser?: boolean }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
      {items.map((item) => (
        <div key={`${item.type}-${item.tmdbId}-${item.user?.firebaseUid ?? ""}`}>
          {item.type === "tv" ? (
            <ShowCard show={toShowProps(item) as never} />
          ) : (
            <MovieCard movie={toMovieProps(item) as never} />
          )}
          {showUser && item.user && (
            <Link href={`/profile/${item.user.firebaseUid}`} className="flex items-center gap-1.5 mt-1.5 group">
              {item.userRating != null && (
                <span className="text-[10px] font-bold" style={{ color: scoreColor(item.userRating) }}>
                  {item.userRating.toFixed(1)}
                </span>
              )}
              {item.user.avatarUrl ? (
                <Image src={item.user.avatarUrl} alt="" width={16} height={16} className="rounded-full shrink-0" />
              ) : (
                <div className="w-4 h-4 rounded-full bg-[var(--surface-2)] flex items-center justify-center text-[7px] text-[var(--foreground-muted)] shrink-0">
                  {item.user.name[0]}
                </div>
              )}
              <span className="text-[10px] text-[var(--foreground-muted)] group-hover:text-white transition-colors truncate">
                {item.user.name}
              </span>
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}

// Recent forum threads started by followed users in the last 7
// days. Rendered as a compact list inside the "From People You
// Follow" section, below the rating grid. Replies/comments are not
// included — this surface is for surfacing new conversations to join,
// not in-thread chatter.
function FollowedForumActivity({ items, hasMediaGridAbove }: { items: ForumActivityItem[]; hasMediaGridAbove: boolean }) {
  return (
    <div className={hasMediaGridAbove ? "mt-6" : ""}>
      <div className="flex items-center gap-2 mb-2">
        <MessageSquare className="w-3.5 h-3.5 text-[var(--ratist-red)]" />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">Recent forum threads</p>
      </div>
      <ul className="space-y-1.5">
        {items.map((it) => (
          <li
            key={`${it.threadId}-${it.user.firebaseUid}`}
            className="bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--ratist-red)]/50 rounded-lg px-3 py-2.5 transition-colors"
          >
            <div className="flex items-start gap-2.5">
              <Link href={`/profile/${it.user.firebaseUid}`} className="shrink-0 mt-0.5">
                {it.user.avatarUrl ? (
                  <Image src={it.user.avatarUrl} alt="" width={24} height={24} className="rounded-full" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-[var(--surface-2)] flex items-center justify-center text-[10px] text-[var(--foreground-muted)]">
                    {it.user.name[0]}
                  </div>
                )}
              </Link>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-[var(--foreground-muted)] leading-snug">
                  <Link href={`/profile/${it.user.firebaseUid}`} className="font-semibold text-white hover:text-[var(--ratist-red)] transition-colors">
                    {it.user.name}
                  </Link>
                  {" "}posted{" "}
                  <Link href={`/forum/t/${it.threadSlug}`} className="text-white hover:text-[var(--ratist-red)] transition-colors">
                    &ldquo;{it.threadTitle}&rdquo;
                  </Link>
                  <span className="text-[10px] text-[var(--foreground-muted)] ml-1.5">· {timeAgo(it.createdAt)}</span>
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Compact relative-time formatter for the forum activity list — no
// dep on date-fns because the rest of the file doesn't pull it in
// and this is the only spot using "Xh ago" style.
function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function TopPickRow({ pick, rank }: { pick: TopPick; rank: number }) {
  const { user } = useAuth();
  const { seen, watchlisted, markSeen: persistSeen, markUnseen: persistUnseen, setWatchlistState } = useMovieUserState(pick.tmdbId);
  const [markingS, setMarkingS] = useState(false);

  // Shared watchlist flow — same multi-list picker behavior used on
  // /movies, /shows, detail pages, etc. (see WatchlistFlow.tsx).
  // Without this, the row was POSTing directly to the default-list
  // endpoint and skipping the picker that lets users choose among
  // multiple watchlists.
  const { handleClick: handleWatchlistClick, busy: markingW, picker: watchlistPicker } = useWatchlistFlow({
    tmdbId: pick.tmdbId,
    mediaType: "movie",
    title: pick.title,
    posterPath: pick.posterPath,
    releaseDate: pick.releaseDate,
    onWatchlistedChange: setWatchlistState,
  });

  async function toggleSeen() {
    if (!user || markingS) return;
    setMarkingS(true);
    const token = await user.getIdToken();
    const res = await fetch(`/api/movies/${pick.tmdbId}/seen`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: pick.title, poster_path: pick.posterPath, release_date: pick.releaseDate }),
    }).catch(() => null);
    if (res?.ok) { const d = await res.json(); if (d.seen) persistSeen(); else persistUnseen(); }
    setMarkingS(false);
  }

  return (
    <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-3 items-center px-4 py-2.5 hover:bg-[var(--surface-2)] transition-colors border-b border-[var(--border)]/30 last:border-b-0">
      <span className="text-sm font-bold text-[var(--foreground-muted)] w-6 text-center">{rank}</span>
      <Link href={`/movies/${pick.tmdbId}`} className="flex items-center gap-2.5 min-w-0">
        {pick.posterPath ? (
          <Image src={posterUrl(pick.posterPath, "w92")} alt="" width={28} height={42} className="rounded w-7 h-10 object-cover shrink-0" />
        ) : (
          <div className="w-7 h-10 rounded bg-[var(--surface-2)] shrink-0" />
        )}
        <div className="min-w-0">
          <p className="text-sm text-white truncate hover:text-[var(--ratist-red)] transition-colors">{pick.title}</p>
          <p className="text-xs text-[var(--foreground-muted)]">{pick.releaseDate?.slice(0, 4) ?? "—"}</p>
        </div>
      </Link>
      {/* Side-by-side eats ~90-100px of horizontal real estate and
          forces long movie titles to truncate on phones. Stack the
          two rating badges vertically below sm so the title gets the
          breathing room; side-by-side on tablet+. */}
      <div className="flex flex-col sm:flex-row items-end sm:items-center gap-0.5 sm:gap-2">
        <RatingBadge type="community" score={pick.communityRatistAvg ?? pick.voteAverage ?? null} size="sm" />
        <RatingBadge type="ratist" score={pick.estimatedRating} isEstimate size="sm" />
      </div>
      {user && (
        <div className="flex items-center gap-1">
          <button onClick={toggleSeen} disabled={markingS}
            className={`p-1.5 rounded transition-colors ${seen ? "text-green-400" : "text-[var(--foreground-muted)] hover:text-green-400"}`}
            title={seen ? "Seen" : "Mark as seen"}>
            {seen ? <Check className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
          <button onClick={handleWatchlistClick} disabled={markingW}
            className={`p-1.5 rounded transition-colors ${watchlisted ? "text-blue-400" : "text-[var(--foreground-muted)] hover:text-blue-400"}`}
            title={watchlisted ? "Watchlisted" : "Add to watchlist"}>
            {watchlisted ? <BookmarkCheck className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
          </button>
          {watchlistPicker}
        </div>
      )}
    </div>
  );
}

export default function ForYouPage() {
  const { user, loading } = useAuth();
  const [data, setData] = useState<FeedData | null>(null);
  const [fetching, setFetching] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAllPicks, setShowAllPicks] = useState(false);
  const [editingOrder, setEditingOrder] = useState(false);
  const [tempOrder, setTempOrder] = useState<string[]>(DEFAULT_SECTION_ORDER);
  const dragItem = useRef<number | null>(null);
  const dragOver = useRef<number | null>(null);

  const fetchFeed = useCallback(async (isRefresh = false) => {
    if (!user) { setFetching(false); return; }
    if (isRefresh) setRefreshing(true); else setFetching(true);
    try {
      const token = await user.getIdToken();
      const seed = Date.now();
      const res = await fetch(`/api/feed/for-you?seed=${seed}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setData(await res.json());
    } catch { /* ignore */ }
    finally { setFetching(false); setRefreshing(false); }
  }, [user]);

  useEffect(() => {
    if (loading) return;
    fetchFeed();
  }, [loading, fetchFeed]);

  // Hash-scroll AFTER data renders. The browser tries to scroll on
  // initial nav, but the target section doesn't exist yet because
  // the feed loads via fetch in an effect. Re-run the scroll once
  // the data is in the DOM so /for-you#anticipated (linked from
  // /releases) lands on the right section.
  useEffect(() => {
    if (!data) return;
    const hash = window.location.hash;
    if (!hash) return;
    requestAnimationFrame(() => {
      const el = document.querySelector(hash);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [data]);

  if (loading || fetching) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-2xl font-bold text-white mb-8">For You</h1>
        <p className="text-[var(--foreground-muted)] text-center py-20">Loading your personalized feed...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-2xl font-bold text-white mb-4">For You</h1>
        <p className="text-[var(--foreground-muted)] mb-6">Your personalized feed of recommendations, activity, and things to watch.</p>
        <SignInLink className="inline-block bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white font-semibold px-6 py-3 rounded-full transition-colors">
          Sign in to get started
        </SignInLink>
      </div>
    );
  }

  if (!data) return null;

  const hasTopPicks = (data.topPicks?.length ?? 0) > 0;
  const hasFollowActivity = data.followActivity.length > 0;
  const hasFollowedForumActivity = data.followedForumActivity?.length > 0;
  const hasBecauseYouLiked = data.becauseYouLiked.length > 0;
  const hasTrending = data.trendingInCluster.length > 0;
  const hasWatchlist = data.unwatchedWatchlist.length > 0;
  const hasAnticipated = (data.anticipated?.length ?? 0) > 0;
  const hasIncomplete = data.completeTheRating.length > 0;
  const isEmpty = !hasTopPicks && !hasFollowActivity && !hasFollowedForumActivity && !hasBecauseYouLiked && !hasTrending && !hasWatchlist && !hasAnticipated && !hasIncomplete;

  // Merge saved order with default — when a new section is added to
  // DEFAULT_SECTION_ORDER, existing users' saved orders won't include
  // it, which would hide the section from them entirely. Inject any
  // missing default sections at their default position so new
  // sections become visible without resetting custom orders.
  const sectionOrder = mergeSectionOrder(data.sectionOrder ?? null);

  function openOrderEditor() {
    setTempOrder([...sectionOrder]);
    setEditingOrder(true);
  }

  async function saveOrder() {
    if (!user) return;
    setEditingOrder(false);
    // Update local data so sections reorder immediately
    if (data) (data as FeedData & { sectionOrder: string[] }).sectionOrder = tempOrder;
    const token = await user.getIdToken();
    await fetch("/api/feed/for-you/order", {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ order: tempOrder }),
    }).catch(() => {});
  }

  function handleDragEnd() {
    if (dragItem.current === null || dragOver.current === null || dragItem.current === dragOver.current) return;
    const reordered = [...tempOrder];
    const [moved] = reordered.splice(dragItem.current, 1);
    reordered.splice(dragOver.current, 0, moved);
    setTempOrder(reordered);
    dragItem.current = null;
    dragOver.current = null;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
      {data?.ratistReviewCount != null && data.ratistReviewCount < 10 && (
        <div className="bg-[var(--ratist-red)]/10 border border-[var(--ratist-red)]/20 rounded-xl px-4 py-3 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-[var(--ratist-red)] shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-white font-medium">Your recommendations will improve with more reviews</p>
            <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
              You have {data.ratistReviewCount}{" "}of 10 Ratist reviews needed for personalized recommendations.
              Quick reviews don&apos;t count — fill out the full rating form for better results.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">For You</h1>
          <p className="text-sm text-[var(--foreground-muted)]">Your personalized feed based on your taste, activity, and who you follow.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openOrderEditor}
            className="p-2 rounded-lg border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white hover:border-[var(--ratist-red)] transition-colors"
            title="Customize section order"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={() => fetchFeed(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border)] text-sm text-[var(--foreground-muted)] hover:text-white hover:border-[var(--ratist-red)] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Section order editor */}
      {editingOrder && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Customize Section Order</h3>
            <button onClick={() => setEditingOrder(false)}><X className="w-4 h-4 text-[var(--foreground-muted)]" /></button>
          </div>
          <p className="text-xs text-[var(--foreground-muted)] mb-3">Reorder the sections on your For You page.</p>
          <div className="space-y-1.5 mb-4">
            {tempOrder.map((key, idx) => (
              <div
                key={key}
                draggable
                onDragStart={() => { dragItem.current = idx; }}
                onDragEnter={() => { dragOver.current = idx; }}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => e.preventDefault()}
                className="flex items-center gap-3 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 sm:cursor-grab sm:active:cursor-grabbing"
              >
                <GripVertical className="w-4 h-4 text-[var(--foreground-muted)] shrink-0 hidden sm:block" />
                <span className="text-sm text-white flex-1">{SECTION_LABELS[key] ?? key}</span>
                <div className="flex items-center gap-1 sm:hidden">
                  <button
                    onClick={() => { if (idx === 0) return; const r = [...tempOrder]; [r[idx - 1], r[idx]] = [r[idx], r[idx - 1]]; setTempOrder(r); }}
                    disabled={idx === 0}
                    className="p-1 rounded text-[var(--foreground-muted)] hover:text-white disabled:opacity-20 transition-colors"
                  >
                    <ChevronDown className="w-4 h-4 rotate-180" />
                  </button>
                  <button
                    onClick={() => { if (idx === tempOrder.length - 1) return; const r = [...tempOrder]; [r[idx], r[idx + 1]] = [r[idx + 1], r[idx]]; setTempOrder(r); }}
                    disabled={idx === tempOrder.length - 1}
                    className="p-1 rounded text-[var(--foreground-muted)] hover:text-white disabled:opacity-20 transition-colors"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={saveOrder} className="px-4 py-1.5 bg-[var(--ratist-red)] text-white text-sm font-semibold rounded-lg hover:bg-[var(--ratist-red-hover)] transition-colors">
              Save Order
            </button>
            <button onClick={() => { setTempOrder([...DEFAULT_SECTION_ORDER]); }} className="px-4 py-1.5 text-sm text-[var(--foreground-muted)] hover:text-white transition-colors">
              Reset to Default
            </button>
          </div>
        </div>
      )}

      <SpotlightCards placement="for_you" />

      {isEmpty && (
        <>
          <FirstVisitHint
            storageKey="for-you-empty"
            icon={Sparkles}
            title="Your For You feed"
            cta={{ label: "Rate movies", href: "/movies" }}
          >
            Personalized recommendations from people who rate the way you do — once we have enough rating history. Rate at least 10 movies (the full rubric works best) and we&rsquo;ll start surfacing taste-matched picks here.
          </FirstVisitHint>
          <div className="text-center py-16 text-[var(--foreground-muted)]">
            <p className="mb-2">Your feed is empty right now.</p>
            <p className="text-sm">Start rating movies, following users, and adding to your watchlist to see personalized content here.</p>
          </div>
        </>
      )}

      <AdUnit slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_HOME ?? ""} format="auto" className="mb-8" />

      {/* Sections rendered in user's preferred order */}
      {sectionOrder.map((sectionKey) => {
        if (sectionKey === "topPicks" && hasTopPicks) return (
          <section key="topPicks">
            <div className="flex items-center gap-2 mb-4">
              <Star className="w-5 h-5 text-[var(--ratist-red)]" />
              <h2 className="text-lg font-semibold text-white">Top Picks For You</h2>
            </div>
            <p className="text-xs text-[var(--foreground-muted)] mb-4">Movies we think you&apos;d rate highest based on your taste profile. Only showing movies you haven&apos;t seen.</p>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
              {(showAllPicks ? data.topPicks : data.topPicks.slice(0, 10)).map((pick, i) => (
                <TopPickRow key={pick.tmdbId} pick={pick} rank={i + 1} />
              ))}
            </div>
            {data.topPicks.length > 10 && (
              <button
                onClick={() => setShowAllPicks(!showAllPicks)}
                className="flex items-center gap-1 mt-3 text-sm text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] transition-colors"
              >
                <ChevronDown className={`w-4 h-4 transition-transform ${showAllPicks ? "rotate-180" : ""}`} />
                {showAllPicks ? "Show less" : `Show ${data.topPicks.length - 10} more`}
              </button>
            )}
          </section>
        );

        if (sectionKey === "anticipated" && hasAnticipated) return (
          <section key="anticipated" id="anticipated" className="scroll-mt-24">
            <div className="flex items-center gap-2 mb-4">
              <CalendarHeart className="w-5 h-5 text-[var(--ratist-red)]" />
              <h2 className="text-lg font-semibold text-white">Anticipated by People You Follow</h2>
            </div>
            <p className="text-xs text-[var(--foreground-muted)] mb-4">
              Upcoming films and shows on the watchlists of people you follow. Sorted by how many of them are anticipating it.
            </p>
            <AnticipatedGrid items={data.anticipated} />
          </section>
        );

        if (sectionKey === "becauseYouLiked" && hasBecauseYouLiked) return (
          <div key="becauseYouLiked" className="space-y-12">
            {data.becauseYouLiked.map((section) => (
              <section key={section.source.tmdbId}>
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="w-5 h-5 text-[var(--ratist-red)]" />
                  <h2 className="text-lg font-semibold text-white">
                    Because you liked{" "}
                    <Link href={`/movies/${section.source.tmdbId}`} className="text-[var(--ratist-red)] hover:underline">
                      {section.source.title}
                    </Link>
                  </h2>
                </div>
                <MediaGrid items={section.recs} />
              </section>
            ))}
          </div>
        );

        if (sectionKey === "trending" && hasTrending) return (
          <section key="trending">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-[var(--ratist-red)]" />
              <h2 className="text-lg font-semibold text-white">Trending on The Ratist</h2>
            </div>
            <MediaGrid items={data.trendingInCluster} />
          </section>
        );

        if (sectionKey === "watchlist" && hasWatchlist) return (
          <section key="watchlist">
            <div className="flex items-center gap-2 mb-4">
              <Bookmark className="w-5 h-5 text-[var(--ratist-red)]" />
              <h2 className="text-lg font-semibold text-white">From Your Watchlist</h2>
            </div>
            <MediaGrid items={data.unwatchedWatchlist} />
          </section>
        );

        if (sectionKey === "following" && (hasFollowActivity || hasFollowedForumActivity)) return (
          <section key="following">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-5 h-5 text-[var(--ratist-red)]" />
              <h2 className="text-lg font-semibold text-white">From People You Follow</h2>
            </div>
            {hasFollowActivity && <MediaGrid items={data.followActivity} showUser />}
            {hasFollowedForumActivity && (
              <FollowedForumActivity
                items={data.followedForumActivity}
                hasMediaGridAbove={hasFollowActivity}
              />
            )}
          </section>
        );

        if (sectionKey === "incomplete" && hasIncomplete) return (
          <section key="incomplete">
            <div className="flex items-center gap-2 mb-4">
              <AlertCircle className="w-5 h-5 text-orange-400" />
              <h2 className="text-lg font-semibold text-white">Complete Your Rating</h2>
            </div>
            <p className="text-xs text-[var(--foreground-muted)] mb-3">
              These have quick ratings or incomplete reviews. Fill in the full breakdown to get a more accurate Ratist score.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
              {data.completeTheRating.map((item) => (
                <div key={item.tmdbId} className="relative">
                  <MovieCard movie={toMovieProps({ ...item, type: "movie" }) as never} />
                  <Link
                    href={`/movies/${item.tmdbId}/rate`}
                    className="absolute top-2 right-2 z-10 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-colors hover:bg-orange-400 hover:text-black bg-black/70 border-orange-400/60 text-orange-300"
                  >
                    {item.reviewType === "basic" ? "Quick rating" : "Incomplete"}
                  </Link>
                </div>
              ))}
            </div>
          </section>
        );

        return null;
      })}
    </div>
  );
}
