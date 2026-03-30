"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";

export function useMovieUserState(movieId: number) {
  const { user } = useAuth();
  const [seen, setSeen] = useState(false);
  const [watchlisted, setWatchlisted] = useState(false);
  const [ratistRating, setRatistRating] = useState<number | null>(null);
  const [estimatedRating, setEstimatedRating] = useState<number | null>(null);

  // Load state from DB on mount / user change
  useEffect(() => {
    if (!user) {
      setSeen(false); setWatchlisted(false);
      setRatistRating(null); setEstimatedRating(null);
      return;
    }
    let cancelled = false;
    user.getIdToken().then((token) =>
      fetch(`/api/movies/${movieId}/seen`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).then((r) => r.json())
    .then((data) => {
      if (cancelled) return;
      setSeen(!!data.seen);
      setWatchlisted(!!data.watchlisted);
      setRatistRating(data.rating?.ratistRating ?? null);
      setEstimatedRating(data.estimatedRating ?? null);
    })
    .catch(() => {});
    return () => { cancelled = true; };
  }, [user, movieId]);

  // These are called AFTER callers already hit the API — just update local state
  const markSeen = useCallback(() => setSeen(true), []);
  const setWatchlistState = useCallback((val: boolean) => setWatchlisted(val), []);

  return { seen, watchlisted, ratistRating, estimatedRating, markSeen, setWatchlistState };
}
