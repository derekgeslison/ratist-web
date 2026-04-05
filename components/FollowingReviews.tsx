"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import ReviewCard from "./ReviewCard";
import Link from "next/link";

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
  user: { id: string; firebaseUid: string; name: string; avatarUrl: string | null };
}

interface Props {
  movieTmdbId: number;
}

export default function FollowingReviews({ movieTmdbId }: Props) {
  const { user, loading } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) { setFetching(false); return; }

    user.getIdToken().then((token) =>
      fetch(`/api/movies/${movieTmdbId}/reviews?filter=following`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    )
      .then((r) => r.ok ? r.json() : { reviews: [] })
      .then((data) => setReviews(data.reviews ?? []))
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [user, loading, movieTmdbId]);

  if (loading || fetching) {
    return <p className="text-[var(--foreground-muted)] text-center py-16">Loading...</p>;
  }

  if (!user) {
    return (
      <div className="text-center py-16 text-[var(--foreground-muted)]">
        <p className="mb-2"><Link href="/auth/signin" className="text-[var(--ratist-red)] hover:underline">Sign in</Link> to see reviews from people you follow.</p>
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
        <ReviewCard
          key={r.id}
          review={{ ...r, likedByMe: false }}
          movieTmdbId={movieTmdbId}
        />
      ))}
    </div>
  );
}
