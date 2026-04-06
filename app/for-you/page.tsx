"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { Users, Sparkles, TrendingUp, Bookmark, AlertCircle } from "lucide-react";
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

interface FeedData {
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

  const hasFollowActivity = data.followActivity.length > 0;
  const hasBecauseYouLiked = data.becauseYouLiked.length > 0;
  const hasTrending = data.trendingInCluster.length > 0;
  const hasWatchlist = data.unwatchedWatchlist.length > 0;
  const hasIncomplete = data.completeTheRating.length > 0;
  const isEmpty = !hasFollowActivity && !hasBecauseYouLiked && !hasTrending && !hasWatchlist && !hasIncomplete;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
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
          <MediaGrid items={data.followActivity} />
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
          <MediaGrid items={data.completeTheRating.map((item) => ({ ...item, type: "movie" as const }))} />
        </section>
      )}
    </div>
  );
}
