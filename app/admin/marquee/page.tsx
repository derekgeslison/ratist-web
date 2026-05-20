"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Play, Pause, Loader2, RotateCcw, Send, MessageCircle, Mic, MicOff } from "lucide-react";
import MarqueeVisual from "@/components/marquee/MarqueeVisual";
import HudCard from "@/components/marquee/HudCard";

// Web Speech API types — not in standard lib.dom for legacy reasons.
// Both `SpeechRecognition` and the webkit-prefixed alias exist on window
// in Chrome/Edge. We accept either.
interface SpeechRecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEvent extends Event {
  results: ArrayLike<SpeechRecognitionResult>;
}
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: Event & { error?: string }) => void) | null;
  onstart: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

/**
 * Marquee admin page — the daily-brief Jarvis surface.
 *
 * Flow:
 *   1. Page loads → fetch nothing. User clicks "Generate brief" → POST
 *      to /api/admin/marquee/brief which returns 10 segments with audio.
 *   2. Auto-play starts the first segment. Each segment's onended fires
 *      the next. As each segment starts, we light up the matching HUD
 *      card via the `currentSection` state (drives card animation).
 *   3. User can pause/replay/regenerate.
 *
 * Audio elements are pre-created (one <audio> per segment) and held in a
 * ref array so the MarqueeVisual can attach its Web Audio analyser to
 * the currently-playing one — required because MediaElementSourceNode
 * pins to its source element for life.
 */

// Section keys are fully dynamic. Tiles arrive from the API as a flat
// list; we sort them by whether they're in today's selected brief.
interface Segment {
  section: string;                 // dynamic — e.g. "intro", "users", "featureBreakout"
  prose: string;
  audioBase64: string | null;
  estimatedDurationSec: number | null;
}

interface Tile {
  section: string;
  title: string;
  value: string | number;
  sub: string;
  trend: "up" | "down" | "flat" | null;
  href: string | null;
}

interface BriefResponse {
  segments: Segment[];
  tiles: Tile[];
  selectedSections: string[];   // section keys of brief body, in order
  cached?: boolean;
  cacheAgeMin?: number;
  generatedAt: string;
}

