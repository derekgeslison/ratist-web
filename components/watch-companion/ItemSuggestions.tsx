"use client";

import { useState } from "react";
import { MessageSquare, Flag, ThumbsUp, ThumbsDown, Loader2, Check, ChevronDown } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export interface SuggestionRow {
  id: string;
  action: "add" | "edit" | "remove";
  targetType: string;
  targetId: string | null;
  rationale: string | null;
  payload: Record<string, unknown> | null;
  upvoteScore: number;
  voteCount: number;
  createdAt: string;
  submitter: { id: string; name: string; avatarUrl: string | null };
}

interface Props {
  suggestions: SuggestionRow[];
  myVotes: Record<string, number>;
  mediaType: "movie" | "tv";
  onChanged: () => void;
  // Optional compact mode renders a smaller icon for use in tight rows.
  compact?: boolean;
}

/**
 * Per-item community-suggestion bubble. When any pending suggestions exist
 * for the attached item, shows a small message icon with a count. Tapping
 * expands an inline list where users vote up/down and can report.
 *
 * Voting hits the existing vote endpoint which auto-applies at the
 * community-approve threshold (no admin gate). Reports go through the
 * shared /api/reports endpoint under the "companion_suggestion" type.
 */
export default function ItemSuggestions({ suggestions, myVotes, mediaType, onChanged, compact = false }: Props) {
  const [open, setOpen] = useState(false);
  if (suggestions.length === 0) return null;
  const Icon = MessageSquare;
  const sizeCls = compact ? "w-3 h-3" : "w-3.5 h-3.5";
  return (
    <div className="inline-block relative">
      <button
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-[var(--ratist-red)]/10 border border-[var(--ratist-red)]/30 text-[var(--ratist-red)] hover:bg-[var(--ratist-red)]/20 transition-colors ${compact ? "text-[9px]" : "text-[10px]"} font-semibold`}
        aria-label={`${suggestions.length} community suggestion${suggestions.length === 1 ? "" : "s"}`}
      >
        <Icon className={sizeCls} />
        {suggestions.length}
        <ChevronDown className={`${compact ? "w-2.5 h-2.5" : "w-3 h-3"} transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-2 bg-[var(--surface-2)]/80 border border-[var(--ratist-red)]/30 rounded-lg p-2 space-y-2 text-left">
          {suggestions.map((s) => (
            <SuggestionRowDisplay
              key={s.id}
              suggestion={s}
              myVote={myVotes[s.id] ?? 0}
              mediaType={mediaType}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SuggestionRowDisplay({ suggestion, myVote, mediaType, onChanged }: {
  suggestion: SuggestionRow;
  myVote: number;
  mediaType: "movie" | "tv";
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const [voting, setVoting] = useState<null | 1 | -1 | 0>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reported, setReported] = useState(false);

  async function vote(next: 1 | -1) {
    if (!user) return;
    const target = myVote === next ? 0 : next;
    setVoting(target);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/watch-companion/suggestions/${suggestion.id}/vote`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ vote: target }),
      });
      if (res.ok) onChanged();
    } finally {
      setVoting(null);
    }
  }

  const payloadEntries = payloadToDisplay(suggestion.payload, mediaType);

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)]/60 rounded-lg p-2 space-y-1.5">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-[var(--ratist-red)] mb-1">
            {suggestion.action}{suggestion.action === "add" ? " (new)" : ""}
          </div>
          {payloadEntries.length > 0 && (
            <dl className="text-[11px] text-white grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 leading-tight">
              {payloadEntries.map(({ label, value }) => (
                <div key={label} className="contents">
                  <dt className="text-[9px] uppercase tracking-wider text-[var(--foreground-muted)] font-semibold mt-0.5">{label}</dt>
                  <dd className="break-words">{value}</dd>
                </div>
              ))}
            </dl>
          )}
          {suggestion.rationale && (
            <p className="text-[10px] text-[var(--foreground-muted)] italic mt-1 leading-snug">&ldquo;{suggestion.rationale}&rdquo;</p>
          )}
          <p className="text-[9px] text-[var(--foreground-muted)]/70 mt-1">by {suggestion.submitter.name}</p>
        </div>
        <div className="flex flex-col items-center gap-0.5 shrink-0">
          <button
            onClick={() => vote(1)}
            disabled={!user || voting !== null}
            className={`p-1 rounded transition-colors ${myVote === 1 ? "text-green-400" : "text-[var(--foreground-muted)] hover:text-green-400"} disabled:opacity-30`}
            aria-label="Upvote"
          >
            {voting === 1 ? <Loader2 className="w-3 h-3 animate-spin" /> : <ThumbsUp className="w-3 h-3" />}
          </button>
          <span className={`text-[11px] font-bold tabular-nums ${suggestion.upvoteScore > 0 ? "text-green-400" : suggestion.upvoteScore < 0 ? "text-red-400" : "text-[var(--foreground-muted)]"}`}>
            {suggestion.upvoteScore > 0 ? "+" : ""}{suggestion.upvoteScore}
          </span>
          <button
            onClick={() => vote(-1)}
            disabled={!user || voting !== null}
            className={`p-1 rounded transition-colors ${myVote === -1 ? "text-red-400" : "text-[var(--foreground-muted)] hover:text-red-400"} disabled:opacity-30`}
            aria-label="Downvote"
          >
            {voting === -1 ? <Loader2 className="w-3 h-3 animate-spin" /> : <ThumbsDown className="w-3 h-3" />}
          </button>
        </div>
      </div>
      <div className="flex items-center justify-end">
        {reported ? (
          <span className="text-[9px] text-green-400 inline-flex items-center gap-0.5"><Check className="w-2.5 h-2.5" /> Reported — thanks.</span>
        ) : reportOpen ? (
          <ReportForm suggestionId={suggestion.id} onSubmitted={() => { setReported(true); setReportOpen(false); }} onCancel={() => setReportOpen(false)} />
        ) : (
          <button
            onClick={() => setReportOpen(true)}
            className="text-[9px] text-[var(--foreground-muted)]/70 hover:text-red-400 inline-flex items-center gap-0.5"
            aria-label="Report this suggestion"
          >
            <Flag className="w-2.5 h-2.5" /> Report
          </button>
        )}
      </div>
    </div>
  );
}

function ReportForm({ suggestionId, onSubmitted, onCancel }: {
  suggestionId: string;
  onSubmitted: () => void;
  onCancel: () => void;
}) {
  const { user } = useAuth();
  const [reason, setReason] = useState<"spam" | "harassment" | "inappropriate" | "spoilers" | "other">("inappropriate");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!user) return;
    setBusy(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/reports`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ targetType: "companion_suggestion", targetId: suggestionId, reason, details: details || undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error ?? "Failed to submit report");
        setBusy(false);
        return;
      }
      onSubmitted();
    } catch {
      setError("Network error");
      setBusy(false);
    }
  }

  return (
    <div className="w-full space-y-1 mt-1 pt-1 border-t border-[var(--border)]/40">
      <div className="flex items-center gap-1">
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value as typeof reason)}
          className="text-[10px] bg-[var(--surface-2)] border border-[var(--border)] rounded px-1 py-0.5 text-white"
        >
          <option value="spam">Spam</option>
          <option value="harassment">Harassment</option>
          <option value="inappropriate">Inappropriate / offensive</option>
          <option value="spoilers">Spoilers</option>
          <option value="other">Other</option>
        </select>
        <input
          value={details}
          onChange={(e) => setDetails(e.target.value.slice(0, 200))}
          placeholder="Optional detail"
          className="flex-1 text-[10px] bg-[var(--surface-2)] border border-[var(--border)] rounded px-1 py-0.5 text-white"
        />
      </div>
      <div className="flex items-center justify-end gap-1">
        {error && <span className="text-[9px] text-red-400 mr-auto">{error}</span>}
        <button onClick={onCancel} className="text-[9px] text-[var(--foreground-muted)] px-1.5 py-0.5">Cancel</button>
        <button onClick={submit} disabled={busy} className="text-[9px] bg-red-500/20 border border-red-500/40 text-red-300 px-1.5 py-0.5 rounded font-semibold disabled:opacity-50">
          {busy ? "…" : "Submit"}
        </button>
      </div>
    </div>
  );
}

