"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { ArrowLeft, Sparkles, RefreshCcw, AlertCircle, Film, Tv, Check, Loader2, Circle } from "lucide-react";
import MediaLinker from "@/components/forum/MediaLinker";

interface MediaItem {
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string | null;
}

type StepKey = "grounding" | "characters" | "facts" | "relationships" | "timeline" | "glossary" | "recap" | "persist";
type StepState = "pending" | "running" | "done";

const STEPS: Array<{ key: StepKey; label: string }> = [
  { key: "grounding", label: "Fetch grounding (TMDB + Wikipedia)" },
  { key: "characters", label: "Draft characters" },
  { key: "facts", label: "Draft character facts" },
  { key: "relationships", label: "Draft relationships" },
  { key: "timeline", label: "Draft timeline" },
  { key: "glossary", label: "Draft glossary" },
  { key: "recap", label: "Draft recap" },
  { key: "persist", label: "Save to database" },
];

interface ProgressEvent {
  kind: "step" | "complete" | "warning" | "error";
  step?: StepKey;
  status?: "running" | "done";
  count?: number;
  result?: { companionId: string };
  message?: string;
  // Warning-only fields. The server emits these for non-fatal issues like
  // a subtitle-fetch failure; the admin UI surfaces them as a yellow
  // banner so the moderator knows why timestamp accuracy may be degraded.
  source?: "subtitles";
  reason?: string;
}

