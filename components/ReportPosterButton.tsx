"use client";

import { useState } from "react";
import { Flag, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface Props {
  /** TMDB movie id — used as the report's targetId. */
  tmdbId: number;
}

/**
 * Report-poster button for movie detail pages where the rating is
 * NC-17 / NR / unrated. Click opens a small dialog that lets the
 * viewer flag either the movie's poster or images in the Media tab
 * as containing nudity / sexual content. Submits to /api/reports
 * with targetType=moviePoster or movieMedia; the admin then sees
 * the entry in their moderation queue and can block the poster
 * from there (or navigate to the page to take a closer look).
 */
export default function ReportPosterButton({ tmdbId }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"moviePoster" | "movieMedia">("moviePoster");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!user || busy) return;
    setBusy(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType: scope,
          targetId: String(tmdbId),
          reason: "nudity",
          details: details.trim() || undefined,
        }),
      });
      if (res.ok) {
        setDone(true);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Report failed");
      }
    } catch {
      setError("Report failed");
    }
    setBusy(false);
  }

  function openDialog() {
    if (!user) return;
    setOpen(true);
    setDone(false);
    setError(null);
    setDetails("");
    setScope("moviePoster");
  }

  return (
    <>
      <button
        onClick={openDialog}
        disabled={!user}
        className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-[var(--border)] text-[var(--foreground-muted)] hover:text-red-400 hover:border-red-400 transition-colors disabled:opacity-50"
        title={user ? "Report explicit content" : "Sign in to report content"}
        aria-label="Report explicit content"
      >
        <Flag className="w-4 h-4" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Flag className="w-4 h-4 text-red-400" /> Report explicit content
              </h3>
              <button
                onClick={() => setOpen(false)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[var(--surface-2)] border border-[var(--border)] text-white hover:text-red-400 text-xs"
              >
                <X className="w-3.5 h-3.5" /> Close
              </button>
            </div>
            {done ? (
              <div className="p-5 text-center">
                <p className="text-sm text-white mb-1">Thanks — report submitted.</p>
                <p className="text-xs text-[var(--foreground-muted)]">An admin will review and take action if appropriate.</p>
              </div>
            ) : (
              <div className="p-4 space-y-4">
                <div className="text-xs text-[var(--foreground-muted)]">
                  Help us keep the site safe. Flag the poster or media-tab images on this title as containing nudity / sexual content.
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider font-semibold text-[var(--foreground-muted)] mb-2 block">
                    What are you reporting?
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    {([
                      { key: "moviePoster" as const, label: "The movie poster" },
                      { key: "movieMedia" as const, label: "Images in the Media tab" },
                    ]).map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => setScope(key)}
                        className={`px-3 py-2 text-sm rounded-lg border text-left transition-colors ${
                          scope === key
                            ? "border-[var(--ratist-red)] bg-[var(--ratist-red)]/10 text-white"
                            : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--foreground-muted)] hover:text-white"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider font-semibold text-[var(--foreground-muted)] mb-1 block">
                    Notes (optional)
                  </label>
                  <textarea
                    value={details}
                    onChange={(e) => setDetails(e.target.value.slice(0, 500))}
                    placeholder="Anything an admin should know?"
                    rows={3}
                    className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1.5 text-sm text-white resize-y"
                  />
                  <div className="text-[9px] text-[var(--foreground-muted)] mt-0.5 text-right">{details.length}/500</div>
                </div>
                {error && <p className="text-xs text-red-400">{error}</p>}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]/60">
                  <button
                    onClick={() => setOpen(false)}
                    className="px-3 py-1.5 rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submit}
                    disabled={busy}
                    className="px-3 py-1.5 rounded bg-red-500/20 border border-red-500/40 text-red-300 hover:bg-red-500/30 text-xs font-semibold disabled:opacity-50"
                  >
                    {busy ? "Reporting…" : "Submit report"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
