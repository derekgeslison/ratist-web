"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import CollectionBuilder, { BuilderItem, BuilderInitialState } from "@/components/CollectionBuilder";
import BackButton from "@/components/BackButton";

const MAX_ITEMS = 50;

export default function NewCollectionPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-[var(--foreground-muted)]"><Loader2 className="w-6 h-6 animate-spin inline" /></div>}>
      <NewCollectionPageInner />
    </Suspense>
  );
}

function NewCollectionPageInner() {
  const { user, loading: authLoading } = useAuth();
  const { hasPass, loading: subLoading } = useSubscription();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [initialState, setInitialState] = useState<BuilderInitialState | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);

  // Auth + sub gates redirect to the paywall page.
  useEffect(() => {
    if (!authLoading && !user) router.replace("/backstage-pass/collections");
  }, [authLoading, user, router]);
  useEffect(() => {
    if (!subLoading && user && !hasPass) router.replace("/backstage-pass/collections");
  }, [subLoading, hasPass, user, router]);

  // Pre-fill from a watchlist if the URL was opened via the watchlist
  // promote button. The watchlist API returns a unified `movies` array
  // with both movies and TV entries tagged via `mediaType`. The
  // `official=true` flag flips the admin Ratist-curation defaults on so
  // the admin doesn't have to manually check both publish toggles.
  useEffect(() => {
    if (!user) return;
    const from = searchParams.get("from");
    const wlId = searchParams.get("id");
    const themePromptIdParam = searchParams.get("themePromptId") ?? null;
    const officialMode = searchParams.get("official") === "true";

    const officialDefaults = officialMode
      ? { isOfficial: true, preferPublish: true, lockOfficial: true }
      : {};

    if (from === "watchlist" && wlId) {
      (async () => {
        try {
          const token = await user.getIdToken();
          const res = await fetch(`/api/watchlist/${wlId}`, { headers: { Authorization: `Bearer ${token}` } });
          if (!res.ok) { setInitialState({ themePromptId: themePromptIdParam, ...officialDefaults }); return; }
          const data = await res.json();
          const entries: Array<{
            tmdbId: number; mediaType?: "movie" | "tv"; title: string;
            posterPath: string | null; year?: string; voteAverage: number | null;
          }> = data.movies ?? [];
          const wlName: string | undefined = data.watchlist?.name;

          const promoted: BuilderItem[] = entries.slice(0, MAX_ITEMS).map((e) => ({
            tmdbId: e.tmdbId,
            mediaType: e.mediaType === "tv" ? "tv" : "movie",
            title: e.title,
            posterPath: e.posterPath ?? null,
            releaseDate: e.year ?? null,
            voteAverage: e.voteAverage ?? null,
            blurb: "",
          }));

          setInitialState({
            title: wlName ?? "",
            items: promoted,
            themePromptId: themePromptIdParam,
            ...officialDefaults,
          });
        } finally {
          setBootstrapping(false);
        }
      })();
    } else {
      setInitialState({ themePromptId: themePromptIdParam, ...officialDefaults });
      setBootstrapping(false);
    }
  }, [user, searchParams]);

  function handleSaved(collectionId: string, slug: string | null) {
    if (slug && user) {
      router.push(`/collections/${user.uid}/${slug}`);
      return;
    }
    // Official-mode private save shouldn't land back on /tools/collections
    // since that page filters out official collections. Send to the admin
    // surface where the row will appear.
    const officialMode = searchParams.get("official") === "true";
    router.push(officialMode ? "/admin/collections" : `/tools/collections/custom/${collectionId}`);
  }

  if (authLoading || subLoading || !user || !hasPass || bootstrapping || !initialState) {
    return <div className="py-20 text-center text-[var(--foreground-muted)]"><Loader2 className="w-6 h-6 animate-spin inline" /></div>;
  }

  const officialMode = searchParams.get("official") === "true";
  const backHref = officialMode ? "/admin/collections" : "/tools/collections";

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <BackButton
        fallback={backHref}
        label={officialMode ? "Back to Ratist collections" : "Back to collections"}
        className="inline-flex items-center gap-1 text-xs text-[var(--foreground-muted)] hover:text-white mb-4"
      />

      <h1 className="text-2xl font-bold text-white mb-1">
        {officialMode ? "New Ratist collection" : "New collection"}
      </h1>
      <p className="text-sm text-[var(--foreground-muted)] mb-6">
        {officialMode
          ? "Publishes as an official Ratist-attributed collection."
          : "Saves a private collection for yourself. Optionally publish to the community feed."}
      </p>

      <CollectionBuilder
        mode="create"
        initialState={initialState}
        onSaved={handleSaved}
      />
    </div>
  );
}
