"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Pencil, X, AlertCircle } from "lucide-react";

// Types mirror the server's accepted list
const TARGET_TYPES = [
  { value: "character", label: "A character" },
  { value: "fact", label: "A fact about a character" },
  { value: "relationship", label: "A relationship" },
  { value: "timeline", label: "A plot timeline event" },
  { value: "glossary", label: "A glossary term" },
  { value: "baseDescription", label: "A character's description" },
] as const;

interface Props {
  companionId: string;
  defaultTargetType?: string;
  label?: string;
  compact?: boolean;
  /** TV season context — auto-tagged on every "add" suggestion so new
   *  items land on the right season when the admin approves. Movies pass
   *  null / omit. */
  season?: number | null;
}

export default function SuggestEditButton({ companionId, defaultTargetType = "character", label, compact = false, season = null }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [targetType, setTargetType] = useState<string>(defaultTargetType);
  const [action, setAction] = useState<"add" | "edit" | "remove">("add");
  const [rationale, setRationale] = useState("");
  const [payloadText, setPayloadText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function submit() {
    if (!user) { setError("Sign in to suggest an edit."); return; }
    if (!rationale.trim()) { setError("Please explain what you're suggesting."); return; }
    setSending(true);
    setError("");
    try {
      const token = await user.getIdToken();
      // Payload is free-form for now; admins see rationale + payload in the
      // review queue. V2 will have structured forms per targetType.
      let payload: Record<string, unknown> = {};
      if (payloadText.trim()) {
        try {
          payload = JSON.parse(payloadText) as Record<string, unknown>;
        } catch {
          payload = { freeText: payloadText };
        }
      }
      // Auto-tag season context on "add" suggestions so the applied item
      // lands in the right season bucket. User's payload wins if they set
      // it themselves. Omitted on edit/remove — admin should keep the
      // existing row's season unless they explicitly change it.
      if (action === "add" && season != null && !("seasonNumber" in payload)) {
        payload.seasonNumber = season;
      }
      const res = await fetch(`/api/watch-companion/${companionId}/suggestions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action, targetType, rationale, payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Submission failed (${res.status})`);
        setSending(false);
        return;
      }
      setSuccess(true);
      setRationale("");
      setPayloadText("");
      setTimeout(() => { setSuccess(false); setOpen(false); }, 1500);
    } catch {
      setError("Network error — please try again.");
    }
    setSending(false);
  }

  if (!user) {
    return (
      <div className="text-center">
        <p className="text-xs text-[var(--foreground-muted)]">Sign in to suggest a correction.</p>
      </div>
    );
  }

  return (
    <div>
      {!open ? (
        compact ? (
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-1 text-[10px] text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] transition-colors"
          >
            <Pencil className="w-3 h-3" /> {label ?? "Suggest edit"}
          </button>
        ) : (
          <button
            onClick={() => setOpen(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white hover:border-[var(--ratist-red)] rounded-lg text-sm font-semibold transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" /> {label ?? "Suggest a correction"}
          </button>
        )
      ) : (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Suggest an edit</h3>
            <button onClick={() => setOpen(false)} aria-label="Close">
              <X className="w-4 h-4 text-[var(--foreground-muted)] hover:text-white" />
            </button>
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider mb-1 block">What are you suggesting?</label>
            <div className="flex gap-2 mb-2">
              {(["add", "edit", "remove"] as const).map((a) => (
                <button
                  key={a}
                  onClick={() => setAction(a)}
                  className={`px-3 py-1 text-xs rounded-lg border transition-colors ${
                    action === a
                      ? "border-[var(--ratist-red)] bg-[var(--ratist-red)]/10 text-white"
                      : "border-[var(--border)] text-[var(--foreground-muted)]"
                  }`}
                >
                  {a === "add" ? "Add" : a === "edit" ? "Correct" : "Remove"}
                </button>
              ))}
            </div>
            <select
              value={targetType}
              onChange={(e) => setTargetType(e.target.value)}
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)]"
            >
              {TARGET_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider mb-1 block">Describe the change</label>
            <textarea
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              rows={3}
              placeholder="e.g. The CFO isn't Karl — it's Gerri from S2 onward."
              maxLength={1000}
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] resize-y"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider mb-1 block">Additional details (optional)</label>
            <textarea
              value={payloadText}
              onChange={(e) => setPayloadText(e.target.value)}
              rows={2}
              placeholder="Any specifics the admin or community should see"
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] resize-y"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/5 border border-red-500/20 rounded-lg p-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <p className="text-xs text-green-400">Submitted — thanks! Your suggestion is now visible to the community for voting.</p>
          )}

          <button
            onClick={submit}
            disabled={sending || !rationale.trim()}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-[var(--ratist-red)] text-white rounded-lg text-sm font-semibold hover:bg-[var(--ratist-red)]/80 transition-colors disabled:opacity-50"
          >
            {sending ? "Submitting…" : "Submit suggestion"}
          </button>
        </div>
      )}
    </div>
  );
}
