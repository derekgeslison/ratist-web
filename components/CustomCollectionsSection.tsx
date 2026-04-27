"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Wand2, Save, Sparkles, Trash2, X, ListPlus, Check } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { posterUrl } from "@/lib/tmdb";
import MovieCard from "./MovieCard";
import ShowCard from "./ShowCard";
import TextareaWithEmoji from "./TextareaWithEmoji";

interface PreviewItem {
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  posterPath: string | null;
  releaseDate: string | null;
  voteAverage: number | null;
}

interface SavedCollection {
  id: string;
  name: string;
  description: string | null;
  prompt: string;
  mediaType: string;
  itemCount: number;
  previewPosters: (string | null)[];
  createdAt: string;
}

interface PreviewState {
  items: PreviewItem[];
  suggestedName: string;
  promptUsed: string;
}

const PREVIEW_STORAGE_KEY = "ratist-custom-collection-preview";

export default function CustomCollectionsSection() {
  const { user } = useAuth();

  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [saveName, setSaveName] = useState("");
  const [saveDescription, setSaveDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedList, setSavedList] = useState<SavedCollection[]>([]);

  // Restore any unsaved preview from sessionStorage so clicking into a result
  // and hitting Back doesn't lose the list the user was about to save.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem(PREVIEW_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { preview: PreviewState; saveName: string; saveDescription: string };
      if (parsed?.preview?.items?.length) {
        setPreview(parsed.preview);
        setSaveName(parsed.saveName ?? parsed.preview.suggestedName);
        setSaveDescription(parsed.saveDescription ?? "");
        setPrompt(parsed.preview.promptUsed);
      }
    } catch { /* ignore */ }
  }, []);

  // Persist preview state (including save form edits) whenever it changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (preview) {
      sessionStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify({ preview, saveName, saveDescription }));
    } else {
      sessionStorage.removeItem(PREVIEW_STORAGE_KEY);
    }
  }, [preview, saveName, saveDescription]);

  const loadSaved = useCallback(async () => {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch("/api/custom-collections", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      setSavedList(data.collections ?? []);
    }
  }, [user]);

  useEffect(() => { loadSaved(); }, [loadSaved]);

  async function handleGenerate() {
    if (!user || generating || prompt.trim().length < 5) return;
    setGenerating(true);
    setGenerateError("");
    setPreview(null);
    setSaveError("");
    const token = await user.getIdToken();
    const res = await fetch("/api/tools/collections/ai", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: prompt.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setGenerateError(data.error ?? `Failed (${res.status})`);
      setGenerating(false);
      return;
    }
    if (!data.items || data.items.length === 0) {
      setGenerateError("No titles matched your prompt. Try broader wording, drop a filter (\"not too graphic\", a decade, a rating floor), or remove the seen/unseen preference.");
      setGenerating(false);
      return;
    }
    const requestedLimit = (data.filters?.limit as number) ?? 10;
    if (data.items.length < Math.min(5, requestedLimit)) {
      // Low-result warning — we still show the preview, just note the gap
      setGenerateError(`Only ${data.items.length} title${data.items.length === 1 ? "" : "s"} matched. You can save this or try a broader prompt — e.g. loosen a content filter, widen the era, or drop the rating floor.`);
    }
    setPreview({
      items: data.items,
      suggestedName: data.filters?.suggestedName ?? "Custom Collection",
      promptUsed: prompt.trim(),
    });
    setSaveName(data.filters?.suggestedName ?? "Custom Collection");
    setGenerating(false);
  }

  async function handleSave() {
    if (!user || saving || !preview) return;
    const name = saveName.trim();
    if (!name) { setSaveError("Name is required"); return; }
    setSaving(true);
    setSaveError("");
    const token = await user.getIdToken();
    const res = await fetch("/api/custom-collections", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description: saveDescription.trim() || null,
        prompt: preview.promptUsed,
        // If every item is TV, mark the collection TV; else default movie.
        mediaType: preview.items.length > 0 && preview.items.every((i) => i.mediaType === "tv") ? "tv" : "movie",
        items: preview.items,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setSaveError(data.error ?? "Failed to save");
      setSaving(false);
      return;
    }
    setPreview(null);
    setPrompt("");
    setSaveName("");
    setSaveDescription("");
    setSaving(false);
    loadSaved();
  }

  async function handleDelete(id: string) {
    if (!user) return;
    if (!confirm("Delete this collection?")) return;
    const token = await user.getIdToken();
    const res = await fetch(`/api/custom-collections/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) loadSaved();
  }

  const [creatingWlId, setCreatingWlId] = useState<string | null>(null);
  const [wlMessage, setWlMessage] = useState<{ text: string; href?: string; type: "success" | "error" } | null>(null);

  async function createWatchlist(collectionId: string, collectionName: string) {
    if (!user || creatingWlId) return;
    const name = window.prompt("Name for the watchlist:", collectionName);
    if (!name?.trim()) return;
    setCreatingWlId(collectionId);
    setWlMessage(null);
    try {
      const token = await user.getIdToken();
      // Fetch full items for the collection (list only returns preview posters)
      const detailRes = await fetch(`/api/custom-collections/${collectionId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!detailRes.ok) { setWlMessage({ text: "Failed to load collection.", type: "error" }); return; }
      const detailData = await detailRes.json();
      const items: Array<{ tmdbId: number; title: string; posterPath: string | null; releaseDate: string | null; mediaType: string }> = detailData.collection?.items ?? [];

      const createRes = await fetch("/api/watchlist", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!createRes.ok) { setWlMessage({ text: "Failed to create watchlist.", type: "error" }); return; }
      const created = await createRes.json();
      const wlId: string | undefined = created.watchlist?.id ?? created.id;
      if (!wlId) { setWlMessage({ text: "Failed to create watchlist.", type: "error" }); return; }

      const results = await Promise.allSettled(
        items.map((item) =>
          fetch(`/api/watchlist/${wlId}/movies`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              tmdbId: item.tmdbId, title: item.title, posterPath: item.posterPath, releaseDate: item.releaseDate, mediaType: item.mediaType,
            }),
          })
        )
      );
      const failed = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok)).length;
      const added = items.length - failed;
      setWlMessage({ text: `Watchlist "${name}" created with ${added}/${items.length} title${items.length === 1 ? "" : "s"}.`, href: `/watchlist?list=${wlId}`, type: "success" });
    } catch {
      setWlMessage({ text: "Failed to create watchlist.", type: "error" });
    } finally {
      setCreatingWlId(null);
    }
  }

  return (
    <div className="space-y-6 mb-8">
      {/* AI Generator */}
      <section className="bg-gradient-to-br from-[var(--ratist-red)]/10 to-transparent border border-[var(--ratist-red)]/30 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-2">
          <Wand2 className="w-4 h-4 text-[var(--ratist-red)]" />
          <h2 className="text-base font-semibold text-white">Create a custom collection with AI</h2>
        </div>
        <p className="text-xs text-[var(--foreground-muted)] mb-3">
          Describe the vibe, genre, era, or mood you&apos;re after and we&apos;ll build a collection you can save and revisit.
        </p>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={`e.g. "Classic gangster movies rated above 8 that I haven't seen"`}
          rows={2}
          maxLength={500}
          className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] resize-y mb-2"
        />
        {generateError && <p className="text-xs text-red-400 mb-2">{generateError}</p>}
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] text-[var(--foreground-muted)]">
            Backstage Pass: 20/day
          </p>
          <button
            onClick={handleGenerate}
            disabled={generating || prompt.trim().length < 5}
            className="flex items-center gap-1.5 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold px-4 py-1.5 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Wand2 className="w-3.5 h-3.5" />
            {generating ? "Generating..." : "Generate"}
          </button>
        </div>

        {preview && (
          <div className="mt-4 pt-4 border-t border-[var(--border)] space-y-3">
            <p className="text-xs text-[var(--foreground-muted)]">
              Preview — {preview.items.length} title{preview.items.length !== 1 ? "s" : ""}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {preview.items.map((item) => (
                item.mediaType === "tv" ? (
                  <ShowCard
                    key={`tv-${item.tmdbId}`}
                    show={{
                      id: item.tmdbId,
                      name: item.title,
                      overview: "",
                      poster_path: item.posterPath,
                      backdrop_path: null,
                      first_air_date: item.releaseDate ?? "",
                      popularity: 0,
                      vote_average: item.voteAverage ?? 0,
                      vote_count: 0,
                    }}
                  />
                ) : (
                  <MovieCard
                    key={`movie-${item.tmdbId}`}
                    movie={{
                      id: item.tmdbId,
                      title: item.title,
                      overview: "",
                      poster_path: item.posterPath,
                      backdrop_path: null,
                      release_date: item.releaseDate ?? "",
                      popularity: 0,
                      vote_average: item.voteAverage ?? 0,
                      vote_count: 0,
                    }}
                  />
                )
              ))}
            </div>
            <div className="bg-[var(--surface)] rounded-lg p-3 space-y-2">
              <input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="Collection name"
                maxLength={80}
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
              />
              <TextareaWithEmoji
                value={saveDescription}
                onChange={(e) => setSaveDescription(e.target.value)}
                placeholder="Description (optional)"
                rows={1}
                maxLength={500}
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] resize-y"
              />
              {saveError && <p className="text-xs text-red-400">{saveError}</p>}
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => { setPreview(null); setSaveError(""); }}
                  className="flex items-center gap-1 text-xs text-[var(--foreground-muted)] hover:text-white px-3 py-1.5"
                >
                  <X className="w-3 h-3" /> Discard
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !saveName.trim()}
                  className="flex items-center gap-1.5 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-xs font-semibold px-3 py-1.5 rounded-full transition-colors disabled:opacity-40"
                >
                  <Save className="w-3 h-3" />
                  {saving ? "Saving..." : "Save collection"}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Saved custom collections */}
      {savedList.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-[var(--ratist-red)]" />
            <h2 className="text-base font-semibold text-white">Your Custom Collections</h2>
          </div>
          {wlMessage && (
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 mb-3 text-xs ${
              wlMessage.type === "success" ? "bg-green-500/10 border border-green-500/30 text-green-300" : "bg-red-500/10 border border-red-500/30 text-red-300"
            }`}>
              {wlMessage.type === "success" && <Check className="w-3.5 h-3.5 shrink-0" />}
              <span className="flex-1">{wlMessage.text}</span>
              {wlMessage.href && <Link href={wlMessage.href} className="text-white underline hover:no-underline">View</Link>}
              <button onClick={() => setWlMessage(null)} className="text-[var(--foreground-muted)] hover:text-white"><X className="w-3 h-3" /></button>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {savedList.map((c) => (
              <div
                key={c.id}
                className="bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--ratist-red)]/50 rounded-xl p-3 transition-colors group"
              >
                <Link href={`/tools/collections/custom/${c.id}`} className="block">
                  <div className="flex gap-1 mb-3">
                    {c.previewPosters.slice(0, 4).map((p, i) => (
                      <div key={i} className="relative w-1/4 aspect-[2/3] rounded overflow-hidden bg-[var(--surface-2)]">
                        {p ? (
                          <Image src={posterUrl(p, "w92")} alt="" fill sizes="60px" className="object-cover" />
                        ) : (
                          <Image src="/placeholder-poster.svg" alt="" fill sizes="60px" className="object-cover" />
                        )}
                      </div>
                    ))}
                    {Array.from({ length: Math.max(0, 4 - c.previewPosters.length) }).map((_, i) => (
                      <div key={`empty-${i}`} className="w-1/4 aspect-[2/3] rounded bg-[var(--surface-2)]" />
                    ))}
                  </div>
                  <h3 className="text-sm font-semibold text-white group-hover:text-[var(--ratist-red)] transition-colors line-clamp-1">{c.name}</h3>
                  <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
                    {c.itemCount} title{c.itemCount !== 1 ? "s" : ""}
                  </p>
                </Link>
                <div className="mt-2 flex items-center gap-3">
                  <button
                    onClick={() => createWatchlist(c.id, c.name)}
                    disabled={creatingWlId === c.id}
                    className="flex items-center gap-1 text-[10px] text-[var(--foreground-muted)] hover:text-white transition-colors disabled:opacity-50"
                  >
                    <ListPlus className="w-3 h-3" /> {creatingWlId === c.id ? "Creating…" : "Create watchlist"}
                  </button>
                  <button
                    onClick={() => handleDelete(c.id)}
                    className="flex items-center gap-1 text-[10px] text-[var(--foreground-muted)] hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
