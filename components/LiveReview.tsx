"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, RotateCcw, Bookmark, ChevronDown, ChevronUp, Clock, Trash2, ArrowRight, StickyNote } from "lucide-react";

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
}

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
}

export default function LiveReview({ movieId }: Props) {
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

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const storageKey = `live-review-${movieId}`;

  // Load saved state from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const state: LiveReviewState = JSON.parse(saved);
        setElapsedSeconds(state.elapsedSeconds ?? 0);
        setBookmarks(state.bookmarks ?? []);
        setGeneralNotes(state.generalNotes ?? "");
        setIsPaused(true);
        if (state.elapsedSeconds > 0) {
          setRunning(true);
          setExpanded(true);
        }
      }
    } catch { /* ignore */ }
  }, [storageKey]);

  // Auto-save to localStorage
  const saveState = useCallback(() => {
    try {
      const state: LiveReviewState = { elapsedSeconds, bookmarks, generalNotes, isPaused };
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch { /* ignore */ }
  }, [elapsedSeconds, bookmarks, generalNotes, isPaused, storageKey]);

  useEffect(() => {
    if (running) saveState();
  }, [elapsedSeconds, bookmarks, generalNotes, saveState, running]);

  // Timer logic
  useEffect(() => {
    if (running && !isPaused && countdown === null) {
      intervalRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, isPaused, countdown]);

  // Countdown logic
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      setRunning(true);
      setIsPaused(false);
      return;
    }
    const timer = setTimeout(() => setCountdown((prev) => prev !== null ? prev - 1 : null), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  function startTimer() {
    if (useCountdown) {
      setCountdown(5);
    } else {
      setRunning(true);
      setIsPaused(false);
    }
  }

  function togglePause() {
    setIsPaused(!isPaused);
  }

  function resetTimer() {
    setRunning(false);
    setIsPaused(false);
    setElapsedSeconds(0);
    setCountdown(null);
    saveState();
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
    setElapsedSeconds(seconds);
    setGoToInput("");
    if (!running) { setRunning(true); setIsPaused(true); }
  }

  function jumpToBookmark(timestamp: number) {
    setElapsedSeconds(timestamp);
    if (!running) { setRunning(true); setIsPaused(true); }
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
          {/* Timer controls */}
          <div className="flex items-center gap-3 pt-4">
            {/* Timer display */}
            <div className="text-2xl font-mono font-bold text-white min-w-[100px]">
              {formatTime(elapsedSeconds)}
            </div>

            {/* Controls */}
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

            {/* Go-to */}
            <div className="flex items-center gap-1 ml-auto">
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
            <textarea
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
