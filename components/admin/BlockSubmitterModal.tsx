"use client";

import { useRef, useState } from "react";
import { X, Ban } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface Submitter {
  userId: string;
  name: string;
  email: string;
}

interface Props {
  submitter: Submitter;
  onClose: () => void;
  onBlocked: (expiresAt: string | null) => void;
}

type Duration = "permanent" | "1d" | "7d" | "30d" | "custom";

/**
 * Block-submitter modal. Admin picks a duration (permanent or until a
 * specific date) and optionally writes a message that's delivered to the
 * blocked user as an in-app notification. PATCH returns; parent updates
 * the row in place.
 */
export default function BlockSubmitterModal({ submitter, onClose, onBlocked }: Props) {
  const { user } = useAuth();
  const [duration, setDuration] = useState<Duration>("7d");
  const [customDate, setCustomDate] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Tracks whether mousedown happened on the backdrop; only close on a
  // complete backdrop click so drag-to-select inside the modal doesn't
  // dismiss it.
  const mouseDownOnBackdrop = useRef(false);

  function computeExpiry(): string | null {
    if (duration === "permanent") return null;
    if (duration === "custom") {
      if (!customDate) return null;
      return new Date(customDate).toISOString();
    }
    const days = duration === "1d" ? 1 : duration === "7d" ? 7 : 30;
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString();
  }

  async function submit() {
    if (!user) return;
    setError("");
    const blockedUntil = computeExpiry();
    if (duration === "custom" && !blockedUntil) {
      setError("Pick a date or choose a preset");
      return;
    }
    setSaving(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/watch-companion/submitters`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: submitter.userId,
          blocked: true,
          blockedUntil,
          message: message.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error ?? "Failed to block submitter");
        return;
      }
      onBlocked(blockedUntil);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onMouseDown={(e) => { mouseDownOnBackdrop.current = e.target === e.currentTarget; }}
      onMouseUp={(e) => {
        if (mouseDownOnBackdrop.current && e.target === e.currentTarget) onClose();
        mouseDownOnBackdrop.current = false;
      }}
    >
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Ban className="w-4 h-4 text-red-400" /> Block {submitter.name}
          </h3>
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[var(--surface-2)] border border-[var(--border)] text-white hover:text-red-400 text-xs"
          >
            <X className="w-3.5 h-3.5" /> Close
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div className="text-xs text-[var(--foreground-muted)]">
            Pauses this user&apos;s Watch Companion suggestion submissions and voting. {submitter.email}
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold text-[var(--foreground-muted)] mb-1 block">
              Duration
            </label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { key: "1d", label: "24 hours" },
                { key: "7d", label: "7 days" },
                { key: "30d", label: "30 days" },
                { key: "permanent", label: "Permanent" },
                { key: "custom", label: "Pick a date" },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setDuration(key)}
                  className={`px-3 py-2 text-xs rounded-lg border transition-colors ${
                    duration === key
                      ? "border-[var(--ratist-red)] bg-[var(--ratist-red)]/10 text-white"
                      : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--foreground-muted)] hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {duration === "custom" && (
              <input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
                className="mt-2 w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1.5 text-sm text-white"
              />
            )}
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold text-[var(--foreground-muted)] mb-1 block">
              Message (optional)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 500))}
              placeholder="Explain why — this is sent to them as a notification."
              rows={3}
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1.5 text-sm text-white resize-y"
            />
            <div className="text-[9px] text-[var(--foreground-muted)] mt-0.5 text-right">{message.length}/500</div>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]/60">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white text-xs"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={saving}
              className="px-3 py-1.5 rounded bg-red-500/20 border border-red-500/40 text-red-300 hover:bg-red-500/30 text-xs font-semibold disabled:opacity-50"
            >
              {saving ? "Blocking…" : "Block submitter"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