export default function MarqueePage() {
  const { user } = useAuth();
  const [brief, setBrief] = useState<BriefResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentIdx, setCurrentIdx] = useState<number>(-1);
  const [litSections, setLitSections] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const audioElsRef = useRef<HTMLAudioElement[]>([]);
  const [activeAudioEl, setActiveAudioEl] = useState<HTMLAudioElement | null>(null);

  // Q&A state — independent of brief mode.
  const [question, setQuestion] = useState("");
  const [askLoading, setAskLoading] = useState(false);
  const [askExchanges, setAskExchanges] = useState<{ question: string; answer: string; audioEl: HTMLAudioElement | null }[]>([]);

  // Voice input state.
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  // Detect Web Speech API support on mount. Chrome/Edge expose it; some
  // browsers (Firefox) don't, in which case we hide the mic button.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
    setVoiceSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  const generate = useCallback(async (force: boolean = false) => {
    if (!user) return;
    setLoading(true);
    setError(null);
    setBrief(null);
    setPlaying(false);
    setCurrentIdx(-1);
    setLitSections(new Set());
    audioElsRef.current = [];
    setActiveAudioEl(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/marquee/brief", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      const data: BriefResponse = await res.json();
      setBrief(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate brief");
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Build <audio> elements when a fresh brief lands. We can't do this in
  // JSX because we need a stable ref array MarqueeVisual can hook into.
  useEffect(() => {
    if (!brief) return;
    const els: HTMLAudioElement[] = brief.segments.map((s) => {
      const el = new Audio();
      if (s.audioBase64) {
        el.src = `data:audio/mpeg;base64,${s.audioBase64}`;
        el.preload = "auto";
      }
      return el;
    });
    audioElsRef.current = els;
    // Cleanup: revoke + pause on unmount or new brief.
    return () => {
      for (const el of els) {
        try { el.pause(); } catch { /* ignore */ }
        el.src = "";
      }
    };
  }, [brief]);

  const playFrom = useCallback((idx: number) => {
    if (!brief) return;
    const els = audioElsRef.current;
    if (idx < 0 || idx >= els.length) {
      setPlaying(false);
      setCurrentIdx(-1);
      setActiveAudioEl(null);
      return;
    }
    setCurrentIdx(idx);
    setLitSections((prev) => new Set([...prev, brief.segments[idx].section]));
    const el = els[idx];
    // Reset playback head — a previously-completed brief leaves every
    // audio element at currentTime=duration. Calling play() then is a
    // no-op (or plays end-of-track silence) so without this reset, the
    // Play button does nothing on the second click after a brief
    // finishes.
    try { el.currentTime = 0; } catch { /* not loaded yet — harmless */ }
    setActiveAudioEl(el);
    setPlaying(true);

    const onEnded = () => {
      el.removeEventListener("ended", onEnded);
      playFrom(idx + 1);
    };
    el.addEventListener("ended", onEnded);
    // Some browsers reject autoplay if not from a user gesture. The initial
    // play comes from a button click so this should succeed; failures we
    // log + halt rather than infinite-loop.
    el.play().catch((err) => {
      console.warn("[Marquee] audio play rejected:", err);
      setPlaying(false);
    });
  }, [brief]);

  const stop = useCallback(() => {
    const els = audioElsRef.current;
    for (const el of els) {
      try { el.pause(); el.currentTime = 0; } catch { /* ignore */ }
    }
    setPlaying(false);
    setCurrentIdx(-1);
    setActiveAudioEl(null);
  }, []);

  const togglePlay = useCallback(() => {
    if (!brief) return;
    if (playing) {
      audioElsRef.current[currentIdx]?.pause();
      setPlaying(false);
    } else if (currentIdx >= 0 && currentIdx < brief.segments.length) {
      audioElsRef.current[currentIdx]?.play();
      setPlaying(true);
    } else {
      playFrom(0);
    }
  }, [brief, playing, currentIdx, playFrom]);

  // Sort tiles so today's brief sections appear FIRST in their narration
  // order, then unselected tiles fill the rest of the grid (dimmed). This
  // is the at-a-glance promise: "what Marquee's about to talk about is
  // up top; everything else being tracked is below."
  //
  // Defensive ?? [] on tiles/selectedSections in case a stale cached
  // payload predates these fields — the API auto-busts old shapes, but
  // belt-and-suspenders.
  const sortedTiles = useMemo(() => {
    if (!brief) return [];
    const tiles = brief.tiles ?? [];
    const selected = brief.selectedSections ?? [];
    const orderMap = new Map(selected.map((s, i) => [s, i] as const));
    return [...tiles].sort((a, b) => {
      const aOrder = orderMap.get(a.section);
      const bOrder = orderMap.get(b.section);
      if (aOrder != null && bOrder != null) return aOrder - bOrder;
      if (aOrder != null) return -1;
      if (bOrder != null) return 1;
      return 0;
    });
  }, [brief]);

  const selectedSet = useMemo(() => new Set(brief?.selectedSections ?? []), [brief]);
  const currentSection = currentIdx >= 0 && brief ? brief.segments[currentIdx].section : null;

  const stopListening = useCallback(() => {
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    recognitionRef.current = null;
    setListening(false);
  }, []);

  const startListening = useCallback(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    if (recognitionRef.current) {
      // Already listening — toggle off.
      stopListening();
      return;
    }
    const rec = new Ctor();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (e) => {
      // Aggregate everything seen so far. Interim results show live in the
      // input so the user can watch their words land; final result stays.
      let transcript = "";
      for (let i = 0; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript;
      }
      setQuestion(transcript);
    };
    rec.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };
    rec.onerror = (e) => {
      // "no-speech" is the most common error — user clicked mic but didn't
      // talk. Silently bail rather than logging an alarming red message.
      if (e.error && e.error !== "no-speech" && e.error !== "aborted") {
        console.warn("[Marquee.voice] recognition error:", e.error);
      }
      recognitionRef.current = null;
      setListening(false);
    };
    recognitionRef.current = rec;
    setListening(true);
    try { rec.start(); } catch {
      // start() throws if a recognition is already active in another tab.
      recognitionRef.current = null;
      setListening(false);
    }
  }, [stopListening]);

  const askQuestion = useCallback(async () => {
    if (!user) return;
    const q = question.trim();
    if (!q) return;
    setAskLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/marquee/ask", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, speak: true }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setAskExchanges((prev) => [...prev, { question: q, answer: `Error: ${body.error ?? res.status}`, audioEl: null }]);
        return;
      }
      const data: { answer: string; audioBase64: string | null } = await res.json();
      let audioEl: HTMLAudioElement | null = null;
      if (data.audioBase64) {
        audioEl = new Audio(`data:audio/mpeg;base64,${data.audioBase64}`);
        // Stop any currently-playing brief audio so they don't talk over each other.
        for (const el of audioElsRef.current) {
          try { el.pause(); } catch { /* ignore */ }
        }
        setActiveAudioEl(audioEl);
        audioEl.play().catch(() => { /* user gesture issues */ });
      }
      setAskExchanges((prev) => [...prev, { question: q, answer: data.answer, audioEl }]);
      setQuestion("");
    } catch (err) {
      setAskExchanges((prev) => [...prev, { question: q, answer: err instanceof Error ? err.message : "Request failed", audioEl: null }]);
    } finally {
      setAskLoading(false);
    }
  }, [user, question]);

  if (!user) return <div className="p-6 text-[var(--foreground-muted)]">Sign in required.</div>;

  return (
    <div className="p-6 max-w-6xl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-white">Marquee</h1>
        <p className="text-sm text-[var(--foreground-muted)] mt-1">
          Your daily briefing. Hit play, listen, and the HUD lights up as Marquee narrates each section.
        </p>
      </div>

      {/* Visual — capped at 85% so it doesn't dominate the page */}
      <div className="relative bg-black rounded-xl border border-[var(--border)] overflow-hidden mb-4 mx-auto" style={{ width: "85%" }}>
        <MarqueeVisual
          state={loading ? "loading" : playing ? "speaking" : "idle"}
          audioEl={activeAudioEl}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 mb-6">
        {!brief ? (
          <button
            onClick={() => generate(false)}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] disabled:opacity-50 text-white font-semibold rounded-full text-sm transition-colors"
          >
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Compiling brief…</> : <><Play className="w-4 h-4" /> Generate today's brief</>}
          </button>
        ) : (
          <>
            <button
              onClick={togglePlay}
              className="flex items-center gap-2 px-5 py-2.5 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white font-semibold rounded-full text-sm transition-colors"
            >
              {playing ? <><Pause className="w-4 h-4" /> Pause</> : <><Play className="w-4 h-4" /> {currentIdx < 0 ? "Play brief" : "Resume"}</>}
            </button>
            {currentIdx >= 0 && (
              <button
                onClick={stop}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--surface-2)] hover:bg-[var(--surface)] text-[var(--foreground-muted)] hover:text-white text-sm rounded-full transition-colors"
              >
                Stop
              </button>
            )}
            <button
              onClick={() => generate(true)}
              disabled={loading}
              title="Force a fresh brief (bypasses 12-hour cache)"
              className="flex items-center gap-2 px-4 py-2 bg-[var(--surface-2)] hover:bg-[var(--surface)] text-[var(--foreground-muted)] hover:text-white text-sm rounded-full transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Regenerate
            </button>
            {brief.cached && (
              <span
                title={`Brief was cached ${brief.cacheAgeMin}m ago. Hit Regenerate to force a fresh one.`}
                className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] bg-[var(--surface-2)] px-2 py-1 rounded-full"
              >
                Cached · {brief.cacheAgeMin}m ago
              </span>
            )}
          </>
        )}
      </div>

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

      {/* HUD tile grid — dynamic. Selected sections (today's brief) sort
          to the top in narration order; unselected permanents fill below
          in dim state. Ephemeral tiles only render when they fired. */}
      {brief && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {sortedTiles.map((t) => {
            const isSelected = selectedSet.has(t.section);
            const state =
              currentSection === t.section ? "highlight"
              : isSelected && litSections.has(t.section) ? "lit"
              : isSelected ? "dim"   // selected but not yet narrated
              : "dim";              // not in today's brief
            return (
              <HudCard
                key={t.section}
                title={t.title}
                value={t.value}
                sub={t.sub}
                trend={t.trend}
                href={t.href ?? undefined}
                state={state}
              />
            );
          })}
        </div>
      )}

      {/* Q&A — ask Marquee anything (placed below the HUD so the cards
          are visible at-a-glance and dictation lives where the eye
          naturally lands after scanning the grid) */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mt-6">
        <div className="flex items-center gap-2 mb-3">
          <MessageCircle className="w-4 h-4 text-[var(--ratist-red)]" />
          <h2 className="text-sm font-semibold text-white">Ask Marquee</h2>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); askQuestion(); }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={listening ? "Listening… speak your question" : 'e.g. "How many users joined this week?" or "What’s the most-rated movie this month?"'}
            disabled={askLoading}
            maxLength={500}
            className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)]/60 focus:outline-none focus:border-[var(--ratist-red)] disabled:opacity-50"
          />
          {voiceSupported && (
            <button
              type="button"
              onClick={listening ? stopListening : startListening}
              disabled={askLoading}
              title={listening ? "Stop listening" : "Hold to speak your question"}
              className={`flex items-center justify-center w-10 h-10 rounded-lg transition-colors disabled:opacity-50 ${
                listening
                  ? "bg-[var(--ratist-red)] text-white animate-pulse"
                  : "bg-[var(--surface-2)] hover:bg-[var(--surface)] text-[var(--foreground-muted)] hover:text-white"
              }`}
            >
              {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          )}
          <button
            type="submit"
            disabled={askLoading || !question.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {askLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
        {voiceSupported && (
          <p className="text-[10px] text-[var(--foreground-muted)] mt-2">
            Tap the mic to dictate. Words appear live as you speak — click send when ready, or edit first.
          </p>
        )}

        {askExchanges.length > 0 && (
          <div className="mt-4 space-y-3 max-h-80 overflow-y-auto pr-1">
            {askExchanges.map((ex, i) => (
              <div key={i} className="border-l-2 border-[var(--ratist-red)]/40 pl-3">
                <p className="text-xs text-[var(--foreground-muted)] italic">{ex.question}</p>
                <p className="text-sm text-white mt-1 leading-relaxed">{ex.answer}</p>
                {ex.audioEl && (
                  <button
                    onClick={() => { ex.audioEl!.currentTime = 0; ex.audioEl!.play().catch(() => {}); }}
                    className="text-[10px] uppercase tracking-wider text-[var(--ratist-red)] hover:underline mt-1"
                  >
                    Replay audio
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Current spoken segment as text (accessibility + dev visibility) */}
      {brief && currentIdx >= 0 && (
        <div className="mt-6 p-4 bg-[var(--surface)] border border-[var(--border)] rounded-lg">
          <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-2">
            Now speaking · {brief.segments[currentIdx].section}
          </p>
          <p className="text-sm text-white leading-relaxed">{brief.segments[currentIdx].prose}</p>
        </div>
      )}

      {/* Full transcript */}
      {brief && (
        <details className="mt-6 text-sm">
          <summary className="text-[var(--foreground-muted)] cursor-pointer hover:text-white">Full transcript</summary>
          <div className="mt-3 space-y-2 pl-3 border-l border-[var(--border)]">
            {brief.segments.map((s, i) => (
              <p key={i} className="text-[var(--foreground-muted)]">
                <span className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)]/60 mr-2">{s.section}</span>
                {s.prose}
              </p>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
