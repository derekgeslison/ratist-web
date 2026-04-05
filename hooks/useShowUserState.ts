"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";

export function useShowUserState(showId: number) {
  const { user } = useAuth();
  const [seen, setSeen] = useState(false);
  const [watchlisted, setWatchlisted] = useState(false);
  const [ratistRating, setRatistRating] = useState<number | null>(null);

  useEffect(() => {
    if (!user || !showId) {
      setSeen(false); setWatchlisted(false); setRatistRating(null);
      return;
    }
    let cancelled = false;
    user.getIdToken().then((token) =>
      fetch(`/api/shows/${showId}/seen`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).then((r) => r.json())
    .then((data) => {
      if (cancelled) return;
      setSeen(!!data.seen);
      setWatchlisted(!!data.watchlisted);
      setRatistRating(data.rating?.ratistRating ?? data.rating?.overallRating ?? null);
    })
    .catch(() => {});
    return () => { cancelled = true; };
  }, [user, showId]);

  const markSeen = useCallback(() => setSeen(true), []);
  const setWatchlistState = useCallback((val: boolean) => setWatchlisted(val), []);

  return { seen, watchlisted, ratistRating, markSeen, setWatchlistState };
}
