"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { ArrowLeft, Sparkles, RefreshCcw, AlertCircle } from "lucide-react";

export default function NewCompanionPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [tmdbId, setTmdbId] = useState("");
  const [mediaType, setMediaType] = useState<"movie" | "tv">("movie");
  const [season, setSeason] = useState("1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");

  async function generate() {
    if (!user) return;
    const id = parseInt(tmdbId, 10);
    if (!Number.isFinite(id) || id < 1) {
      setError("Enter a valid TMDB numeric ID.");
      return;
    }
    const seasonNum = parseInt(season, 10);
    if (mediaType === "tv" && (!Number.isFinite(seasonNum) || seasonNum < 1)) {
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
          tmdbId: id,
          mediaType,
          ...(mediaType === "tv" ? { season: seasonNum } : {}),
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
          Paste a TMDB ID. For a show, also pick which season to generate — seasons accumulate into the same companion.
          Generation takes 30–60s (Wikipedia + TMDB grounding + Claude call + DB writes).
        </p>

        <div>
          <label className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider mb-1 block">Media type</label>
          <div className="flex gap-2">
            {(["movie", "tv"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setMediaType(t)}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  mediaType === t
                    ? "border-[var(--ratist-red)] bg-[var(--ratist-red)]/10 text-white"
                    : "border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"
                }`}
              >
                {t === "movie" ? "Movie" : "TV Show"}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider mb-1 block">TMDB ID</label>
          <input
            value={tmdbId}
            onChange={(e) => setTmdbId(e.target.value)}
            placeholder={mediaType === "movie" ? "e.g. 157336 (Interstellar)" : "e.g. 1535 (Succession)"}
            inputMode="numeric"
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
          />
          <p className="text-[10px] text-[var(--foreground-muted)] mt-1">
            Find this on themoviedb.org — it&apos;s the number in the URL.
          </p>
        </div>

        {mediaType === "tv" && (
          <div>
            <label className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider mb-1 block">Season</label>
            <input
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              inputMode="numeric"
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
            />
            <p className="text-[10px] text-[var(--foreground-muted)] mt-1">
              Generates one season at a time. To add more later, come back and generate the next season — earlier content stays intact.
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
          disabled={loading || !tmdbId.trim()}
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
