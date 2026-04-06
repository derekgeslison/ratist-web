"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Flag, X, Check } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const REASONS = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "spoilers", label: "Unmarked spoilers" },
  { value: "other", label: "Other" },
];

interface Props {
  targetType: "review" | "comment" | "forumPost" | "hotTake" | "recast" | "looksLike" | "pitch";
  targetId: string;
}

export default function ReportButton({ targetType, targetId }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  if (!user) return null;

  function openDropdown() {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropdownHeight = 300;
      const top = spaceBelow < dropdownHeight
        ? rect.top + window.scrollY - dropdownHeight - 4
        : rect.bottom + window.scrollY + 4;
      const left = Math.max(8, rect.right + window.scrollX - 256);
      setPos({ top, left });
    }
    setOpen(true);
  }

  async function submit() {
    if (!reason || !user) return;
    setSubmitting(true);
    setError("");
    const token = await user.getIdToken();
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ targetType, targetId, reason, details }),
    });
    if (res.ok) {
      setDone(true);
      setTimeout(() => { setOpen(false); setDone(false); setReason(""); setDetails(""); }, 1500);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to submit report");
    }
    setSubmitting(false);
  }

  if (done) {
    return (
      <span className="flex items-center gap-1 text-xs text-green-400">
        <Check className="w-3 h-3" /> Reported
      </span>
    );
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => open ? setOpen(false) : openDropdown()}
        className="p-1 rounded text-[var(--foreground-muted)] hover:text-red-400 transition-colors"
        title="Report"
      >
        <Flag className="w-3.5 h-3.5" />
      </button>

      {open && pos && typeof document !== "undefined" && createPortal(
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          {/* Dropdown */}
          <div
            className="absolute z-[61] bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl p-4 w-64"
            style={{ top: pos.top, left: pos.left }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-white">Report</span>
              <button onClick={() => setOpen(false)} className="text-[var(--foreground-muted)] hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 mb-3">
              {REASONS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setReason(r.value)}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-colors ${
                    reason === r.value ? "bg-[var(--ratist-red)]/20 text-[var(--ratist-red)] border border-[var(--ratist-red)]/50" : "text-[var(--foreground-muted)] hover:bg-[var(--surface-2)] border border-transparent"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {reason === "other" && (
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Please describe the issue…"
                rows={2}
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-xs text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] mb-3 resize-none"
              />
            )}

            {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

            <button
              onClick={submit}
              disabled={!reason || submitting}
              className="w-full py-2 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              {submitting ? "Submitting…" : "Submit Report"}
            </button>
          </div>
        </>,
        document.body
      )}
    </>
  );
}
