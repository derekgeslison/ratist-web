"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

/**
 * Client-side seen-filter overlay. Reads ?seenStatus=seen|unseen from
 * the URL, fetches the user's flat tmdbId list once on mount, then
 * walks every element with data-seen-filter-id="movie-N" or
 * "tv-N" on the page and hides the ones that don't match the filter.
 *
 * Why DOM-walking instead of restructuring the page into a client
 * component: the /movies + /search + /celebrities result lists are
 * server-rendered for SEO + perf, and rebuilding them as client-only
 * components would balloon the page payload. The filter is opt-in
 * (only fires when seenStatus is set) and only on signed-in users,
 * so the cost is bounded.
 *
 * Mount this once near the bottom of any page that should respect the
 * filter. Re-runs whenever the URL or auth state changes.
 */
export default function SeenFilterRunner() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const seenStatus = searchParams.get("seenStatus");

  useEffect(() => {
    // No filter? Make sure no cards are hidden from a prior run.
    if (seenStatus !== "seen" && seenStatus !== "unseen") {
      document.querySelectorAll<HTMLElement>("[data-seen-filter-id]").forEach((el) => {
        el.style.display = "";
      });
      return;
    }
    // Filter requires auth — without it, treat everything as unseen.
    if (!user) {
      const showWhen = seenStatus === "unseen";
      document.querySelectorAll<HTMLElement>("[data-seen-filter-id]").forEach((el) => {
        el.style.display = showWhen ? "" : "none";
      });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/me/seen-tmdb-ids", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { movieTmdbIds?: number[]; showTmdbIds?: number[] };
        const seenMovies = new Set(data.movieTmdbIds ?? []);
        const seenShows = new Set(data.showTmdbIds ?? []);

        document.querySelectorAll<HTMLElement>("[data-seen-filter-id]").forEach((el) => {
          const id = el.getAttribute("data-seen-filter-id") ?? "";
          // ID format: "movie-12345" / "tv-67890"
          const dash = id.indexOf("-");
          if (dash < 0) return;
          const kind = id.slice(0, dash);
          const tmdbId = parseInt(id.slice(dash + 1), 10);
          if (!Number.isFinite(tmdbId)) return;
          const isSeen = kind === "movie" ? seenMovies.has(tmdbId) : kind === "tv" ? seenShows.has(tmdbId) : false;
          const shouldShow = seenStatus === "seen" ? isSeen : !isSeen;
          el.style.display = shouldShow ? "" : "none";
        });
      } catch { /* leave cards visible on failure */ }
    })();
    return () => { cancelled = true; };
  }, [user, seenStatus, searchParams]);

  return null;
}
