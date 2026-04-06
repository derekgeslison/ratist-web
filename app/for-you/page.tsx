"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { posterUrl } from "@/lib/tmdb";
import { scoreColor } from "@/lib/ratings";
import { Tv, Users, Sparkles, TrendingUp, Bookmark, AlertCircle, Star } from "lucide-react";

interface FollowItem {
  type: "movie" | "tv";
  id: string;
  tmdbId: number;
  title: string;
  posterPath: string | null;
  rating: number | null;
  reviewSnippet: string | null;
  createdAt: string;
  user: { name: string; firebaseUid: string; avatarUrl: string | null };
}

interface BecauseYouLikedSection {
  source: { tmdbId: number; title: string; posterPath: string | null };
  recs: { tmdbId: number; title: string; posterPath: string | null; voteAverage: number }[];
}

interface TrendingItem {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  communityRating: number;
  ratingCount: number;
}

interface WatchlistItem {
  tmdbId: number;
  title: string;
  posterPath: string | null;
}

interface IncompleteItem {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  currentRating: number | null;
  reviewType: string;
}

interface FeedData {
  followActivity: FollowItem[];
  becauseYouLiked: BecauseYouLikedSection[];
  trendingInCluster: TrendingItem[];
  unwatchedWatchlist: WatchlistItem[];
  completeTheRating: IncompleteItem[];
}

