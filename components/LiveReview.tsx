"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, RotateCcw, Bookmark, ChevronDown, ChevronUp, Clock, Trash2, ArrowRight, StickyNote } from "lucide-react";
import TextareaWithEmoji from "./TextareaWithEmoji";

interface BookmarkEntry {
  id: string;
  timestamp: number; // seconds
  note: string;
  createdAt: number;
}

interface LiveReviewState {
  elapsedSeconds: number;
  bookmarks: BookmarkEntry[];
  generalNotes: string;
  isPaused: boolean;
  // Wall-clock anchors — saved so an in-app navigation away and back
  // resumes from the real current elapsed time, not the value frozen
  // at the last tick before unmount. lastSavedAt gates the "still
  // active" check on rehydrate: only resume RUNNING if the save is
  // recent; otherwise we fall back to the existing pause-on-rehydrate
  // behavior for the "user came back days later" case.
  startedAtMs?: number;
  totalPausedMs?: number;
  lastSavedAt?: number;
}

// Saved-state freshness window — within this many ms, a rehydrated
// LiveReview restores its running state with wall-clock-accurate
// elapsed. Older saves rehydrate paused so a stale timer doesn't
// silently keep counting after a long absence.
const RESUME_FRESHNESS_MS = 5 * 60 * 1000;

