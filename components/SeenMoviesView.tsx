"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import MovieCard from "./MovieCard";
import ShowCard from "./ShowCard";
import MovieListItem from "./MovieListItem";
import ShowListItem from "./ShowListItem";
import type { TMDBMovie, TMDBShow } from "@/lib/tmdb";

interface SeenMovieRow {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  popularity: number;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  original_language?: string;
  mediaType: "movie";
}

interface SeenShowRow {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  popularity: number;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  mediaType: "tv";
}

type SeenRow = SeenMovieRow | SeenShowRow;

interface ApiResponse {
  results: SeenRow[];
  total: number;
  totalMovies: number;
  totalShows: number;
  page: number;
  totalPages: number;
}

/**
 * Renders the /movies grid for the "Seen" filter path. Replaces the
 * TMDB Discover output entirely — querying that endpoint for "movies
 * the user has seen" makes no sense, so we hit /api/me/seen-with-filters
 * which queries our DB instead. All filter/sort/pagination URL params
 * round-trip through the API.
 */
export default function SeenMoviesView({
  view = "grid",
  pageTitle,
}: {
  view?: "grid" | "list";
  pageTitle?: string;
}) {
  const { user, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const page = Math.max(1, Number(searchParams.get("page") ?? 1));

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const token = await user.getIdToken();
        // Mirror the page's URL params 1:1 — the API ignores filters
        // it can't apply to seen-only data (providers, keywords, etc.)
        const url = `/api/me/seen-with-filters?${searchParams.toString()}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: ApiResponse = await res.json();
        if (cancelled) return;
        setData(json);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, authLoading, searchParams]);

  function gotoPage(p: number) {
    const q = new URLSearchParams(searchParams.toString());
    q.set("page", String(p));
    router.push(`/movies?${q.toString()}`);
  }

  if (authLoading) return null;

  if (!user) {
    return (
      <p className="text-[var(--foreground-muted)] text-center py-20">
        <a href="/auth/signin" className="text-[var(--ratist-red)] hover:underline">Sign in</a>{" "}
        to filter by movies and shows you&apos;ve marked as seen.
      </p>
    );
  }

  if (loading && !data) {
    return (
      <p className="text-[var(--foreground-muted)] text-center py-20">Loading your seen list…</p>
    );
  }

  if (error) {
    return (
      <p className="text-[var(--foreground-muted)] text-center py-20">
        Couldn&apos;t load your seen list. Refresh to try again.
      </p>
    );
  }

  if (!data || data.results.length === 0) {
    return (
      <p className="text-[var(--foreground-muted)] text-center py-20">
        {data && data.total === 0 && (data.totalMovies > 0 || data.totalShows > 0)
          ? "No seen movies match these filters."
          : "You haven't marked any movies or shows as seen yet."}
      </p>
    );
  }

  const totalLine = `${data.total} seen ${data.total === 1 ? "title" : "titles"}`;

  return (
    <div>
      {pageTitle && (
        <div className="text-xs text-[var(--foreground-muted)] mb-3">{totalLine}</div>
      )}
      {view === "list" ? (
        <div className="flex flex-col divide-y divide-[var(--border)]">
          {data.results.map((item) =>
            item.mediaType === "movie" ? (
              <MovieListItem key={`m-${item.id}`} movie={item as unknown as TMDBMovie} />
            ) : (
              <ShowListItem key={`s-${item.id}`} show={item as unknown as TMDBShow} />
            )
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
          {data.results.map((item) =>
            item.mediaType === "movie" ? (
              <MovieCard key={`m-${item.id}`} movie={item as unknown as TMDBMovie} />
            ) : (
              <ShowCard key={`s-${item.id}`} show={item as unknown as TMDBShow} />
            )
          )}
        </div>
      )}

      {data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          <button
            onClick={() => gotoPage(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="flex items-center gap-1 px-3 py-2 text-sm rounded-lg border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white hover:border-[var(--ratist-red)] transition-colors disabled:opacity-40 disabled:hover:text-[var(--foreground-muted)] disabled:hover:border-[var(--border)]"
          >
            <ChevronLeft className="w-4 h-4" /> Prev
          </button>
          <span className="text-sm text-[var(--foreground-muted)] px-2">
            Page {page} of {data.totalPages}
          </span>
          <button
            onClick={() => gotoPage(Math.min(data.totalPages, page + 1))}
            disabled={page >= data.totalPages}
            className="flex items-center gap-1 px-3 py-2 text-sm rounded-lg border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white hover:border-[var(--ratist-red)] transition-colors disabled:opacity-40 disabled:hover:text-[var(--foreground-muted)] disabled:hover:border-[var(--border)]"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