export default function NewCompanionPage() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<MediaItem[]>([]);
  const [season, setSeason] = useState(1);
  const [numberOfSeasons, setNumberOfSeasons] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [stepStates, setStepStates] = useState<Record<StepKey, StepState>>({
    grounding: "pending",
    characters: "pending",
    facts: "pending",
    relationships: "pending",
    timeline: "pending",
    glossary: "pending",
    recap: "pending",
    persist: "pending",
  });
  const [stepCounts, setStepCounts] = useState<Partial<Record<StepKey, number>>>({});
  // Non-fatal warnings emitted during generation (subtitle quota exhausted,
  // no English subs available for the title, etc.). Shown as a yellow
  // banner so the moderator can correlate degraded timestamp accuracy
  // with a known root cause instead of guessing.
  const [warnings, setWarnings] = useState<Array<{ source: string; reason: string; message: string }>>([]);

  const picked = selected[0] ?? null;

  // Prefill from query params (?tmdbId=…&mediaType=…&season=…). Used when
  // admin clicks "Approve + generate" on a pending request — saves them
  // from retyping the title into MediaLinker.
  useEffect(() => {
    const tmdbIdStr = searchParams.get("tmdbId");
    const mediaTypeStr = searchParams.get("mediaType");
    const seasonStr = searchParams.get("season");
    if (!tmdbIdStr || !mediaTypeStr) return;
    const tmdbId = parseInt(tmdbIdStr, 10);
    if (!Number.isFinite(tmdbId) || (mediaTypeStr !== "movie" && mediaTypeStr !== "tv")) return;
    if (selected.length > 0) return; // don't overwrite a manual pick
    (async () => {
      try {
        const res = await fetch(`/api/tmdb/${mediaTypeStr === "movie" ? "movie" : "tv"}/${tmdbId}`);
        if (!res.ok) return;
        const data = await res.json();
        const title = data.title ?? data.name ?? `TMDB ${tmdbId}`;
        setSelected([{ tmdbId, mediaType: mediaTypeStr, title, posterPath: data.poster_path ?? null }]);
        if (seasonStr) {
          const s = parseInt(seasonStr, 10);
          if (Number.isFinite(s) && s > 0) setSeason(s);
        }
      } catch { /* best-effort prefill */ }
    })();
  }, [searchParams, selected.length]);

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

  function resetSteps() {
    setStepStates({
      grounding: "pending",
      characters: "pending",
      facts: "pending",
      relationships: "pending",
      timeline: "pending",
      glossary: "pending",
      recap: "pending",
      persist: "pending",
    });
    setStepCounts({});
  }

  async function generate() {
    if (!user || !picked) return;
    const seasonNum = season;
    if (picked.mediaType === "tv" && (!Number.isFinite(seasonNum) || seasonNum < 1)) {
      setError("Enter a valid season number (1+).");
      return;
    }

    setError("");
    setWarnings([]);
    setLoading(true);
    resetSteps();

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

      if (!res.ok || !res.body) {
        const errJson = await res.json().catch(() => ({}));
        setError(errJson.error ?? `Generation failed (${res.status})`);
        setLoading(false);
        return;
      }

      // Parse SSE stream: each event is `data: {json}\n\n`. Buffer across
      // chunk boundaries since a single event may arrive split.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let companionId: string | null = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const raw of events) {
          const trimmed = raw.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload) continue;
          try {
            const evt: ProgressEvent = JSON.parse(payload);
            if (evt.kind === "step" && evt.step && evt.status) {
              setStepStates((s) => ({ ...s, [evt.step!]: evt.status === "running" ? "running" : "done" }));
              if (evt.status === "done" && typeof evt.count === "number") {
                setStepCounts((c) => ({ ...c, [evt.step!]: evt.count }));
              }
            } else if (evt.kind === "complete" && evt.result?.companionId) {
              companionId = evt.result.companionId;
            } else if (evt.kind === "warning") {
              setWarnings((w) => [...w, {
                source: evt.source ?? "unknown",
                reason: evt.reason ?? "unknown",
                message: evt.message ?? "(no detail)",
              }]);
            } else if (evt.kind === "error") {
              setError(evt.message ?? "Generation failed");
            }
          } catch { /* ignore malformed lines */ }
        }
      }

      if (companionId) {
        router.push(`/admin/watch-companions/${companionId}`);
      } else {
        setLoading(false);
      }
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
          Search for a movie or show. For shows, pick the season — additional seasons can be added later and accumulate into the same companion.
          Generation takes 2–4 minutes (5 sequential AI calls).
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

        {warnings.length > 0 && (
          <div className="bg-amber-500/5 border border-amber-500/30 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-300">
              <AlertCircle className="w-4 h-4 shrink-0" />
              Generation finished with {warnings.length} warning{warnings.length === 1 ? "" : "s"}
            </div>
            <ul className="space-y-1.5">
              {warnings.map((w, i) => (
                <li key={i} className="text-xs text-amber-200/90 leading-relaxed pl-6">
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-amber-400 mr-1.5">
                    {w.source} / {w.reason}
                  </span>
                  {w.message}
                  {w.source === "subtitles" && (
                    <span className="block text-[11px] text-amber-200/70 mt-0.5">
                      Without subtitles the AI estimates timestamps from runtime percentages — the result will use coarser, rounder numbers (e.g. &ldquo;~80% in&rdquo;) instead of dialogue-anchored ones (e.g. &ldquo;81:42&rdquo;).
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {loading && (
          <div className="space-y-1.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3">
            {STEPS.map((step) => {
              const state = stepStates[step.key];
              const count = stepCounts[step.key];
              return (
                <div key={step.key} className="flex items-center gap-2 text-sm">
                  {state === "done" ? (
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : state === "running" ? (
                    <Loader2 className="w-4 h-4 text-[var(--ratist-red)] shrink-0 animate-spin" />
                  ) : (
                    <Circle className="w-4 h-4 text-[var(--foreground-muted)]/40 shrink-0" />
                  )}
                  <span className={state === "pending" ? "text-[var(--foreground-muted)]" : "text-white"}>
                    {step.label}
                  </span>
                  {typeof count === "number" && (
                    <span className="text-[11px] text-[var(--foreground-muted)] ml-auto">{count} emitted</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <button
          onClick={generate}
          disabled={loading || !picked}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--ratist-red)] text-white rounded-lg text-sm font-semibold hover:bg-[var(--ratist-red)]/80 transition-colors disabled:opacity-50"
        >
          {loading ? (
            <><RefreshCcw className="w-4 h-4 animate-spin" /> Generating…</>
          ) : (
            <><Sparkles className="w-4 h-4" /> Generate</>
          )}
        </button>
      </div>
    </div>
  );
}