export default function ForYouPage() {
  const { user, loading } = useAuth();
  const [data, setData] = useState<FeedData | null>(null);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) { setFetching(false); return; }
    user.getIdToken().then((token) =>
      fetch("/api/feed/for-you", { headers: { Authorization: `Bearer ${token}` } })
    )
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [user, loading]);

  if (loading || fetching) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-2xl font-bold text-white mb-8">For You</h1>
        <p className="text-[var(--foreground-muted)] text-center py-20">Loading your personalized feed...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-2xl font-bold text-white mb-4">For You</h1>
        <p className="text-[var(--foreground-muted)] mb-6">Your personalized feed of recommendations, activity, and things to watch.</p>
        <Link href="/auth/signin" className="inline-block bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white font-semibold px-6 py-3 rounded-full transition-colors">
          Sign in to get started
        </Link>
      </div>
    );
  }

  if (!data) return null;

  const hasFollowActivity = data.followActivity.length > 0;
  const hasBecauseYouLiked = data.becauseYouLiked.length > 0;
  const hasTrending = data.trendingInCluster.length > 0;
  const hasWatchlist = data.unwatchedWatchlist.length > 0;
  const hasIncomplete = data.completeTheRating.length > 0;
  const isEmpty = !hasFollowActivity && !hasBecauseYouLiked && !hasTrending && !hasWatchlist && !hasIncomplete;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">For You</h1>
        <p className="text-sm text-[var(--foreground-muted)]">Your personalized feed based on your taste, activity, and who you follow.</p>
      </div>

      {isEmpty && (
        <div className="text-center py-16 text-[var(--foreground-muted)]">
          <p className="mb-2">Your feed is empty right now.</p>
          <p className="text-sm">Start rating movies, following users, and adding to your watchlist to see personalized content here.</p>
        </div>
      )}

      {/* Following Activity */}
      {hasFollowActivity && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-[var(--ratist-red)]" />
            <h2 className="text-lg font-semibold text-white">From People You Follow</h2>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
            {data.followActivity.map((item) => (
              <Link
                key={item.id}
                href={`/${item.type === "tv" ? "shows" : "movies"}/${item.tmdbId}`}
                className="flex-shrink-0 w-32 group"
              >
                <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-[var(--surface-2)] mb-2 border border-[var(--border)] group-hover:border-[var(--ratist-red)] transition-colors">
                  {item.posterPath && (
                    <Image src={posterUrl(item.posterPath, "w185")} alt={item.title} fill sizes="128px" className="object-cover" />
                  )}
                  {item.type === "tv" && (
                    <div className="absolute top-1 left-1 bg-blue-600/90 text-white rounded px-1 py-0.5 flex items-center gap-0.5 z-10">
                      <Tv className="w-2.5 h-2.5" />
                      <span className="text-[8px] font-bold leading-none">TV</span>
                    </div>
                  )}
                  {item.rating != null && (
                    <div className="absolute bottom-1 right-1 bg-black/70 rounded px-1.5 py-0.5">
                      <span className="text-xs font-bold" style={{ color: scoreColor(item.rating) }}>{item.rating.toFixed(1)}</span>
                    </div>
                  )}
                </div>
                <p className="text-xs font-medium text-white line-clamp-1">{item.title}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  {item.user.avatarUrl ? (
                    <Image src={item.user.avatarUrl} alt="" width={14} height={14} className="w-3.5 h-3.5 rounded-full object-cover" />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full bg-[var(--ratist-red)] flex items-center justify-center text-[6px] font-bold text-white">{item.user.name[0]}</div>
                  )}
                  <span className="text-[10px] text-[var(--foreground-muted)] line-clamp-1">{item.user.name}</span>
                </div>
              </Link>
            ))}
          </div>
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
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
            {section.recs.map((rec) => (
              <Link key={rec.tmdbId} href={`/movies/${rec.tmdbId}`} className="flex-shrink-0 w-32 group">
                <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-[var(--surface-2)] mb-2 border border-[var(--border)] group-hover:border-[var(--ratist-red)] transition-colors">
                  {rec.posterPath && (
                    <Image src={posterUrl(rec.posterPath, "w185")} alt={rec.title} fill sizes="128px" className="object-cover" />
                  )}
                  <div className="absolute bottom-1 right-1 bg-black/70 rounded px-1.5 py-0.5">
                    <span className="text-xs font-bold" style={{ color: scoreColor(rec.voteAverage) }}>{rec.voteAverage.toFixed(1)}</span>
                  </div>
                </div>
                <p className="text-xs font-medium text-white line-clamp-2">{rec.title}</p>
              </Link>
            ))}
          </div>
        </section>
      ))}

      {/* Trending in Community */}
      {hasTrending && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-[var(--ratist-red)]" />
            <h2 className="text-lg font-semibold text-white">Trending on The Ratist</h2>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
            {data.trendingInCluster.map((item) => (
              <Link key={item.tmdbId} href={`/movies/${item.tmdbId}`} className="flex-shrink-0 w-32 group">
                <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-[var(--surface-2)] mb-2 border border-[var(--border)] group-hover:border-[var(--ratist-red)] transition-colors">
                  {item.posterPath && (
                    <Image src={posterUrl(item.posterPath, "w185")} alt={item.title} fill sizes="128px" className="object-cover" />
                  )}
                  <div className="absolute bottom-1 right-1 bg-black/70 rounded px-1.5 py-0.5 flex items-center gap-1">
                    <Star className="w-2.5 h-2.5 text-yellow-400" />
                    <span className="text-xs font-bold text-white">{item.communityRating}</span>
                  </div>
                </div>
                <p className="text-xs font-medium text-white line-clamp-2">{item.title}</p>
                <p className="text-[10px] text-[var(--foreground-muted)]">{item.ratingCount} Ratist rating{item.ratingCount !== 1 ? "s" : ""}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Unwatched Watchlist */}
      {hasWatchlist && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Bookmark className="w-5 h-5 text-[var(--ratist-red)]" />
            <h2 className="text-lg font-semibold text-white">From Your Watchlist</h2>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
            {data.unwatchedWatchlist.map((item) => (
              <Link key={item.tmdbId} href={`/movies/${item.tmdbId}`} className="flex-shrink-0 w-32 group">
                <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-[var(--surface-2)] mb-2 border border-[var(--border)] group-hover:border-[var(--ratist-red)] transition-colors">
                  {item.posterPath && (
                    <Image src={posterUrl(item.posterPath, "w185")} alt={item.title} fill sizes="128px" className="object-cover" />
                  )}
                </div>
                <p className="text-xs font-medium text-white line-clamp-2">{item.title}</p>
              </Link>
            ))}
          </div>
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
            These movies have quick ratings or incomplete reviews. Fill in the full breakdown to get a more accurate Ratist score.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {data.completeTheRating.map((item) => (
              <Link key={item.tmdbId} href={`/movies/${item.tmdbId}/rate`} className="group">
                <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-[var(--surface-2)] mb-2 border border-orange-400/30 group-hover:border-orange-400 transition-colors">
                  {item.posterPath && (
                    <Image src={posterUrl(item.posterPath, "w185")} alt={item.title} fill sizes="160px" className="object-cover" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <div className="absolute bottom-2 left-2 right-2">
                    <span className="text-[10px] uppercase tracking-wider text-orange-300 font-semibold">
                      {item.reviewType === "basic" ? "Quick rating" : "Incomplete"}
                    </span>
                    {item.currentRating != null && (
                      <span className="text-sm font-bold text-white ml-2">{item.currentRating.toFixed(1)}</span>
                    )}
                  </div>
                </div>
                <p className="text-xs font-medium text-white line-clamp-1">{item.title}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