/**
 * Render the payload of a suggestion as a readable key/value list — skips
 * identifiers (characterIds, companionId, etc.) and pretty-prints
 * visibleAfter into MM:SS / SxEy format.
 */
function payloadToDisplay(payload: Record<string, unknown> | null, mediaType: "movie" | "tv"): Array<{ label: string; value: string }> {
  if (!payload) return [];
  const SKIP = new Set(["characterId", "companionId", "fromCharacterId", "toCharacterId", "seasonNumber", "freeText"]);
  const out: Array<{ label: string; value: string }> = [];
  for (const [key, value] of Object.entries(payload)) {
    if (SKIP.has(key)) continue;
    if (value === null || value === undefined || value === "") continue;
    if (key === "visibleAfter") {
      const va = (value ?? {}) as { seconds?: number; season?: number; episode?: number };
      if (mediaType === "movie" && typeof va.seconds === "number") {
        const m = Math.floor(va.seconds / 60);
        const sec = va.seconds % 60;
        out.push({ label: "at", value: `${m}:${String(sec).padStart(2, "0")}` });
      } else if (mediaType === "tv" && (typeof va.season === "number" || typeof va.episode === "number")) {
        out.push({ label: "at", value: `S${va.season ?? "?"}E${va.episode ?? "?"}${typeof va.seconds === "number" && va.seconds > 0 ? ` @ ${Math.floor(va.seconds / 60)}:${String(va.seconds % 60).padStart(2, "0")}` : ""}` });
      }
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      out.push({ label: key, value: value.map((v) => typeof v === "string" ? v : JSON.stringify(v)).join(", ") });
      continue;
    }
    if (typeof value === "object") {
      try { out.push({ label: key, value: JSON.stringify(value) }); } catch { /* skip */ }
      continue;
    }
    out.push({ label: key, value: String(value) });
  }
  return out;
}
