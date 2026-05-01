"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import CollectionBuilder, { BuilderInitialState } from "@/components/CollectionBuilder";
import BackButton from "@/components/BackButton";

export default function EditCollectionPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const { hasPass, loading: subLoading } = useSubscription();
  const router = useRouter();

  const [initialState, setInitialState] = useState<BuilderInitialState | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Pull the existing collection so the builder loads pre-populated.
  const load = useCallback(async () => {
    if (!user || !id) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/custom-collections/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { setError("Couldn't load collection."); return; }
      const data = await res.json();
      const c = data.collection;
      if (!c) { setError("Collection not found."); return; }
      setInitialState({
        title: c.name ?? "",
        description: c.description ?? "",
        themePromptId: c.themePromptId ?? null,
        isOfficial: !!c.isOfficial,
        alreadyPublic: c.visibility === "public",
        tags: c.tags ?? [],
        items: (c.items ?? []).map((i: {
          tmdbId: number; mediaType: string; title: string;
          posterPath: string | null; releaseDate: string | null;
          voteAverage: number | null; blurb: string | null;
        }) => ({
          tmdbId: i.tmdbId,
          mediaType: i.mediaType === "tv" ? "tv" : "movie",
          title: i.title,
          posterPath: i.posterPath,
          releaseDate: i.releaseDate,
          voteAverage: i.voteAverage,
          blurb: i.blurb ?? "",
        })),
      });
    } catch {
      setError("Couldn't load collection.");
    }
  }, [user, id]);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/backstage-pass/collections");
  }, [authLoading, user, router]);
  useEffect(() => {
    if (!subLoading && user && !hasPass) router.replace("/backstage-pass/collections");
  }, [subLoading, hasPass, user, router]);

  useEffect(() => { load(); }, [load]);

  function handleSaved(_collectionId: string, slug: string | null) {
    void _collectionId;
    if (slug && user) router.push(`/collections/${user.uid}/${slug}`);
    else router.push(`/tools/collections/custom/${id}`);
  }

  async function handleDelete() {
    if (!user || !id) return;
    const token = await user.getIdToken();
    const res = await fetch(`/api/custom-collections/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) router.push(initialState?.isOfficial ? "/admin/collections" : "/tools/collections");
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <p className="text-red-400 mb-3">{error}</p>
        <Link href="/tools/collections" className="text-sm text-[var(--ratist-red)] hover:underline">Back to collections</Link>
      </div>
    );
  }

  if (authLoading || subLoading || !user || !hasPass || !initialState) {
    return <div className="py-20 text-center text-[var(--foreground-muted)]"><Loader2 className="w-6 h-6 animate-spin inline" /></div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <BackButton
        fallback={`/tools/collections/custom/${id}`}
        label="Back to collection"
        className="inline-flex items-center gap-1 text-xs text-[var(--foreground-muted)] hover:text-white mb-4"
      />

      <h1 className="text-2xl font-bold text-white mb-1">Edit collection</h1>
      <p className="text-sm text-[var(--foreground-muted)] mb-6">
        Changes save to your private copy. Use the publish toggle to push updates to the community version.
      </p>

      <CollectionBuilder
        mode="edit"
        collectionId={id}
        initialState={initialState}
        onSaved={handleSaved}
        onDelete={handleDelete}
      />
    </div>
  );
}
