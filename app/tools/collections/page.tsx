"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Sparkles, ListPlus, ChevronDown, ChevronUp, AlertCircle, Users, User as UserIcon, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import MovieCard from "@/components/MovieCard";
import CustomCollectionsSection from "@/components/CustomCollectionsSection";
import CommunityCollectionsFeed from "@/components/CommunityCollectionsFeed";

interface CollectionMovie {
  id: string;
  tmdbId: number;
  title: string;
  posterPath: string | null;
  releaseDate: string | null;
  voteAverage: number | null;
  communityRating: number | null;
}

interface Collection {
  key: string;
  title: string;
  description: string;
  emoji: string;
  movies: CollectionMovie[];
}

type TopTab = "my" | "community";

// useSearchParams in client routes needs a Suspense wrapper to keep
// prerender happy on Next.js 16. Page is the boundary; the inner
// component owns the URL state.
export default function CollectionsPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-[var(--foreground-muted)]"><Loader2 className="w-6 h-6 animate-spin inline" /></div>}>
      <CollectionsPageInner />
    </Suspense>
  );
}

function CollectionsPageInner() {
  const { user, loading: authLoading } = useAuth();
  const { hasPass, loading: subLoading } = useSubscription();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: TopTab = tabParam === "community" ? "community" : "my";

  function setTab(next: TopTab) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "my") {
      params.delete("tab");
      // Clear community-specific params when leaving the community tab.
      params.delete("subtab");
      params.delete("tag");
      params.delete("search");
    } else {
      params.set("tab", "community");
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  const [collections, setCollections] = useState<Collection[]>([]);
  const [ratistReviewCount, setRatistReviewCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [creatingWatchlist, setCreatingWatchlist] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const getToken = useCallback(async () => (user ? user.getIdToken() : null), [user]);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    if (activeTab !== "my") { setLoading(false); return; }
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch("/api/tools/collections", { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) { setError("Failed to load collections."); setLoading(false); return; }
        const data = await res.json();
        setCollections(data.collections ?? []);
        if (data.ratistReviewCount != null) setRatistReviewCount(data.ratistReviewCount);
      } catch {
        setError("Failed to load collections.");
      } finally {
        setLoading(false);
      }
    })();
  }, [user, getToken, activeTab]);

  function toggleExpand(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function showSuccess(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  }

  async function createWatchlistFromCollection(collection: Collection) {
    const name = window.prompt("Name for the watchlist:", collection.title);
    if (!name?.trim()) return;
    setCreatingWatchlist(collection.key);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) { setError("Failed to create watchlist."); return; }
      const data = await res.json();
      const wlId = data.watchlist?.id ?? data.id;
      if (!wlId) { setError("Failed to create watchlist."); return; }

      const results = await Promise.allSettled(
        collection.movies.map((movie) =>
          fetch(`/api/watchlist/${wlId}/movies`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ tmdbId: movie.tmdbId, title: movie.title, posterPath: movie.posterPath, releaseDate: movie.releaseDate }),
          })
        )
      );
      const failed = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok)).length;
      if (failed > 0) {
        showSuccess(`Watchlist "${name}" created — ${collection.movies.length - failed}/${collection.movies.length} movies added.`);
      } else {
        showSuccess(`Watchlist "${name}" created with ${collection.movies.length} movies!`);
      }
    } catch {
      setError("Failed to create watchlist.");
    } finally {
      setCreatingWatchlist(null);
    }
  }

  useEffect(() => {
    if (!subLoading && !hasPass) router.replace("/backstage-pass/collections");
  }, [subLoading, hasPass, router]);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/backstage-pass/collections");
  }, [authLoading, user, router]);

  if (authLoading || subLoading || !hasPass || !user) {
    return <div className="py-20 text-center text-[var(--foreground-muted)]"><Loader2 className="w-6 h-6 animate-spin inline" /></div>;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-2">
        <Sparkles className="w-6 h-6 text-[var(--ratist-red)]" />
        <h1 className="text-2xl font-bold text-white">Collections</h1>
      </div>
      <p className="text-[var(--foreground-muted)] mb-4">
        {activeTab === "my"
          ? "Personalized movie recommendations based on your taste, ratings, and watch history."
          : "Browse collections curated by the community. Save the ones you like."}
      </p>

      {/* Top toggle */}
      <div className="inline-flex items-center bg-[var(--surface)] border border-[var(--border)] rounded-full p-1 mb-6">
        <button
          onClick={() => setTab("my")}
          className={`flex items-center gap-1.5 text-sm font-medium px-4 py-1.5 rounded-full transition-colors ${
            activeTab === "my" ? "bg-[var(--ratist-red)] text-white" : "text-[var(--foreground-muted)] hover:text-white"
          }`}
        >
          <UserIcon className="w-3.5 h-3.5" />
          My Collections
        </button>
        <button
          onClick={() => setTab("community")}
          className={`flex items-center gap-1.5 text-sm font-medium px-4 py-1.5 rounded-full transition-colors ${
            activeTab === "community" ? "bg-[var(--ratist-red)] text-white" : "text-[var(--foreground-muted)] hover:text-white"
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          Community
        </button>
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-200 text-sm rounded-lg px-4 py-2.5 mb-4 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-white ml-3">✕</button>
        </div>
      )}
      {successMsg && (
        <div className="bg-green-900/40 border border-green-700 text-green-200 text-sm rounded-lg px-4 py-2.5 mb-4">
          {successMsg}
        </div>
      )}

      {activeTab === "community" ? (
        <CommunityCollectionsFeed />
      ) : (
        <>
          <CustomCollectionsSection />

          {ratistReviewCount != null && ratistReviewCount < 10 && (
            <div className="bg-[var(--ratist-red)]/10 border border-[var(--ratist-red)]/20 rounded-xl px-4 py-3 mb-6 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-[var(--ratist-red)] shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-white font-medium">Your collections will improve with more reviews</p>
                <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
                  You have {ratistReviewCount}{" "}of 10 Ratist reviews needed for personalized collections.
                  Quick reviews don&apos;t count — fill out the full rating form for better results.
                </p>
              </div>
            </div>
          )}

          {loading ? (
            <p className="text-[var(--foreground-muted)] text-center py-10">Generating your collections...</p>
          ) : collections.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-[var(--foreground-muted)] mb-2">Not enough data to generate collections yet.</p>
              <p className="text-sm text-[var(--foreground-muted)]">Rate more movies to unlock personalized recommendations.</p>
              <Link href="/movies" className="text-sm text-[var(--ratist-red)] hover:underline mt-4 inline-block">Browse movies →</Link>
            </div>
          ) : (
            <div className="space-y-6">
              {collections.map((collection) => {
                const isExpanded = expanded.has(collection.key);
                const displayMovies = isExpanded ? collection.movies : collection.movies.slice(0, 6);
                return (
                  <section key={collection.key} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
                    <div className="px-5 py-4 space-y-2">
                      <div className="flex items-start gap-3">
                        <span className="text-2xl flex-shrink-0">{collection.emoji}</span>
                        <div className="min-w-0 flex-1">
                          <h2 className="text-base font-semibold text-white">{collection.title}</h2>
                          <p className="text-xs text-[var(--foreground-muted)] mt-0.5">{collection.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => createWatchlistFromCollection(collection)}
                          disabled={creatingWatchlist === collection.key}
                          className="flex items-center gap-1 text-[10px] text-[var(--foreground-muted)] hover:text-white bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 transition-colors"
                          title="Create watchlist from this collection"
                        >
                          <ListPlus className="w-3 h-3" />
                          {creatingWatchlist === collection.key ? "Creating..." : "Save as Watchlist"}
                        </button>
                        <span className="text-xs text-[var(--foreground-muted)]">{collection.movies.length} films</span>
                      </div>
                    </div>

                    <div className="px-5 pb-4">
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                        {displayMovies.map((movie) => (
                          <MovieCard
                            key={movie.id}
                            movie={{
                              id: movie.tmdbId,
                              title: movie.title,
                              poster_path: movie.posterPath,
                              vote_average: movie.voteAverage ?? 0,
                              release_date: movie.releaseDate ?? "",
                              backdrop_path: null,
                              overview: "",
                              genre_ids: [],
                            } as never}
                          />
                        ))}
                      </div>

                      {collection.movies.length > 6 && (
                        <button onClick={() => toggleExpand(collection.key)}
                          className="flex items-center gap-1 text-xs text-[var(--ratist-red)] hover:underline mt-3 mx-auto">
                          {isExpanded ? <><ChevronUp className="w-3 h-3" /> Show less</> : <><ChevronDown className="w-3 h-3" /> Show all {collection.movies.length}</>}
                        </button>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}

    </div>
  );
}
