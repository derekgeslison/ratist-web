"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { Users, Sparkles, TrendingUp, Bookmark, AlertCircle, RefreshCw, Star, ChevronDown } from "lucide-react";
import Image from "next/image";
import { posterUrl } from "@/lib/tmdb";
import MovieCard from "@/components/MovieCard";
import ShowCard from "@/components/ShowCard";

interface MediaItem {
  type: "movie" | "tv";
  tmdbId: number;
  title: string;
  posterPath: string | null;
  voteAverage: number;
  releaseDate: string | null;
  user?: { name: string; firebaseUid: string; avatarUrl: string | null };
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

interface FeedData {
  topPicks: TopPick[];
  followActivity: MediaItem[];
  becauseYouLiked: BecauseYouLikedSection[];
  trendingInCluster: MediaItem[];
  unwatchedWatchlist: MediaItem[];
  completeTheRating: IncompleteItem[];
}

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

function MediaGrid({ items }: { items: MediaItem[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
      {items.map((item) =>
        item.type === "tv" ? (
          <ShowCard key={`tv-${item.tmdbId}`} show={toShowProps(item) as never} />
        ) : (
          <MovieCard key={`movie-${item.tmdbId}`} movie={toMovieProps(item) as never} />
        )
      )}
    </div>
  );
}

export default function ForYouPage() {
  const { user, loading } = useAuth();
  const [data, setData] = useState<FeedData | null>(null);
  const [fetching, setFetching] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

  const [showAllPicks, setShowAllPicks] = useState(false);

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
        <Link href="/auth/signin" className="inline-block bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white font-semibold px-6 py-3 rounded-full transition-colors">
          Sign in to get started
        </Link>
      </div>
    );
  }

  if (!data) return null;

  const hasTopPicks = (data.topPicks?.length ?? 0) > 0;
  const hasFollowActivity = data.followActivity.length > 0;
  const hasBecauseYouLiked = data.becauseYouLiked.length > 0;
  const hasTrending = data.trendingInCluster.length > 0;
  const hasWatchlist = data.unwatchedWatchlist.length > 0;
  const hasIncomplete = data.completeTheRating.length > 0;
  const isEmpty = !hasTopPicks && !hasFollowActivity && !hasBecauseYouLiked && !hasTrending && !hasWatchlist && !hasIncomplete;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">For You</h1>
          <p className="text-sm text-[var(--foreground-muted)]">Your personalized feed based on your taste, activity, and who you follow.</p>
        </div>
        <button
          onClick={() => fetchFeed(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border)] text-sm text-[var(--foreground-muted)] hover:text-white hover:border-[var(--ratist-red)] transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {isEmpty && (
        <div className="text-center py-16 text-[var(--foreground-muted)]">
          <p className="mb-2">Your feed is empty right now.</p>
          <p className="text-sm">Start rating movies, following users, and adding to your watchlist to see personalized content here.</p>
        </div>
      )}

      {/* Top Picks For You */}
      {hasTopPicks && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Star className="w-5 h-5 text-[var(--ratist-red)]" />
            <h2 className="text-lg font-semibold text-white">Top Picks For You</h2>
          </div>
          <p className="text-xs text-[var(--foreground-muted)] mb-4">Movies we think you&apos;d rate highest based on your taste profile. Only showing movies you haven&apos;t seen.</p>
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
            <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 text-xs text-[var(--foreground-muted)] px-4 py-2 border-b border-[var(--border)]">
              <span className="w-6">#</span>
              <span>Movie</span>
              <span className="text-right w-16">Community</span>
              <span className="text-right w-16 text-[var(--ratist-red)] font-semibold">Estimate</span>
            </div>
            {(showAllPicks ? data.topPicks : data.topPicks.slice(0, 10)).map((pick, i) => (
              <Link
                key={pick.tmdbId}
                href={`/movies/${pick.tmdbId}`}
                className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 items-center px-4 py-2.5 hover:bg-[var(--surface-2)] transition-colors border-b border-[var(--border)]/30 last:border-b-0"
              >
                <span className="text-sm font-bold text-[var(--foreground-muted)] w-6 text-center">{i + 1}</span>
                <div className="flex items-center gap-2.5 min-w-0">
                  {pick.posterPath ? (
                    <Image src={posterUrl(pick.posterPath, "w92")} alt="" width={28} height={42} className="rounded w-7 h-10 object-cover shrink-0" />
                  ) : (
                    <div className="w-7 h-10 rounded bg-[var(--surface-2)] shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{pick.title}</p>
                    <p className="text-xs text-[var(--foreground-muted)]">{pick.releaseDate?.slice(0, 4) ?? "—"}</p>
                  </div>
                </div>
                <span className="text-sm text-[var(--foreground-muted)] w-16 text-right">{pick.communityRatistAvg ?? (pick.voteAverage ? pick.voteAverage.toFixed(1) : "—")}</span>
                <span className="text-sm font-bold text-[var(--ratist-red)] w-16 text-right">{pick.estimatedRating.toFixed(1)}</span>
              </Link>
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
      )}

      {/* Because You Liked X */}
      {hasBecauseYouLiked && data.becauseYouLiked.map((section) => (
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

      {/* Trending in Community */}
      {hasTrending && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-[var(--ratist-red)]" />
            <h2 className="text-lg font-semibold text-white">Trending on The Ratist</h2>
          </div>
          <MediaGrid items={data.trendingInCluster} />
        </section>
      )}

      {/* Unwatched Watchlist */}
      {hasWatchlist && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Bookmark className="w-5 h-5 text-[var(--ratist-red)]" />
            <h2 className="text-lg font-semibold text-white">From Your Watchlist</h2>
          </div>
          <MediaGrid items={data.unwatchedWatchlist} />
        </section>
      )}

      {/* Following Activity */}
      {hasFollowActivity && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-[var(--ratist-red)]" />
            <h2 className="text-lg font-semibold text-white">From People You Follow</h2>
          </div>
          <MediaGrid items={data.followActivity} />
        </section>
      )}

      {/* Complete the Rating */}
      {hasIncomplete && (
        <section>
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
      )}
    </div>
  );
}
