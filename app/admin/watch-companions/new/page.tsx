"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { ArrowLeft, Sparkles, RefreshCcw, AlertCircle, Film, Tv } from "lucide-react";
import MediaLinker from "@/components/forum/MediaLinker";

interface MediaItem {
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string | null;
}

export default function NewCompanionPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [selected, setSelected] = useState<MediaItem[]>([]);
  const [season, setSeason] = useState(1);
  const [numberOfSeasons, setNumberOfSeasons] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");

  const picked = selected[0] ?? null;

  // When a TV show is picked, fetch the season count so the dropdown shows
  // real options instead of a free-text number that can be bogus.
  useEffect(() => {
    if (picked?.mediaType !== "tv") {
      setNumberOfSeasons(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/tmdb/tv/${picked.tmdbId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && typeof data.number_of_seasons === "number") {
          setNumberOfSeasons(data.number_of_seasons);
          setSeason(1);
        }
      } catch { /* leave null */ }
    })();
    return () => { cancelled = true; };
  }, [picked]);

  async function generate() {
    if (!user || !picked) return;
    const seasonNum = season;
    if (picked.mediaType === "tv" && (!Number.isFinite(seasonNum) || seasonNum < 1)) {
      setError("Enter a valid season number (1+).");
      return;
    }

    setError("");
    setLoading(true);
    setProgress("Fetching TMDB + Wikipedia grounding and calling Claude…");

    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/watch-companion/generate", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          tmdbId: picked.tmdbId,
          mediaType: picked.mediaType,
          ...(picked.mediaType === "tv" ? { season: seasonNum } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Generation failed (${res.status})`);
        setLoading(false);
        return;
      }
      router.push(`/admin/watch-companions/${data.result.companionId}`);
    } catch {
      setError("Network error — please try again.");
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/watch-companions" className="text-[var(--foreground-muted)] hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h2 className="text-lg font-semibold text-white">Generate Watch Companion</h2>
      </div>

      <div className="max-w-2xl bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 space-y-5">
        <p className="text-sm text-[var(--foreground-muted)] leading-relaxed">
          Search for a movie or show. For shows, pick the season you want to generate — additional seasons can be added later and will accumulate into the same companion.
          Generation takes 30–60s.
        </p>

        <div>
          <label className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider mb-1 block">Movie or show</label>
          <MediaLinker selected={selected} onChange={setSelected} max={1} />
        </div>

        {picked && (
          <div className="flex items-center gap-3 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3">
            {picked.mediaType === "tv" ? <Tv className="w-4 h-4 text-[var(--ratist-red)] shrink-0" /> : <Film className="w-4 h-4 text-[var(--ratist-red)] shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">{picked.title}</p>
              <p className="text-[11px] text-[var(--foreground-muted)]">
                {picked.mediaType === "tv" ? "TV show" : "Movie"} · TMDB {picked.tmdbId}
              </p>
            </div>
          </div>
        )}

        {picked?.mediaType === "tv" && (
          <div>
            <label className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider mb-1 block">Season to generate</label>
            {numberOfSeasons === null ? (
              <p className="text-xs text-[var(--foreground-muted)] italic py-2">Loading season list…</p>
            ) : (
              <select
                value={season}
                onChange={(e) => setSeason(parseInt(e.target.value, 10))}
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)]"
              >
                {Array.from({ length: numberOfSeasons }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>Season {n}</option>
                ))}
              </select>
            )}
            <p className="text-[10px] text-[var(--foreground-muted)] mt-1">
              Generates one season at a time. Come back later to add the next season — earlier content stays intact.
            </p>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 text-sm text-red-400 bg-red-500/5 border border-red-500/20 rounded-lg p-3">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {loading && progress && (
          <p className="text-xs text-[var(--foreground-muted)] italic">{progress}</p>
        )}

        <button
          onClick={generate}
          disabled={loading || !picked}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--ratist-red)] text-white rounded-lg text-sm font-semibold hover:bg-[var(--ratist-red)]/80 transition-colors disabled:opacity-50"
        >
          {loading ? (
            <><RefreshCcw className="w-4 h-4 animate-spin" /> Generating (30–60s)…</>
          ) : (
            <><Sparkles className="w-4 h-4" /> Generate</>
          )}
        </button>
      </div>
    </div>
  );
}
