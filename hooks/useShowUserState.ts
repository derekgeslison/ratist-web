"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";

export function useShowUserState(showId: number) {
  const { user } = useAuth();
  const [seen, setSeen] = useState(false);
  const [watchlisted, setWatchlisted] = useState(false);

  useEffect(() => {
    if (!user || !showId) {
      setSeen(false); setWatchlisted(false);
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
    })
    .catch(() => {});
    return () => { cancelled = true; };
  }, [user, showId]);

  const markSeen = useCallback(() => setSeen(true), []);
  const setWatchlistState = useCallback((val: boolean) => setWatchlisted(val), []);

  return { seen, watchlisted, markSeen, setWatchlistState };
}
