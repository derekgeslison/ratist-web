"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import CommunityBreakdown from "./CommunityBreakdown";

interface CategoryAvg {
  ratistRating: number | null;
  storyScore: number | null;
  styleScore: number | null;
  emotiveScore: number | null;
  actingScore: number | null;
  entertainScore: number | null;
  count: number;
  fields?: Record<string, number | null>;
}

interface Props {
  tmdbId: number;
  initialAvg: CategoryAvg;
  heading: string;
  /** "series" | { season: N } — drives which estimate endpoint to hit. */
  scope: "series" | { season: number };
}

/**
 * Wrapper that fetches the viewer-specific score estimate alongside the
 * already-server-rendered community breakdown. Lives as a client component
 * because the /reviews page is server-rendered and can't run auth-bearing
 * fetches itself, but we still want the personalized estimate shown.
 */
export default function ShowBreakdownWithEstimate({ tmdbId, initialAvg, heading, scope }: Props) {
  const { user } = useAuth();
  const [estimate, setEstimate] = useState<number | null>(null);
  const [userRating, setUserRating] = useState<number | null>(null);

  useEffect(() => {
    if (!user) { setEstimate(null); setUserRating(null); return; }
    let cancelled = false;
    user.getIdToken().then(async (token) => {
      const opts = { headers: { Authorization: `Bearer ${token}` } };
      if (scope === "series") {
        // /seen returns both: user's series rating (in `rating`) AND
        // estimatedRating (only when user hasn't rated yet).
        const r = await fetch(`/api/shows/${tmdbId}/seen`, opts);
        if (!r.ok) return;
        const data = await r.json();
        if (cancelled) return;
        setEstimate(data?.estimatedRating ?? null);
        setUserRating(data?.rating?.ratistRating ?? null);
      } else {
        // Season scope: two parallel fetches — season-estimates for the
        // predicted score, /rate for the viewer's season ratings list.
        const [estRes, ratingsRes] = await Promise.all([
          fetch(`/api/shows/${tmdbId}/season-estimates`, opts),
          fetch(`/api/shows/${tmdbId}/rate`, opts),
        ]);
        if (cancelled) return;
        if (estRes.ok) {
          const data = await estRes.json();
          const v = data?.estimates?.[scope.season];
          setEstimate(typeof v === "number" ? v : null);
        }
        if (ratingsRes.ok) {
          const data = await ratingsRes.json() as {
            seasonRatings?: Array<{ seasonNumber: number; ratistRating: number | null; overallRating: number | null }>;
          };
          const row = data.seasonRatings?.find((r) => r.seasonNumber === scope.season);
          const score = row?.ratistRating ?? row?.overallRating ?? null;
          if (!cancelled) setUserRating(typeof score === "number" ? score : null);
        }
      }
    }).catch(() => null);
    return () => { cancelled = true; };
  }, [user, tmdbId, scope]);

  return (
    <CommunityBreakdown
      tmdbId={tmdbId}
      mediaType="tv"
      initialAvg={initialAvg}
      heading={heading}
      showOverall
      estimateForYou={estimate}
      userRating={userRating}
    />
  );
}