function formatTime(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function parseTime(str: string): number | null {
  const parts = str.split(":").map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return null;
}

interface Props {
  movieId: string; // tmdb ID for localStorage key
  // Optional metadata threaded through to the iOS Live Activity so
  // the Dynamic Island / Lock Screen tile shows the movie title +
  // poster while the review session is active. Both are no-ops when
  // omitted (the helper falls back to defaults / icon-only).
  movieTitle?: string;
  posterPath?: string | null;
}

// Initial cap on a Live Review session. Past 4 hours we assume the
// user might have forgotten the timer is running. The cap is "soft"
// in practice: a pre-cap warning at -15 min lets them extend by 1
// hour proactively, and resuming after an auto-pause also adds 1
// hour. So truly long sessions just require periodic confirmation
// — no hard ceiling.
const INITIAL_CAP_SEC = 4 * 3600;
const CAP_EXTENSION_SEC = 1 * 3600;
// Pre-cap warning fires this many seconds before the current cap.
const CAP_WARNING_LEAD_SEC = 15 * 60;

// Global-across-the-browser pointer to whichever movie currently has
// a running (not paused) Live Review timer. Held in localStorage so
// concurrent rate pages in other tabs can detect the conflict and
// prompt before stepping on each other.
const RUNNING_MOVIE_KEY = "live-review-running-movie-id";

function readRunningMovieId(): string | null {
  try { return localStorage.getItem(RUNNING_MOVIE_KEY); } catch { return null; }
}
function setRunningMovieId(movieId: string | null) {
  try {
    if (movieId) localStorage.setItem(RUNNING_MOVIE_KEY, movieId);
    else localStorage.removeItem(RUNNING_MOVIE_KEY);
  } catch { /* ignore */ }
}

export default function LiveReview({ movieId, movieTitle, posterPath }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [running, setRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>([]);
  const [generalNotes, setGeneralNotes] = useState("");
  const [bookmarkInput, setBookmarkInput] = useState("");
  const [goToInput, setGoToInput] = useState("");
  const [useCountdown, setUseCountdown] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  // True when the cap auto-paused the timer. Surfaces a notice so
  // the user knows the pause wasn't manual. Cleared on resume / reset.
  const [autoPaused, setAutoPaused] = useState(false);
  // Pre-cap warning visibility (true in the 15-min window leading
  // up to the cap, while running).
  const [showCapWarning, setShowCapWarning] = useState(false);
  // Current session cap in seconds. Starts at 4h; each "Extend" or
  // post-autopause "Resume" pushes it forward 1h. Refs because the
  // tick reads it without needing to re-subscribe.
  const capSecondsRef = useRef(INITIAL_CAP_SEC);
  const [capSeconds, setCapSeconds] = useState(INITIAL_CAP_SEC);

  // Wall-clock anchors. The previous setInterval-counts-by-1-each-tick
  // approach silently fell behind real time when the tab/screen slept —
  // mobile browsers throttle backgrounded intervals heavily (or stop
  // them entirely on lock), so closing a laptop or locking a phone
  // mid-movie left the elapsed counter stuck at the time of sleep.
  // Now we just store when the session started, accumulate any
  // pause durations, and compute elapsed = now - started - paused
  // on every tick. The interval is purely a re-render trigger; truth
  // is wall-clock math, so screen-off time is naturally accounted for.
  const startedAtRef = useRef<number | null>(null);
  const totalPausedMsRef = useRef(0);
  const pauseStartedAtRef = useRef<number | null>(null);
  const storageKey = `live-review-${movieId}`;

  const computeElapsedSec = useCallback((): number => {
    if (startedAtRef.current === null) return 0;
    const now = Date.now();
    const currentPauseExtra = pauseStartedAtRef.current !== null ? (now - pauseStartedAtRef.current) : 0;
    const elapsedMs = now - startedAtRef.current - totalPausedMsRef.current - currentPauseExtra;
    return Math.max(0, Math.floor(elapsedMs / 1000));
  }, []);

  // Load saved state from localStorage. Two rehydration modes:
  //   1. Fresh save (lastSavedAt within RESUME_FRESHNESS_MS) AND saved
  //      isPaused === false — the user just navigated away within the
  //      app. Restore the running state with wall-clock-accurate
  //      elapsed so the timer continues counting from where it actually
  //      is right now, not where it was at the moment of unmount.
  //   2. Stale save (older than RESUME_FRESHNESS_MS) OR saved as
  //      paused — fall back to paused rehydrate. Avoids silently
  //      continuing a timer the user forgot about days ago; they hit
  //      Resume explicitly.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const state: LiveReviewState = JSON.parse(saved);
        const seconds = state.elapsedSeconds ?? 0;
        setBookmarks(state.bookmarks ?? []);
        setGeneralNotes(state.generalNotes ?? "");

        const lastSavedAt = state.lastSavedAt ?? 0;
        const savedStartedAt = state.startedAtMs ?? null;
        const savedTotalPausedMs = state.totalPausedMs ?? 0;
        const isFreshAndRunning =
          state.isPaused === false &&
          savedStartedAt !== null &&
          (Date.now() - lastSavedAt) < RESUME_FRESHNESS_MS;

        if (isFreshAndRunning) {
          // Continue the timer — wall-clock elapsed since the original
          // start, minus accumulated paused time. No re-anchoring; the
          // saved startedAtMs is the source of truth.
          startedAtRef.current = savedStartedAt;
          totalPausedMsRef.current = savedTotalPausedMs;
          pauseStartedAtRef.current = null;
          const liveElapsed = Math.max(
            0,
            Math.floor((Date.now() - savedStartedAt - savedTotalPausedMs) / 1000),
          );
          setElapsedSeconds(liveElapsed);
          setIsPaused(false);
          setRunning(true);
          setExpanded(true);
        } else {
          setElapsedSeconds(seconds);
          setIsPaused(true);
          if (seconds > 0) {
            // Reconstruct the anchors so Resume picks up cleanly from
            // here without a visible jump or re-zeroing.
            startedAtRef.current = Date.now() - seconds * 1000;
            totalPausedMsRef.current = 0;
            pauseStartedAtRef.current = Date.now();
            setRunning(true);
            setExpanded(true);
          }
          // Only stale rehydrates clear the global-running pointer — a
          // fresh-running rehydrate KEEPS the pointer so this tab/page
          // properly owns the in-progress session.
          if (readRunningMovieId() === movieId) setRunningMovieId(null);
        }
      }
    } catch { /* ignore */ }
  }, [storageKey, movieId]);

  // Auto-save to localStorage. Includes wall-clock anchors so an
  // in-app navigation away (component unmount) can restore the running
  // timer at the correct current elapsed when the user comes back —
  // not the snapshot frozen at the last tick.
  const saveState = useCallback(() => {
    try {
      const state: LiveReviewState = {
        elapsedSeconds,
        bookmarks,
        generalNotes,
        isPaused,
        startedAtMs: startedAtRef.current ?? undefined,
        totalPausedMs: totalPausedMsRef.current,
        lastSavedAt: Date.now(),
      };
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch { /* ignore */ }
  }, [elapsedSeconds, bookmarks, generalNotes, isPaused, storageKey]);

  useEffect(() => {
    if (running) saveState();
  }, [elapsedSeconds, bookmarks, generalNotes, saveState, running]);

  // Latest bookmarks count surfaced to the per-minute update tick.
  // Refs so a fresh note doesn't tear down + restart the parent effect.
  const bookmarksLenRef = useRef(bookmarks.length);
  useEffect(() => { bookmarksLenRef.current = bookmarks.length; }, [bookmarks.length]);

  // Live Activity lifecycle — simple "show while actively going" model.
  //
  // The native chronometer can't actually pause (setUsesChronometer
  // ticks forward from setWhen forever). Instead of trying to render
  // a frozen "Paused · MM:SS" state, we just end the activity entirely
  // when the user pauses, and start a fresh one on resume. That side-
  // steps the chronometer-pause problem AND naturally fixes the
  // jump-to-time + resume case: the resume call re-anchors setWhen
  // to (now - currentElapsed), so the notification counter picks up
  // wherever the in-app timer is post-jump.
  //
  // Transitions handled:
  //   running=true,  isPaused=false → start activity (fresh anchor)
  //   running=true,  isPaused=true  → end activity (user paused)
  //   running=false                 → end activity (stopped/finished)
  //
  // Component unmount does NOT end the activity — when the user
  // navigates away with the timer running, the notification stays
  // alive so they can tap it to come back.
  const prevActivityVisibleRef = useRef(false);
  useEffect(() => {
    const shouldShow = running && !isPaused;
    const wasShowing = prevActivityVisibleRef.current;
    prevActivityVisibleRef.current = shouldShow;

    if (shouldShow && !wasShowing) {
      // Anchor the chronometer to the in-app timer's CURRENT elapsed
      // (already net of paused intervals AND any setElapsedTo jumps).
      // The native plugin's setWhen(startedAt) + setUsesChronometer(true)
      // then ticks forward from this point, matching the in-app value.
      const elapsedSeconds = computeElapsedSec();
      const startedAtMs = Date.now() - elapsedSeconds * 1000;
      void import("@/lib/live-activity").then((m) =>
        m.startLiveReviewActivity({
          sessionId: movieId,
          movieTitle: movieTitle ?? "Live Review",
          posterUrl: posterPath ? `https://image.tmdb.org/t/p/w342${posterPath}` : undefined,
          startedAt: startedAtMs,
        }),
      );
    } else if (!shouldShow && wasShowing) {
      void import("@/lib/live-activity").then((m) => m.endActivity(movieId));
    }
  }, [running, isPaused, movieId, movieTitle, posterPath, computeElapsedSec]);

  // Per-minute update tick for notesCount — only while the activity
  // is visible. Restarts cleanly when isPaused flips (the effect re-
  // runs and re-installs its interval).
  useEffect(() => {
    if (!running || isPaused) return;
    const tick = setInterval(async () => {
      const elapsedSeconds = computeElapsedSec();
      const minutesElapsed = Math.floor(elapsedSeconds / 60);
      const liveActivity = await import("@/lib/live-activity");
      await liveActivity.updateActivity({
        sessionId: movieId,
        payload: { minutesElapsed, notesCount: bookmarksLenRef.current },
      });
    }, 60_000);
    return () => clearInterval(tick);
  }, [running, isPaused, movieId, computeElapsedSec]);

  // Timer logic. The interval re-renders every second; the elapsed
  // value comes from wall-clock math against startedAtRef. A
  // visibilitychange handler re-ticks the moment the page becomes
  // active again so the timer snaps to the correct value immediately
  // on unlock instead of waiting for the next 1-second boundary.
  useEffect(() => {
    if (!running || isPaused || countdown !== null) return;
    const tick = () => {
      const elapsed = computeElapsedSec();
      const cap = capSecondsRef.current;
      if (elapsed >= cap) {
        // Hit the cap → auto-pause. Mirrors a manual pause so Resume
        // works the same way; the autoPaused flag drives the notice.
        pauseStartedAtRef.current = Date.now();
        setIsPaused(true);
        setElapsedSeconds(elapsed);
        setAutoPaused(true);
        setShowCapWarning(false);
        setRunningMovieId(null);
        return;
      }
      // Pre-cap warning window: surface the upcoming auto-pause and
      // offer to extend before it triggers.
      setShowCapWarning(elapsed >= cap - CAP_WARNING_LEAD_SEC);
      setElapsedSeconds(elapsed);
    };
    tick();
    const interval = setInterval(tick, 1000);
    const onVisibility = () => { if (!document.hidden) tick(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [running, isPaused, countdown, computeElapsedSec]);

  // Bump both the ref (read by tick) and the state (read by the UI).
  function bumpCap(deltaSec: number) {
    capSecondsRef.current += deltaSec;
    setCapSeconds(capSecondsRef.current);
  }
  function resetCap() {
    capSecondsRef.current = INITIAL_CAP_SEC;
    setCapSeconds(INITIAL_CAP_SEC);
  }

  function extendCap() {
    bumpCap(CAP_EXTENSION_SEC);
    setShowCapWarning(false);
  }

  // Countdown logic
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      // Countdown hits zero — anchor the wall-clock timer and start.
      // Running slot was already claimed when startTimer queued the
      // countdown, so this transition doesn't need a fresh prompt.
      startedAtRef.current = Date.now();
      totalPausedMsRef.current = 0;
      pauseStartedAtRef.current = null;
      setElapsedSeconds(0);
      setCountdown(null);
      setRunning(true);
      setIsPaused(false);
      setAutoPaused(false);
      return;
    }
    const timer = setTimeout(() => setCountdown((prev) => prev !== null ? prev - 1 : null), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  // Returns true if it's OK to take over the global "running" slot.
  // If another movie's Live Review is currently running, prompts the
  // user; on confirm we steal the slot (the other tab will keep its
  // own component state but stop being the canonical running session).
  function claimRunningSlot(): boolean {
    const existing = readRunningMovieId();
    if (existing && existing !== movieId) {
      const proceed = typeof window !== "undefined" && window.confirm(
        "You already have a Live Review running for another movie. Stop it and start a fresh timer here?"
      );
      if (!proceed) return false;
    }
    setRunningMovieId(movieId);
    return true;
  }

  function startTimer() {
    if (useCountdown) {
      if (!claimRunningSlot()) return;
      setCountdown(5);
    } else {
      if (!claimRunningSlot()) return;
      // Fresh start — anchor at now, no pauses, zero elapsed.
      startedAtRef.current = Date.now();
      totalPausedMsRef.current = 0;
      pauseStartedAtRef.current = null;
      setElapsedSeconds(0);
      setRunning(true);
      setIsPaused(false);
      setAutoPaused(false);
    }
  }

  function togglePause() {
    if (isPaused) {
      // Resuming — re-acquire the global slot (claim handles conflict
      // prompts and bails out cleanly if the user cancels).
      if (!claimRunningSlot()) return;
      if (pauseStartedAtRef.current !== null) {
        totalPausedMsRef.current += Date.now() - pauseStartedAtRef.current;
        pauseStartedAtRef.current = null;
      }
      // If the pause came from the auto-pause cap, push the cap
      // forward another hour. Without this, the next tick would
      // immediately re-trip the cap and re-pause — Resume would
      // appear to do nothing.
      if (autoPaused) {
        bumpCap(CAP_EXTENSION_SEC);
      }
      setIsPaused(false);
      setAutoPaused(false);
      setShowCapWarning(false);
    } else {
      pauseStartedAtRef.current = Date.now();
      setIsPaused(true);
      // Pausing frees the global slot so another movie can start.
      setRunningMovieId(null);
    }
  }

  function resetTimer() {
    startedAtRef.current = null;
    totalPausedMsRef.current = 0;
    pauseStartedAtRef.current = null;
    setRunning(false);
    setIsPaused(false);
    setAutoPaused(false);
    setShowCapWarning(false);
    setElapsedSeconds(0);
    setCountdown(null);
    resetCap();
    if (readRunningMovieId() === movieId) setRunningMovieId(null);
    saveState();
  }

  // Manually move the elapsed value to `seconds` (used by Jump-to and
  // bookmark jumps). Re-anchor startedAt accordingly so subsequent
  // wall-clock math produces the requested value and continues
  // accruing from there. Preserves current pause state.
  function setElapsedTo(seconds: number) {
    startedAtRef.current = Date.now() - seconds * 1000;
    totalPausedMsRef.current = 0;
    pauseStartedAtRef.current = isPaused ? Date.now() : null;
    setElapsedSeconds(seconds);
  }

  function clearAllNotes() {
    if (!confirm("Clear all bookmarks and notes? This cannot be undone.")) return;
    setBookmarks([]);
    setGeneralNotes("");
    saveState();
  }

  function addBookmark() {
    const entry: BookmarkEntry = {
      id: Date.now().toString(),
      timestamp: elapsedSeconds,
      note: bookmarkInput.trim(),
      createdAt: Date.now(),
    };
    setBookmarks((prev) => [...prev, entry].sort((a, b) => a.timestamp - b.timestamp));
    setBookmarkInput("");
  }

  function removeBookmark(id: string) {
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
  }

  function goToTimestamp() {
    const seconds = parseTime(goToInput.trim());
    if (seconds === null || seconds < 0) return;
    if (!running) {
      // Bringing the timer to life in paused state at the chosen
      // position. Mark paused first so setElapsedTo sets the
      // pause anchor correctly on the same render.
      pauseStartedAtRef.current = Date.now();
      setIsPaused(true);
      setRunning(true);
    }
    setElapsedTo(seconds);
    setGoToInput("");
  }

  function jumpToBookmark(timestamp: number) {
    if (!running) {
      pauseStartedAtRef.current = Date.now();
      setIsPaused(true);
      setRunning(true);
    }
    setElapsedTo(timestamp);
  }

  function clearSavedState() {
    try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl mb-6 overflow-hidden">
      {/* Header bar — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--surface-2)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-[var(--ratist-red)]" />
          <span className="text-sm font-semibold text-white">Live Review</span>
          {running && (
            <span className={`text-xs font-mono px-2 py-0.5 rounded ${isPaused ? "bg-yellow-500/20 text-yellow-400" : "bg-green-500/20 text-green-400"}`}>
              {formatTime(elapsedSeconds)} {isPaused ? "paused" : ""}
            </span>
          )}
          {bookmarks.length > 0 && (
            <span className="text-[10px] text-[var(--foreground-muted)]">{bookmarks.length} bookmark{bookmarks.length !== 1 ? "s" : ""}</span>
          )}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-[var(--foreground-muted)]" /> : <ChevronDown className="w-4 h-4 text-[var(--foreground-muted)]" />}
      </button>

      {/* Countdown overlay */}
      {countdown !== null && (
        <div className="px-4 py-8 text-center bg-black/50">
          <p className="text-sm text-[var(--foreground-muted)] mb-2">Starting in...</p>
          <p className="text-5xl font-bold text-[var(--ratist-red)] animate-pulse">{countdown}</p>
          <p className="text-xs text-[var(--foreground-muted)] mt-2">Press play on your movie!</p>
        </div>
      )}

      {/* Expanded content */}
      {expanded && countdown === null && (
        <div className="px-4 pb-4 space-y-4 border-t border-[var(--border)]">
          {/* Cap notices. Two variants share the same slot:
             - Pre-cap (running, within 15 min of cap): heads-up + Extend.
             - Auto-pause (cap reached + paused): explains the pause,
               clarifies that Resume will tack on another hour. */}
          {showCapWarning && !isPaused && (
            <div className="mt-3 flex items-start gap-3 bg-yellow-500/10 border border-yellow-500/40 rounded-lg px-3 py-2 text-xs text-yellow-200 leading-relaxed">
              <Clock className="w-3.5 h-3.5 shrink-0 mt-0.5 text-yellow-300" />
              <span className="flex-1">
                <span className="font-semibold text-yellow-100">Live Review will auto-pause at {Math.floor(capSeconds / 3600)} hours</span>
                {" "}(in about {Math.max(1, Math.ceil((capSeconds - elapsedSeconds) / 60))} min). Still watching?
              </span>
              <button
                onClick={extendCap}
                className="shrink-0 text-[11px] font-semibold text-yellow-100 bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/50 rounded-md px-2.5 py-1 transition-colors"
              >
                Extend 1 hour
              </button>
            </div>
          )}
          {autoPaused && isPaused && (
            <div className="mt-3 flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/40 rounded-lg px-3 py-2 text-xs text-yellow-200 leading-relaxed">
              <Clock className="w-3.5 h-3.5 shrink-0 mt-0.5 text-yellow-300" />
              <span>
                <span className="font-semibold text-yellow-100">Auto-paused at the {Math.floor(capSeconds / 3600)}-hour mark.</span>{" "}
                Hit Resume to extend by another hour, or Reset to clear the timer.
              </span>
            </div>
          )}
          {/* Timer controls */}
          <div className="pt-4 space-y-3">
            {/* Row 1: Timer + controls */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="text-2xl font-mono font-bold text-white">
                {formatTime(elapsedSeconds)}
              </div>

              {!running ? (
                <div className="flex items-center gap-2">
                  <button onClick={startTimer}
                    className="flex items-center gap-1.5 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors">
                    <Play className="w-3 h-3" /> Start
                  </button>
                  <label className="flex items-center gap-1.5 text-[10px] text-[var(--foreground-muted)] cursor-pointer">
                    <input type="checkbox" checked={useCountdown} onChange={(e) => setUseCountdown(e.target.checked)}
                      className="rounded border-[var(--border)] accent-[var(--ratist-red)]" />
                    5s countdown
                  </label>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button onClick={togglePause}
                    className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg transition-colors ${isPaused ? "bg-green-500/20 text-green-400 hover:bg-green-500/30" : "bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30"}`}>
                    {isPaused ? <><Play className="w-3 h-3" /> Resume</> : <><Pause className="w-3 h-3" /> Pause</>}
                  </button>
                  <button onClick={resetTimer}
                    className="flex items-center gap-1 text-xs text-[var(--foreground-muted)] hover:text-white transition-colors px-2 py-2" title="Reset timer">
                    <RotateCcw className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            {/* Row 2: Go-to timestamp */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[var(--foreground-muted)]">Jump to:</span>
              <input type="text" value={goToInput} onChange={(e) => setGoToInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && goToTimestamp()}
                placeholder="0:00:00"
                className="w-20 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-white text-center font-mono placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]" />
              <button onClick={goToTimestamp} className="text-xs text-[var(--foreground-muted)] hover:text-white transition-colors p-1.5" title="Go to timestamp">
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Add bookmark */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-[var(--ratist-red)] flex-shrink-0 w-14">{formatTime(elapsedSeconds)}</span>
            <input type="text" value={bookmarkInput} onChange={(e) => setBookmarkInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addBookmark()}
              placeholder="Add a note at this timestamp..."
              className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]" />
            <button onClick={addBookmark}
              className="flex items-center gap-1 text-xs bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-white hover:border-[var(--ratist-red)] transition-colors flex-shrink-0">
              <Bookmark className="w-3 h-3" /> Add
            </button>
          </div>

          {/* Bookmarks list */}
          {bookmarks.length > 0 && (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {bookmarks.map((b) => (
                <div key={b.id} className="flex items-center gap-2 bg-[var(--surface-2)] rounded-lg px-3 py-2 group">
                  <button onClick={() => jumpToBookmark(b.timestamp)}
                    className="text-xs font-mono text-[var(--ratist-red)] hover:underline flex-shrink-0 w-14" title="Jump to this timestamp">
                    {formatTime(b.timestamp)}
                  </button>
                  <p className="text-xs text-white flex-1 truncate">{b.note || "Bookmark"}</p>
                  <button onClick={() => removeBookmark(b.id)}
                    className="text-[var(--foreground-muted)] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* General notes */}
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <StickyNote className="w-3 h-3 text-[var(--foreground-muted)]" />
              <span className="text-[10px] text-[var(--foreground-muted)]">General Notes</span>
            </div>
            <TextareaWithEmoji
              value={generalNotes} onChange={(e) => setGeneralNotes(e.target.value)}
              placeholder="Overall thoughts, themes, anything you want to remember..."
              rows={2}
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] resize-y"
            />
          </div>

          {/* Clear / info */}
          <div className="flex items-center justify-between">
            <p className="text-[9px] text-[var(--foreground-muted)]">Auto-saved to your browser. Only visible to you.</p>
            {(bookmarks.length > 0 || generalNotes) && (
              <button onClick={clearAllNotes}
                className="text-[10px] text-[var(--foreground-muted)] hover:text-red-400 transition-colors">
                Clear all notes
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
