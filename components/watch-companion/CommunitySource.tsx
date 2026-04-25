"use client";

import { useEffect, useRef, useState } from "react";
import { Users, Check, Flag, Loader2, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { usePopoverPosition } from "@/hooks/usePopoverPosition";
import { payloadToDisplay } from "./ItemSuggestions";

interface ApprovedSuggestion {
  id: string;
  action: "add" | "edit" | "remove";
  targetType: string;
  targetId: string | null;
  payload: Record<string, unknown> | null;
  rationale: string | null;
  resolvedAt: string | null;
  submitter: { id: string; name: string; avatarUrl: string | null };
}

interface Props {
  companionId: string;
  targetType: "character" | "fact" | "relationship" | "timeline" | "glossary" | "baseDescription";
  itemId: string;
  mediaType: "movie" | "tv";
  compact?: boolean;
}

/**
 * Clickable green "community-sourced" badge. On tap, lazy-fetches the
 * approved suggestion(s) that produced this item and shows them in a
 * popover so the viewer can see who submitted it, what changed, and
 * report it if the content is inaccurate / spoiler-leaking / explicit.
 *
 * Replaces the static CommunityBadge — the styling is identical so
 * existing layouts don't shift, but the element is now a button and
 * has the report flow attached. Reports go through the shared
 * /api/reports endpoint with targetType="companion_suggestion", which
 * surfaces them in the existing admin Reports queue alongside other
 * site-wide reports.
 */
export default function CommunitySource({ companionId, targetType, itemId, mediaType, compact = false }: Props) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverStyle = usePopoverPosition(buttonRef, open);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<ApprovedSuggestion[] | null>(null);
  const [fetchError, setFetchError] = useState("");

  // Fetch on first open, cache thereafter. Closing + reopening doesn't
  // refetch — approved suggestions don't change while the user is
  // looking at them.
  useEffect(() => {
    if (!open || suggestions !== null || loading) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setFetchError("");
      try {
        const url = `/api/watch-companion/${companionId}/community-source?targetType=${encodeURIComponent(targetType)}&itemId=${encodeURIComponent(itemId)}`;
        const res = await fetch(url);
        if (!res.ok) {
          if (!cancelled) setFetchError("Couldn't load suggestion details.");
          return;
        }
        const data = (await res.json()) as { suggestions: ApprovedSuggestion[] };
        if (!cancelled) setSuggestions(data.suggestions ?? []);
      } catch {
        if (!cancelled) setFetchError("Network error.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, suggestions, loading, companionId, targetType, itemId]);

  return (
    <div className="inline-block">
      <button
        ref={buttonRef}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className={`inline-flex items-center gap-0.5 ${compact ? "text-[9px]" : "text-[10px]"} px-1.5 py-0.5 rounded-full bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 transition-colors cursor-pointer`}
        aria-label="Community-sourced — tap to see what was changed and report if needed"
      >
        <Users className={compact ? "w-2.5 h-2.5" : "w-3 h-3"} />
        <Check className={compact ? "w-2 h-2 -ml-0.5" : "w-2.5 h-2.5 -ml-0.5"} />
      </button>
      {open && popoverStyle && (
        <div
          style={popoverStyle}
          className="z-30 bg-[var(--surface)] border border-green-500/30 rounded-lg p-3 space-y-2 text-left shadow-xl break-words"
        >
          <div className="flex items-center justify-between gap-2 pb-1 border-b border-[var(--border)]/40">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-green-400 inline-flex items-center gap-1">
              <Users className="w-3 h-3" /> Community-sourced
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); }}
              className="text-[var(--foreground-muted)] hover:text-white"
              aria-label="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {loading && (
            <div className="flex items-center gap-2 text-[11px] text-[var(--foreground-muted)] py-2">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading...
            </div>
          )}
          {fetchError && !loading && (
            <p className="text-[11px] text-red-400">{fetchError}</p>
          )}
          {!loading && !fetchError && suggestions !== null && suggestions.length === 0 && (
            <p className="text-[11px] text-[var(--foreground-muted)]">No approved suggestion records found for this item.</p>
          )}
          {!loading && suggestions && suggestions.length > 0 && suggestions.map((s) => (
            <ApprovedSuggestionDisplay key={s.id} suggestion={s} mediaType={mediaType} />
          ))}
        </div>
      )}
    </div>
  );
}

function ApprovedSuggestionDisplay({ suggestion, mediaType }: { suggestion: ApprovedSuggestion; mediaType: "movie" | "tv" }) {
  const [reportOpen, setReportOpen] = useState(false);
  const [reported, setReported] = useState(false);
  const payloadEntries = payloadToDisplay(suggestion.payload, mediaType);
  const dateStr = suggestion.resolvedAt
    ? new Date(suggestion.resolvedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)]/60 rounded-lg p-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-green-400">
          {suggestion.action === "add" ? "Added" : suggestion.action === "edit" ? "Edited" : "Removed"}
        </span>
        {dateStr && (
          <span className="text-[9px] text-[var(--foreground-muted)]">{dateStr}</span>
        )}
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
        <p className="text-[10px] text-[var(--foreground-muted)] italic leading-snug">&ldquo;{suggestion.rationale}&rdquo;</p>
      )}
      <p className="text-[9px] text-[var(--foreground-muted)]/70">by {suggestion.submitter.name}</p>
      <div className="flex items-center justify-end pt-1 border-t border-[var(--border)]/40">
        {reported ? (
          <span className="text-[9px] text-green-400 inline-flex items-center gap-0.5"><Check className="w-2.5 h-2.5" /> Reported — thanks.</span>
        ) : reportOpen ? (
          <ReportForm
            suggestionId={suggestion.id}
            onSubmitted={() => { setReported(true); setReportOpen(false); }}
            onCancel={() => setReportOpen(false)}
          />
        ) : (
          <button
            onClick={() => setReportOpen(true)}
            className="text-[10px] text-[var(--foreground-muted)]/80 hover:text-red-400 inline-flex items-center gap-1"
            aria-label="Report this approved suggestion"
          >
            <Flag className="w-3 h-3" /> Report inaccurate / inappropriate
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
    if (!user) {
      setError("Sign in to report.");
      return;
    }
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
    <div className="w-full space-y-1 mt-1">
      <div className="flex items-center gap-1">
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value as typeof reason)}
          className="text-[10px] bg-[var(--surface-2)] border border-[var(--border)] rounded px-1 py-0.5 text-white"
        >
          <option value="inappropriate">Inaccurate / inappropriate</option>
          <option value="spoilers">Reveals spoilers</option>
          <option value="spam">Spam</option>
          <option value="harassment">Harassment</option>
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
