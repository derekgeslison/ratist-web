"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, X, Check } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import SignInLink from "./SignInLink";
import TextareaWithEmoji from "./TextareaWithEmoji";

interface Props {
  sourceId: string;
  sourceName: string;
  ownerFirebaseUid: string;
  unwatchedCount: number;
}

export default function CopyWatchlistButton({ sourceId, sourceName, ownerFirebaseUid, unwatchedCount }: Props) {
  const { user } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(`Copy of ${sourceName}`);
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (user?.uid === ownerFirebaseUid) return null;
  if (unwatchedCount === 0) return null;

  if (!user) {
    return (
      <SignInLink className="flex items-center gap-1.5 text-xs text-[var(--foreground-muted)] hover:text-white border border-[var(--border)] hover:border-[var(--ratist-red)] rounded-full px-3 py-1.5 transition-colors shrink-0">
        <Copy className="w-3.5 h-3.5" />
        Copy to my lists
      </SignInLink>
    );
  }

  async function submit() {
    if (!user || !name.trim() || submitting) return;
    setSubmitting(true);
    setError("");
    const token = await user.getIdToken();
    const res = await fetch(`/api/watchlist/${sourceId}/copy`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), description: description.trim() || null, isPrivate }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? `Failed to copy (${res.status})`);
      setSubmitting(false);
      return;
    }
    router.push(`/watchlist?list=${data.watchlist.id}`);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-[var(--foreground-muted)] hover:text-white border border-[var(--border)] hover:border-[var(--ratist-red)] rounded-full px-3 py-1.5 transition-colors shrink-0"
      >
        <Copy className="w-3.5 h-3.5" />
        Copy to my lists
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div
            className="bg-[var(--background)] border border-[var(--border)] rounded-xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <h2 className="text-base font-semibold text-white">Copy watchlist</h2>
              <button onClick={() => setOpen(false)} className="text-[var(--foreground-muted)] hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-[var(--foreground-muted)]">
                Creates a new watchlist on your account with the {unwatchedCount} unwatched title{unwatchedCount !== 1 ? "s" : ""} from this list.
              </p>
              <div>
                <label className="block text-sm font-medium text-[var(--foreground-muted)] mb-1.5">Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  className="w-full bg-[var(--surface)] border border-[var(--border)] text-sm text-white rounded-lg px-3 py-2 focus:outline-none focus:border-[var(--ratist-red)]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--foreground-muted)] mb-1.5">Description <span className="text-xs opacity-60">(optional)</span></label>
                <TextareaWithEmoji
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  maxLength={500}
                  className="w-full bg-[var(--surface)] border border-[var(--border)] text-sm text-white rounded-lg px-3 py-2 focus:outline-none focus:border-[var(--ratist-red)] resize-y placeholder:text-[var(--foreground-muted)]"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                  className="accent-[var(--ratist-red)] w-3.5 h-3.5"
                />
                <span className="text-sm text-[var(--foreground-muted)]">Make private</span>
              </label>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
                <button
                  onClick={() => setOpen(false)}
                  className="px-3 py-1.5 text-sm text-[var(--foreground-muted)] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={submit}
                  disabled={submitting || !name.trim()}
                  className="flex items-center gap-1.5 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold px-4 py-2 rounded-full transition-colors disabled:opacity-40"
                >
                  <Check className="w-3.5 h-3.5" />
                  {submitting ? "Copying..." : "Create copy"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
