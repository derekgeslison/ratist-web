"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import ReviewCard from "./ReviewCard";
import SignInLink from "@/components/SignInLink";

interface Review {
  id: string;
  reviewText: string | null;
  ratistRating: number | null;
  overallRating: number | null;
  storyScore: number | null;
  styleScore: number | null;
  emotiveScore: number | null;
  actingScore: number | null;
  entertainScore: number | null;
  reviewType: string;
  fieldComments: Record<string, string> | null;
  categoryComments: Record<string, string> | null;
  hasSpoilers: boolean;
  commentsDisabled: boolean;
  createdAt: string;
  commentCount: number;
  likeCount: number;
  ratingScope?: string;
  seasonNumber?: number;
  user: { id: string; firebaseUid: string; name: string; avatarUrl: string | null };
}

interface Props {
  movieTmdbId?: number;
  showTmdbId?: number;
}

export default function FollowingReviews({ movieTmdbId, showTmdbId }: Props) {
  const { user, loading } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [fetching, setFetching] = useState(true);

  const apiUrl = movieTmdbId
    ? `/api/movies/${movieTmdbId}/reviews?filter=following`
    : `/api/shows/${showTmdbId}/reviews?filter=following`;

  useEffect(() => {
    if (loading) return;
    if (!user) { setFetching(false); return; }

    user.getIdToken().then((token) =>
      fetch(apiUrl, { headers: { Authorization: `Bearer ${token}` } })
    )
      .then((r) => r.ok ? r.json() : { reviews: [] })
      .then((data) => setReviews(data.reviews ?? []))
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [user, loading, apiUrl]);

  if (loading || fetching) {
    return <p className="text-[var(--foreground-muted)] text-center py-16">Loading...</p>;
  }

  if (!user) {
    return (
      <div className="text-center py-16 text-[var(--foreground-muted)]">
        <p className="mb-2"><SignInLink className="text-[var(--ratist-red)] hover:underline">Sign in</SignInLink> to see reviews from people you follow.</p>
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <div className="text-center py-16 text-[var(--foreground-muted)]">
        <p>No reviews from people you follow yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {reviews.map((r) => (
        <div key={r.id}>
          {showTmdbId && r.ratingScope && (
            <div className="mb-1">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                r.ratingScope === "series"
                  ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                  : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
              }`}>
                {r.ratingScope === "series" ? "Series" : `Season ${r.seasonNumber}`}
              </span>
            </div>
          )}
          <ReviewCard
            review={{ ...r, likedByMe: false }}
            movieTmdbId={movieTmdbId}
            showTmdbId={showTmdbId}
          />
        </div>
      ))}
    </div>
  );
}
