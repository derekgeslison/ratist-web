"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ArrowLeft, MonitorPlay, Sparkles, RefreshCcw, Check, Loader2, Circle, AlertCircle, Clock, Hourglass } from "lucide-react";
import { track } from "@/lib/analytics";
import FunFactsCarousel from "./FunFactsCarousel";

interface Props {
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  season?: number | null;
  /** Optional — if the TV show has seasons to choose from, pass them. */
  availableSeasons?: number[];
}

type StepKey = "grounding" | "characters" | "facts" | "relationships" | "timeline" | "glossary" | "persist";
type StepState = "pending" | "running" | "done";

// Step labels are templated on media type so users see "Fetching movie
// information" instead of our internal "Fetch grounding (TMDB + Wikipedia)"
// plumbing language.
function buildSteps(mediaType: "movie" | "tv"): Array<{ key: StepKey; label: string }> {
  return [
    { key: "grounding", label: `Fetching ${mediaType === "movie" ? "movie" : "show"} information` },
    { key: "characters", label: "Drafting characters" },
    { key: "facts", label: "Drafting character facts" },
    { key: "relationships", label: "Drafting relationships" },
    { key: "timeline", label: "Drafting timeline" },
    { key: "glossary", label: "Drafting glossary" },
    { key: "persist", label: "Saving + publishing" },
  ];
}

interface CreditsInfo {
  used: number;
  cap: number | null;
  remaining: number | null;
  aiDisabled: boolean;
  hasPass: boolean;
  isAdmin: boolean;
}

interface RequestRow {
  id: string;
  status: string;
  season: number | null;
}

interface Eligibility {
  eligible: boolean;
  reason?: string;
}

/**
 * "Companion not available yet" UX. Three possible user states:
 *  1. Signed out → CTA to sign in.
 *  2. Signed in with credits → inline Generate button that fires SSE.
 *  3. Signed in, out of credits OR aiDisabled → Request button that queues
 *     an admin approval. Shows "already requested" state when applicable.
 */
export default function CompanionNotAvailable({ tmdbId, mediaType, title, season, availableSeasons }: Props) {
  const { user } = useAuth();
  const router = useRouter();
  const [chosenSeason, setChosenSeason] = useState<number>(season ?? availableSeasons?.[0] ?? 1);
  const [credits, setCredits] = useState<CreditsInfo | null>(null);
  const [existingRequest, setExistingRequest] = useState<RequestRow | null>(null);
  const [queueLength, setQueueLength] = useState(0);
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState("");
  const [rationale, setRationale] = useState("");
  const [stepStates, setStepStates] = useState<Record<StepKey, StepState>>({
    grounding: "pending", characters: "pending", facts: "pending",
    relationships: "pending", timeline: "pending", glossary: "pending", persist: "pending",
  });
  const [stepCounts, setStepCounts] = useState<Partial<Record<StepKey, number>>>({});

  const isTv = mediaType === "tv";
  const seasonForApi = isTv ? chosenSeason : undefined;

  // Pull credit + request status on mount and whenever the chosen season
  // changes. We refetch because switching seasons can change whether this
  // user already has a pending request for that slot.
  useEffect(() => {
    if (!user) {
      setCredits(null);
      setExistingRequest(null);
      setQueueLength(0);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const params = new URLSearchParams({
          tmdbId: String(tmdbId),
          mediaType,
          ...(isTv ? { season: String(chosenSeason) } : {}),
        });
        const res = await fetch(`/api/watch-companion/request?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setCredits(data.credits);
        setExistingRequest(data.request);
        setQueueLength(data.queueLength ?? 0);
        setEligibility(data.eligibility ?? null);
      } catch { /* leave state alone */ }
    })();
    return () => { cancelled = true; };
  }, [user, tmdbId, mediaType, chosenSeason, isTv]);

  function resetSteps() {
    setStepStates({
      grounding: "pending", characters: "pending", facts: "pending",
      relationships: "pending", timeline: "pending", glossary: "pending", persist: "pending",
    });
    setStepCounts({});
  }

  async function generate() {
    if (!user) return;
    setError("");
    setGenerating(true);
    resetSteps();
    track("companion_generate_start", { tmdb_id: tmdbId, media_type: mediaType, season: seasonForApi ?? null });
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/watch-companion/generate", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ tmdbId, mediaType, ...(isTv ? { season: seasonForApi } : {}) }),
      });
      if (!res.ok || !res.body) {
        const errJson = await res.json().catch(() => ({}));
        setError(errJson.error ?? `Generation failed (${res.status})`);
        setGenerating(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;
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
            const evt = JSON.parse(payload);
            if (evt.kind === "step" && evt.step && evt.status) {
              setStepStates((s) => ({ ...s, [evt.step]: evt.status === "running" ? "running" : "done" }));
              if (evt.status === "done" && typeof evt.count === "number") {
                setStepCounts((c) => ({ ...c, [evt.step]: evt.count }));
              }
            } else if (evt.kind === "complete") {
              completed = true;
            } else if (evt.kind === "error") {
              setError(evt.message ?? "Generation failed");
            }
          } catch { /* ignore malformed */ }
        }
      }
      if (completed) {
        track("companion_generate_complete", { tmdb_id: tmdbId, media_type: mediaType, season: seasonForApi ?? null });
        // Reload the current URL — the companion now exists and the server
        // component will render the full viewer instead of this fallback.
        router.refresh();
      } else {
        setGenerating(false);
      }
    } catch (err) {
      track("companion_generate_error", { tmdb_id: tmdbId, media_type: mediaType });
      setError(err instanceof Error ? err.message : "Network error");
      setGenerating(false);
    }
  }

  async function submitRequest() {
    if (!user) return;
    setRequesting(true);
    setError("");
    track("companion_request_submit", { tmdb_id: tmdbId, media_type: mediaType, season: seasonForApi ?? null });
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/watch-companion/request", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          tmdbId, mediaType,
          ...(isTv ? { season: seasonForApi } : {}),
          rationale: rationale || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Request failed");
      } else {
        setExistingRequest(data.request);
        setQueueLength((q) => q + 1);
      }
    } catch {
      setError("Network error — please try again.");
    }
    setRequesting(false);
  }

  const backLink = mediaType === "movie" ? `/movies/${tmdbId}` : `/shows/${tmdbId}`;
  const creditsRemaining = credits?.remaining ?? null;
  const canGenerate = !!user && credits && !credits.aiDisabled && (credits.isAdmin || (creditsRemaining !== null && creditsRemaining > 0));
  const outOfCredits = !!user && credits && !credits.isAdmin && creditsRemaining === 0;

  if (generating) {
    return (
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-12">
        <div className="flex items-center gap-3 mb-6">
          <MonitorPlay className="w-5 h-5 text-[var(--ratist-red)]" />
          <h1 className="text-lg font-bold text-white">Generating companion for {title}…</h1>
        </div>
        <p className="text-sm text-[var(--foreground-muted)] mb-4">
          Our AI drafts the companion in five focused passes — usually takes 2–4 minutes. Keep this tab open.
        </p>
        <div className="space-y-1.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
          {buildSteps(mediaType).map((step) => {
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
                <span className={state === "pending" ? "text-[var(--foreground-muted)]" : "text-white"}>{step.label}</span>
                {typeof count === "number" && (
                  <span className="text-[11px] text-[var(--foreground-muted)] ml-auto">{count} emitted</span>
                )}
              </div>
            );
          })}
        </div>
        {error && (
          <div className="mt-4 flex items-start gap-2 text-sm text-red-400 bg-red-500/5 border border-red-500/20 rounded-lg p-3">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Fun facts carousel — keeps the user engaged during the ~2-4min
           generation. Fetches TMDB details client-side; renders nothing
           when no facts come back (unusual). */}
        <div className="mt-4">
          <FunFactsCarousel tmdbId={tmdbId} mediaType={mediaType} />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-12">
      <div className="text-center mb-6">
        <MonitorPlay className="w-10 h-10 text-[var(--foreground-muted)] mx-auto mb-4" />
        <h1 className="text-xl font-bold text-white mb-2">Watch Companion not generated yet</h1>
        <p className="text-sm text-[var(--foreground-muted)] leading-relaxed">
          {`No one has generated a spoiler-safe viewing guide for ${title} yet. Generate one now if you have credits, or request an admin-approved generation.`}
        </p>
      </div>

      {/* Season picker for TV */}
      {isTv && availableSeasons && availableSeasons.length > 1 && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-4 flex items-center gap-3">
          <label htmlFor="season-choose" className="text-xs uppercase tracking-wider text-[var(--foreground-muted)] font-semibold">
            Season
          </label>
          <select
            id="season-choose"
            value={chosenSeason}
            onChange={(e) => setChosenSeason(parseInt(e.target.value, 10))}
            className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)]"
          >
            {availableSeasons.map((n) => (
              <option key={n} value={n}>Season {n}</option>
            ))}
          </select>
        </div>
      )}

      {!user ? (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-center">
          <p className="text-sm text-[var(--foreground-muted)] mb-3">Sign in to generate or request a companion.</p>
          <Link
            href={`/auth?redirect=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : backLink)}`}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[var(--ratist-red)] text-white rounded-full text-sm font-semibold hover:bg-[var(--ratist-red)]/80 transition-colors"
          >
            Sign in
          </Link>
        </div>
      ) : eligibility && !eligibility.eligible ? (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm text-white font-semibold">
            <AlertCircle className="w-4 h-4 text-[var(--ratist-red)]" /> Not eligible yet
          </div>
          <p className="text-xs text-[var(--foreground-muted)] leading-relaxed">
            {eligibility.reason ?? "This title isn't eligible for a Watch Companion yet."}
          </p>
        </div>
      ) : existingRequest ? (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm text-white font-semibold">
            <Hourglass className="w-4 h-4 text-[var(--ratist-red)]" /> Request submitted
          </div>
          <p className="text-xs text-[var(--foreground-muted)] leading-relaxed">
            An admin will review your request and kick off generation. You&apos;ll get a notification when your companion is ready.
            {queueLength > 1 && ` There are ${queueLength - 1} other pending requests ahead of yours for this title.`}
          </p>
        </div>
      ) : credits?.aiDisabled ? (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
          <p className="text-sm text-[var(--foreground-muted)] leading-relaxed">
            AI features have been disabled for your account. Contact support if you believe this is a mistake.
          </p>
        </div>
      ) : canGenerate ? (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-3">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-white">Generate it yourself</h3>
            {credits && creditsRemaining !== null && (
              <span className="text-[11px] text-[var(--foreground-muted)]">
                {creditsRemaining} of {credits.cap} this week{credits.hasPass ? " (Backstage Pass)" : ""}
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--foreground-muted)] leading-relaxed">
            Takes 2–4 minutes. The companion auto-publishes when done.
          </p>
          <button
            onClick={generate}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--ratist-red)] text-white rounded-lg text-sm font-semibold hover:bg-[var(--ratist-red)]/80 transition-colors"
          >
            <Sparkles className="w-4 h-4" /> Generate now
          </button>
        </div>
      ) : outOfCredits ? (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-3">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-white">Out of credits this week</h3>
            <span className="text-[11px] text-[var(--foreground-muted)]">
              {credits?.used}/{credits?.cap} used
            </span>
          </div>
          <p className="text-xs text-[var(--foreground-muted)] leading-relaxed">
            You&apos;ve used all your Watch Companion generations for this week ({credits?.cap}{credits?.hasPass ? " with Backstage Pass" : ""}). Request an admin-approved generation and we&apos;ll notify you when it&apos;s ready.
            {!credits?.hasPass && " Backstage Pass holders get more per week."}
          </p>
          <textarea
            value={rationale}
            onChange={(e) => setRationale(e.target.value.slice(0, 500))}
            placeholder="Optional: why do you want this companion? (helps admin prioritize)"
            rows={2}
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-white placeholder:text-[var(--foreground-muted)]/60 focus:outline-none focus:border-[var(--ratist-red)] resize-y"
          />
          <button
            onClick={submitRequest}
            disabled={requesting}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--ratist-red)] text-white rounded-lg text-sm font-semibold hover:bg-[var(--ratist-red)]/80 transition-colors disabled:opacity-50"
          >
            {requesting ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
            {requesting ? "Submitting…" : "Request admin-approved generation"}
          </button>
        </div>
      ) : !loading ? (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
          <p className="text-sm text-[var(--foreground-muted)]">Loading your credit status…</p>
        </div>
      ) : null}

      {error && (
        <div className="mt-4 flex items-start gap-2 text-sm text-red-400 bg-red-500/5 border border-red-500/20 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-6 text-center">
        <Link
          href={backLink}
          className="inline-flex items-center gap-1.5 text-xs text-[var(--foreground-muted)] hover:text-white transition-colors"
        >
          <ArrowLeft className="w-3 h-3" /> Back to {mediaType === "movie" ? "movie" : "show"} page
        </Link>
      </div>
    </div>
  );
}
