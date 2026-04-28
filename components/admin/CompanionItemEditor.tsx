"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { X, Check, Loader2, Search } from "lucide-react";

export type EditorType = "character" | "fact" | "relationship" | "timeline" | "glossary";

// Accept nullable numbers so we can take data straight from viewer/admin
// DB payloads (Prisma Json fields often surface nulls for missing keys).
// The editor normalizes to clean optionals on submit.
interface VisibleAfter { seconds?: number | null; season?: number | null; episode?: number | null }

interface CharacterDraft {
  name: string;
  baseDescription: string;
  group: string;
  // Actor link is optional. Suggesters pick from a TMDB search; the selected
  // person's id is the source of truth (drives the celebrity-page deep
  // link), with the name copied alongside so we can render the card before
  // an admin loads the people-table row.
  actorName: string;
  actorTmdbId: number | null;
  // Admin-only position control. The cast tab renders characters by
  // sortOrder asc, so lowering this value moves the card earlier in the
  // list and raising it pushes the card later. Not exposed in the
  // community suggest form — ordering is a moderator call.
  sortOrder: number;
  visibleAfter: VisibleAfter;
}
interface FactDraft {
  fact: string;
  factType: string;
  visibleAfter: VisibleAfter;
}
interface RelationshipDraft {
  label: string;
  relationshipType: string;
  directed: boolean;
  fromCharacterId: string;
  toCharacterId: string;
  visibleAfter: VisibleAfter;
}
interface TimelineDraft {
  description: string;
  importance: number;
  characterIds: string[];
  visibleAfter: VisibleAfter;
}
interface GlossaryDraft {
  term: string;
  definition: string;
  category: string;
  visibleAfter: VisibleAfter;
}

export type EditorDraft =
  | { type: "character"; id: string; data: CharacterDraft }
  | { type: "fact"; id: string | null; characterId: string; data: FactDraft }
  | { type: "relationship"; id: string | null; companionId: string; data: RelationshipDraft; seasonNumber: number | null }
  | { type: "timeline"; id: string | null; companionId: string; data: TimelineDraft; seasonNumber: number | null }
  | { type: "glossary"; id: string | null; companionId: string; data: GlossaryDraft; seasonNumber: number | null };

/**
 * Turn an EditorDraft into the { action, targetType, targetId, payload }
 * shape the community-suggestion endpoint expects. Null id = "add" action;
 * otherwise "edit". Payload carries all the editable fields in a plain
 * object so applySuggestion() can pick them up.
 */
function draftToSuggestion(draft: EditorDraft): {
  action: "add" | "edit";
  targetType: string;
  targetId: string | null;
  payload: Record<string, unknown>;
} {
  const action: "add" | "edit" = draft.id ? "edit" : "add";
  switch (draft.type) {
    case "character":
      return {
        action,
        targetType: "character",
        targetId: draft.id,
        payload: {
          name: draft.data.name,
          baseDescription: draft.data.baseDescription,
          group: draft.data.group.length > 0 ? draft.data.group : null,
          // Only include actor fields when the suggester actually picked one
          // (or the row already had one). Sending empty / null on edit would
          // wipe the existing link, since editTarget reads any present
          // actorName key as authoritative.
          ...(draft.data.actorName.length > 0
            ? { actorName: draft.data.actorName, actorTmdbId: draft.data.actorTmdbId }
            : {}),
          visibleAfter: draft.data.visibleAfter,
        },
      };
    case "fact":
      return {
        action,
        targetType: "fact",
        targetId: draft.id,
        payload: {
          characterId: draft.characterId,
          fact: draft.data.fact,
          factType: draft.data.factType,
          visibleAfter: draft.data.visibleAfter,
        },
      };
    case "relationship":
      return {
        action,
        targetType: "relationship",
        targetId: draft.id,
        payload: {
          fromCharacterId: draft.data.fromCharacterId,
          toCharacterId: draft.data.toCharacterId,
          label: draft.data.label,
          relationshipType: draft.data.relationshipType,
          directed: draft.data.directed,
          seasonNumber: draft.seasonNumber,
          visibleAfter: draft.data.visibleAfter,
        },
      };
    case "timeline":
      return {
        action,
        targetType: "timeline",
        targetId: draft.id,
        payload: {
          description: draft.data.description,
          importance: draft.data.importance,
          characterIds: draft.data.characterIds,
          seasonNumber: draft.seasonNumber,
          visibleAfter: draft.data.visibleAfter,
        },
      };
    case "glossary":
      return {
        action,
        targetType: "glossary",
        targetId: draft.id,
        payload: {
          term: draft.data.term,
          definition: draft.data.definition,
          category: draft.data.category.length > 0 ? draft.data.category : null,
          seasonNumber: draft.seasonNumber,
          visibleAfter: draft.data.visibleAfter,
        },
      };
  }
}

interface Props {
  open: boolean;
  draft: EditorDraft | null;
  mediaType: "movie" | "tv";
  characters: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: () => void;
  getToken: () => Promise<string>;
  /**
   * "direct" (default): admin-only; writes through to the live data via the
   * /api/admin/watch-companion/item/* endpoints.
   * "suggest": public user flow; POSTs to
   * /api/watch-companion/:companionId/suggestions so an admin can review
   * before applying. The editor adds a required rationale field in this
   * mode.
   */
  mode?: "direct" | "suggest";
  /** Required when mode === "suggest" — used to compose the suggestions URL. */
  companionId?: string;
}

const FACT_TYPES = ["role_change", "relationship_change", "arc", "death", "reveal", "other"];
const REL_TYPES = ["family", "romantic", "business", "rivalry", "alliance", "mentor", "other"];
// Keep in lockstep with lib/ai/watch-companion-chunks/shared.ts.
const GLOSSARY_CATEGORIES = ["world", "faction", "place", "object", "event", "jargon", "concept"];

/**
 * All-purpose create/edit modal for a Watch Companion item. Dispatches on
 * draft.type for which fields to render, and on draft.id for whether to
 * POST (create) or PATCH (edit). Never renders without a draft.
 */
export default function CompanionItemEditor({ open, draft, mediaType, characters, onClose, onSaved, getToken, mode = "direct", companionId }: Props) {
  const [working, setWorking] = useState<EditorDraft | null>(draft);
  const [rationale, setRationale] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Tracks whether a mousedown originated on the backdrop itself. Without
  // this, text-selecting inside the modal whose mouseup drifts onto the
  // backdrop fires `click` on the overlay (common ancestor) and closes
  // the modal mid-drag.
  const mouseDownOnBackdrop = useRef(false);

  // Reset working state whenever the caller hands us a new draft.
  useEffect(() => {
    setWorking(draft);
    setRationale("");
    setError("");
  }, [draft]);

  if (!open || !working) return null;

  async function save() {
    if (!working) return;
    // Rationale is optional in suggest mode — users can just tweak the
    // fields and hit save.
    setSaving(true);
    setError("");
    // 20s timeout so the spinner can never hang forever on a stalled
    // request. If we hit the timeout, the fetch rejects and the catch
    // block below surfaces the error.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20_000);
    try {
      const token = await getToken();

      // SUGGEST MODE: route everything through the suggestion endpoint so an
      // admin can review. Build { action, targetType, targetId, payload }
      // from the draft and post once.
      if (mode === "suggest") {
        if (!companionId) { setError("Missing companionId."); setSaving(false); return; }
        const { action, targetType, targetId, payload } = draftToSuggestion(working);
        const res = await fetch(`/api/watch-companion/${companionId}/suggestions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ action, targetType, targetId, rationale: rationale.trim(), payload }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setError(err.error ?? `Submission failed (${res.status})`);
          return;
        }
        onSaved();
        onClose();
        return;
      }

      // DIRECT MODE (original admin flow): PATCH / POST per item type.
      // Body assembly + endpoint selection dispatch on the draft shape.
      let endpoint = "";
      let method: "POST" | "PATCH" = "PATCH";
      let body: Record<string, unknown> = {};
      switch (working.type) {
        case "character":
          endpoint = `/api/admin/watch-companion/item/character/${working.id}`;
          method = "PATCH";
          body = {
            name: working.data.name,
            baseDescription: working.data.baseDescription,
            group: working.data.group.length > 0 ? working.data.group : null,
            // Same omission rule as the suggest path — only push actor
            // fields when one is actually picked, so a blank field doesn't
            // clear an existing link.
            ...(working.data.actorName.length > 0
              ? { actorName: working.data.actorName, actorTmdbId: working.data.actorTmdbId }
              : {}),
            sortOrder: working.data.sortOrder,
            visibleAfter: working.data.visibleAfter,
          };
          break;
        case "fact":
          endpoint = working.id
            ? `/api/admin/watch-companion/item/fact/${working.id}`
            : `/api/admin/watch-companion/item/fact`;
          method = working.id ? "PATCH" : "POST";
          body = {
            characterId: working.characterId,
            fact: working.data.fact,
            factType: working.data.factType,
            visibleAfter: working.data.visibleAfter,
          };
          break;
        case "relationship":
          endpoint = working.id
            ? `/api/admin/watch-companion/item/relationship/${working.id}`
            : `/api/admin/watch-companion/item/relationship`;
          method = working.id ? "PATCH" : "POST";
          body = {
            companionId: working.companionId,
            fromCharacterId: working.data.fromCharacterId,
            toCharacterId: working.data.toCharacterId,
            label: working.data.label,
            relationshipType: working.data.relationshipType,
            directed: working.data.directed,
            seasonNumber: working.seasonNumber,
            visibleAfter: working.data.visibleAfter,
          };
          break;
        case "timeline":
          endpoint = working.id
            ? `/api/admin/watch-companion/item/timeline/${working.id}`
            : `/api/admin/watch-companion/item/timeline`;
          method = working.id ? "PATCH" : "POST";
          body = {
            companionId: working.companionId,
            description: working.data.description,
            importance: working.data.importance,
            characterIds: working.data.characterIds,
            seasonNumber: working.seasonNumber,
            visibleAfter: working.data.visibleAfter,
          };
          break;
        case "glossary":
          endpoint = working.id
            ? `/api/admin/watch-companion/item/glossary/${working.id}`
            : `/api/admin/watch-companion/item/glossary`;
          method = working.id ? "PATCH" : "POST";
          body = {
            companionId: working.companionId,
            term: working.data.term,
            definition: working.data.definition,
            category: working.data.category.length > 0 ? working.data.category : null,
            seasonNumber: working.seasonNumber,
            visibleAfter: working.data.visibleAfter,
          };
          break;
      }
      const res = await fetch(endpoint, {
        method,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error ?? `Save failed (${res.status})`);
        return;
      }
      onSaved();
      onClose();
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setError("Request timed out. Check your connection and try again.");
      } else {
        setError(err instanceof Error ? err.message : "Network error");
      }
    } finally {
      // Always clear the timeout + spinner. Without this, any unexpected
      // throw / early return would leave saving=true and the button would
      // spin forever.
      clearTimeout(timeoutId);
      setSaving(false);
    }
  }

  const titlePrefix = mode === "suggest" ? "Suggest " : "";
  const title = working.type === "character" ? `${titlePrefix}Edit character`
    : working.type === "fact" ? (working.id ? `${titlePrefix}Edit event` : `${titlePrefix}New event`)
    : working.type === "relationship" ? (working.id ? `${titlePrefix}Edit relationship` : `${titlePrefix}New relationship`)
    : working.type === "timeline" ? (working.id ? `${titlePrefix}Edit timeline event` : `${titlePrefix}New timeline event`)
    : (working.id ? `${titlePrefix}Edit glossary term` : `${titlePrefix}New glossary term`);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => {
        // Remember if the press started on the backdrop itself — only then
        // does a subsequent mouseup on the backdrop count as an
        // "outside-click" dismiss. A press that begins inside the modal
        // (e.g. selecting text) and drifts onto the backdrop won't close.
        mouseDownOnBackdrop.current = e.target === e.currentTarget;
      }}
      onMouseUp={(e) => {
        if (mouseDownOnBackdrop.current && e.target === e.currentTarget) {
          onClose();
        }
        mouseDownOnBackdrop.current = false;
      }}
    >
      <div className="w-full max-w-xl bg-[var(--background)] border border-[var(--border)] rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)] sticky top-0 bg-[var(--background)]">
          <h3 className="text-base font-semibold text-white">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-full bg-[var(--surface-2)] border border-[var(--border)] text-white hover:text-[var(--ratist-red)] hover:border-[var(--ratist-red)]/50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          {mode === "suggest" && (
            <div className="bg-[var(--ratist-red)]/5 border border-[var(--ratist-red)]/30 rounded-lg p-3 space-y-2">
              <p className="text-[11px] uppercase tracking-wider text-[var(--ratist-red)] font-semibold">Community suggestion</p>
              <p className="text-xs text-[var(--foreground-muted)] leading-relaxed">
                Make your changes below. Once enough people vote it up, it goes live automatically.
              </p>
              <textarea
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                rows={2}
                placeholder="Optional — a quick note explaining the change (e.g. “Gerri takes over as CFO in S2E1”)."
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)]/50 focus:outline-none focus:border-[var(--ratist-red)] resize-y"
                maxLength={1000}
              />
            </div>
          )}
          {working.type === "character" && (
            <CharacterFields
              data={working.data}
              mediaType={mediaType}
              mode={mode}
              onChange={(next) => setWorking({ ...working, data: next })}
            />
          )}
          {working.type === "fact" && (
            <FactFields
              data={working.data}
              mediaType={mediaType}
              onChange={(next) => setWorking({ ...working, data: next })}
            />
          )}
          {working.type === "relationship" && (
            <RelationshipFields
              data={working.data}
              mediaType={mediaType}
              characters={characters}
              onChange={(next) => setWorking({ ...working, data: next })}
            />
          )}
          {working.type === "timeline" && (
            <TimelineFields
              data={working.data}
              mediaType={mediaType}
              characters={characters}
              onChange={(next) => setWorking({ ...working, data: next })}
            />
          )}
          {working.type === "glossary" && (
            <GlossaryFields
              data={working.data}
              mediaType={mediaType}
              onChange={(next) => setWorking({ ...working, data: next })}
            />
          )}
          {error && (
            <p className="text-sm text-red-400 bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 p-4 border-t border-[var(--border)] bg-[var(--background)] sticky bottom-0">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-[var(--foreground-muted)] hover:text-white">Cancel</button>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-[var(--ratist-red)] text-white rounded-lg text-sm font-semibold hover:bg-[var(--ratist-red)]/80 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Field blocks per type ───────────────────────────────────────────────

function VisibleAfterInput({ value, mediaType, onChange }: {
  value: VisibleAfter;
  mediaType: "movie" | "tv";
  onChange: (next: VisibleAfter) => void;
}) {
  // Inline H:MM:SS time picker shared between movie and TV branches —
  // splits seconds into 3 number inputs (hours, minutes, seconds) so
  // the user types each unit directly. Was MM:SS-only for movies and
  // a raw seconds box ("sec into ep") for TV; raw seconds is unusable
  // for any episode past the 100s mark.
  function HMSInputs({ totalSeconds, onChange: setSeconds }: { totalSeconds: number; onChange: (n: number) => void }) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    const cls = "w-16 bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)]";
    return (
      <div className="flex items-center gap-1">
        <input
          type="number" min={0} value={hours}
          onChange={(e) => setSeconds((parseInt(e.target.value, 10) || 0) * 3600 + minutes * 60 + secs)}
          className={cls}
          aria-label="hours"
        />
        <span className="text-[var(--foreground-muted)]">:</span>
        <input
          type="number" min={0} max={59} value={minutes}
          onChange={(e) => setSeconds(hours * 3600 + (parseInt(e.target.value, 10) || 0) * 60 + secs)}
          className={cls}
          aria-label="minutes"
        />
        <span className="text-[var(--foreground-muted)]">:</span>
        <input
          type="number" min={0} max={59} value={secs}
          onChange={(e) => setSeconds(hours * 3600 + minutes * 60 + (parseInt(e.target.value, 10) || 0))}
          className={cls}
          aria-label="seconds"
        />
      </div>
    );
  }

  if (mediaType === "movie") {
    return (
      <div>
        <label className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider font-semibold mb-1 block">Visible after (H:MM:SS)</label>
        <HMSInputs totalSeconds={value.seconds ?? 0} onChange={(n) => onChange({ ...value, seconds: n })} />
      </div>
    );
  }
  return (
    <div>
      <label className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider font-semibold mb-1 block">Visible after</label>
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-xs text-[var(--foreground-muted)]">S</label>
        <input
          type="number"
          min={1}
          value={value.season ?? ""}
          placeholder="1"
          onChange={(e) => onChange({ ...value, season: parseInt(e.target.value, 10) || undefined })}
          className="w-16 bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)]"
        />
        <label className="text-xs text-[var(--foreground-muted)]">E</label>
        <input
          type="number"
          min={1}
          value={value.episode ?? ""}
          placeholder="1"
          onChange={(e) => onChange({ ...value, episode: parseInt(e.target.value, 10) || undefined })}
          className="w-16 bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)]"
        />
        <label className="text-xs text-[var(--foreground-muted)]">into ep (H:MM:SS)</label>
        <HMSInputs totalSeconds={value.seconds ?? 0} onChange={(n) => onChange({ ...value, seconds: n || undefined })} />
      </div>
    </div>
  );
}

function LabelledInput({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div>
      <label className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider font-semibold mb-1 block">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)]/50 focus:outline-none focus:border-[var(--ratist-red)]"
      />
    </div>
  );
}

function LabelledTextarea({ label, value, onChange, rows = 3 }: {
  label: string; value: string; onChange: (v: string) => void; rows?: number;
}) {
  return (
    <div>
      <label className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider font-semibold mb-1 block">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)] resize-y"
      />
    </div>
  );
}

function LabelledSelect({ label, value, onChange, options, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]; placeholder?: string;
}) {
  return (
    <div>
      <label className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider font-semibold mb-1 block">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)]"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    </div>
  );
}

function CharacterFields({ data, mediaType, mode, onChange }: { data: CharacterDraft; mediaType: "movie" | "tv"; mode: "direct" | "suggest"; onChange: (d: CharacterDraft) => void }) {
  return (
    <>
      <LabelledInput label="Name" value={data.name} onChange={(v) => onChange({ ...data, name: v })} />
      <LabelledTextarea label="Base description" value={data.baseDescription} onChange={(v) => onChange({ ...data, baseDescription: v })} rows={3} />
      <LabelledInput label="Faction / group" value={data.group} onChange={(v) => onChange({ ...data, group: v })} placeholder="(none)" />
      <ActorPicker
        actorName={data.actorName}
        actorTmdbId={data.actorTmdbId}
        onChange={(actorName, actorTmdbId) => onChange({ ...data, actorName, actorTmdbId })}
      />
      {/* Admin-only: the cast tab renders sortOrder asc, so smaller numbers
          come first. Lets moderators reshuffle after a community character
          is approved and lands at the end (or swap a lead upward if the
          generator got the order wrong). */}
      {mode === "direct" && (
        <div>
          <label className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider font-semibold mb-1 block">
            Sort order <span className="opacity-60 normal-case tracking-normal">(lower = earlier in cast list)</span>
          </label>
          <input
            type="number"
            value={data.sortOrder}
            onChange={(e) => onChange({ ...data, sortOrder: parseInt(e.target.value, 10) || 0 })}
            className="w-24 bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)]"
          />
        </div>
      )}
      <VisibleAfterInput value={data.visibleAfter} mediaType={mediaType} onChange={(v) => onChange({ ...data, visibleAfter: v })} />
    </>
  );
}

// Single-actor TMDB typeahead. Hits /api/tmdb/person (same endpoint the
// blog person-linker uses), sorted by TMDB relevance — most-relevant
// first. Optional: leaving the picker empty submits a character with no
// actor link, which is fine for cameo/voice/unknown roles.
function ActorPicker({ actorName, actorTmdbId, onChange }: {
  actorName: string;
  actorTmdbId: number | null;
  onChange: (actorName: string, actorTmdbId: number | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ id: number; name: string; profilePath: string | null }>>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    try {
      const res = await fetch(`/api/tmdb/person?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults((data.results ?? []).slice(0, 8));
    } catch {
      setResults([]);
    }
  }, []);

  function handleInput(q: string) {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(q), 300);
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setShowDropdown(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selected = actorName.length > 0;
  return (
    <div ref={containerRef} className="relative">
      <label className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider font-semibold mb-1 block">
        Actor / actress <span className="opacity-60 normal-case tracking-normal">(optional)</span>
      </label>
      {selected ? (
        <div className="flex items-center gap-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2">
          <div className="w-7 h-7 rounded-full bg-[var(--surface)] flex items-center justify-center text-[10px] font-bold text-white shrink-0">
            {actorName[0]?.toUpperCase() ?? "?"}
          </div>
          <span className="text-sm text-white flex-1 truncate">{actorName}</span>
          <button
            type="button"
            onClick={() => onChange("", null)}
            className="text-[var(--foreground-muted)] hover:text-white"
            aria-label="Clear actor"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)]" />
          <input
            type="text"
            value={query}
            onChange={(e) => { handleInput(e.target.value); setShowDropdown(true); }}
            onFocus={() => results.length > 0 && setShowDropdown(true)}
            placeholder="Search actors or actresses…"
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)]/50 focus:outline-none focus:border-[var(--ratist-red)]"
          />
        </div>
      )}
      {!selected && showDropdown && results.length > 0 && (
        <div className="absolute z-30 w-full mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { onChange(p.name, p.id); setQuery(""); setResults([]); setShowDropdown(false); }}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-left hover:bg-[var(--surface-2)] transition-colors"
            >
              {p.profilePath ? (
                <div className="relative w-7 h-7 rounded-full overflow-hidden shrink-0">
                  <Image src={`https://image.tmdb.org/t/p/w45${p.profilePath}`} alt="" fill sizes="28px" className="object-cover" />
                </div>
              ) : (
                <div className="w-7 h-7 rounded-full bg-[var(--surface-2)] flex items-center justify-center text-[10px] font-bold text-white shrink-0">{p.name[0]}</div>
              )}
              <span className="text-sm text-white">{p.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FactFields({ data, mediaType, onChange }: { data: FactDraft; mediaType: "movie" | "tv"; onChange: (d: FactDraft) => void }) {
  return (
    <>
      <LabelledTextarea label="Event description" value={data.fact} onChange={(v) => onChange({ ...data, fact: v })} rows={2} />
      <LabelledSelect label="Event type" value={data.factType} onChange={(v) => onChange({ ...data, factType: v })} options={FACT_TYPES} />
      <VisibleAfterInput value={data.visibleAfter} mediaType={mediaType} onChange={(v) => onChange({ ...data, visibleAfter: v })} />
    </>
  );
}

function RelationshipFields({ data, mediaType, characters, onChange }: {
  data: RelationshipDraft; mediaType: "movie" | "tv";
  characters: Array<{ id: string; name: string }>;
  onChange: (d: RelationshipDraft) => void;
}) {
  return (
    <>
      <div>
        <label className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider font-semibold mb-1 block">From character</label>
        <select
          value={data.fromCharacterId}
          onChange={(e) => onChange({ ...data, fromCharacterId: e.target.value })}
          className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)]"
        >
          <option value="">Select character…</option>
          {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider font-semibold mb-1 block">To character</label>
        <select
          value={data.toCharacterId}
          onChange={(e) => onChange({ ...data, toCharacterId: e.target.value })}
          className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)]"
        >
          <option value="">Select character…</option>
          {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <LabelledInput label="Label" value={data.label} onChange={(v) => onChange({ ...data, label: v })} placeholder="e.g. parent of" />
      <LabelledSelect label="Relationship type" value={data.relationshipType} onChange={(v) => onChange({ ...data, relationshipType: v })} options={REL_TYPES} />
      <label className="flex items-center gap-2 text-sm text-white">
        <input
          type="checkbox"
          checked={data.directed}
          onChange={(e) => onChange({ ...data, directed: e.target.checked })}
          className="accent-[var(--ratist-red)]"
        />
        Directed (label reads "from → to"; uncheck for symmetric — siblings, spouses, allies).
      </label>
      <VisibleAfterInput value={data.visibleAfter} mediaType={mediaType} onChange={(v) => onChange({ ...data, visibleAfter: v })} />
    </>
  );
}

function TimelineFields({ data, mediaType, characters, onChange }: {
  data: TimelineDraft; mediaType: "movie" | "tv";
  characters: Array<{ id: string; name: string }>;
  onChange: (d: TimelineDraft) => void;
}) {
  const descRef = useRef<HTMLTextAreaElement>(null);

  // Insert ((Character Name)) at the textarea's current cursor position
  // and bump the character into characterIds if it isn't already tagged.
  // Falls back to appending when the ref isn't attached. The viewer
  // turns ((Name)) markers into clickable pills inline in the
  // description, while characterIds drive the timeline filter row —
  // calling this keeps both in sync, so the user only has to think
  // about "who's in this scene" once.
  function insertMention(c: { id: string; name: string }) {
    const ta = descRef.current;
    const insertion = `((${c.name}))`;
    let nextDescription: string;
    let cursorAt: number | null = null;
    if (ta) {
      const start = ta.selectionStart ?? data.description.length;
      const end = ta.selectionEnd ?? start;
      const before = data.description.slice(0, start);
      const after = data.description.slice(end);
      nextDescription = `${before}${insertion}${after}`;
      cursorAt = before.length + insertion.length;
    } else {
      nextDescription = data.description.length > 0
        ? `${data.description} ${insertion}`
        : insertion;
    }
    const nextIds = data.characterIds.includes(c.id)
      ? data.characterIds
      : [...data.characterIds, c.id];
    onChange({ ...data, description: nextDescription, characterIds: nextIds });
    if (ta && cursorAt !== null) {
      // Restore focus + caret after React re-renders the textarea value.
      // Without the rAF the selection range is set on the stale value.
      requestAnimationFrame(() => {
        ta.focus();
        try { ta.setSelectionRange(cursorAt!, cursorAt!); } catch { /* ignore */ }
      });
    }
  }

  return (
    <>
      <div>
        <label className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider font-semibold mb-1 block">Description</label>
        <textarea
          ref={descRef}
          value={data.description}
          onChange={(e) => onChange({ ...data, description: e.target.value })}
          rows={3}
          className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)] resize-y"
        />
        <p className="text-[10px] text-[var(--foreground-muted)] mt-1 leading-relaxed">
          Wrap character mentions in double parens — e.g. <code className="text-[var(--ratist-red)]">((Paul Atreides))</code> — so they render as clickable pills. Use the buttons below to insert at the cursor.
        </p>
      </div>
      <div>
        <label className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider font-semibold mb-1 block">Tag characters · click to insert mention</label>
        <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto">
          {characters.map((c) => {
            const selected = data.characterIds.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => insertMention(c)}
                className={`px-2 py-0.5 text-[11px] rounded-full border transition-colors ${
                  selected
                    ? "bg-[var(--ratist-red)] border-[var(--ratist-red)] text-white"
                    : "bg-[var(--surface-2)] border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"
                }`}
                title={selected ? `Tagged — click to insert another mention` : `Tag and insert mention`}
              >
                + {c.name}
              </button>
            );
          })}
        </div>
        {data.characterIds.length > 0 && (
          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap text-[10px] text-[var(--foreground-muted)]">
            <span>Currently tagged:</span>
            {data.characterIds.map((id) => {
              const ch = characters.find((c) => c.id === id);
              if (!ch) return null;
              return (
                <span key={id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[var(--ratist-red)]/20 border border-[var(--ratist-red)]/30 text-white">
                  {ch.name}
                  <button
                    type="button"
                    onClick={() => onChange({ ...data, characterIds: data.characterIds.filter((x) => x !== id) })}
                    className="text-[var(--foreground-muted)] hover:text-white"
                    title="Untag this character (does not strip ((mentions)) from the description)"
                    aria-label="Untag"
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </div>
      <div>
        <label className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider font-semibold mb-1 block">Importance (1–5)</label>
        <input
          type="number"
          min={1}
          max={5}
          value={data.importance}
          onChange={(e) => onChange({ ...data, importance: Math.max(1, Math.min(5, parseInt(e.target.value, 10) || 3)) })}
          className="w-24 bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)]"
        />
      </div>
      <VisibleAfterInput value={data.visibleAfter} mediaType={mediaType} onChange={(v) => onChange({ ...data, visibleAfter: v })} />
    </>
  );
}

function GlossaryFields({ data, mediaType, onChange }: { data: GlossaryDraft; mediaType: "movie" | "tv"; onChange: (d: GlossaryDraft) => void }) {
  return (
    <>
      <LabelledInput label="Term" value={data.term} onChange={(v) => onChange({ ...data, term: v })} />
      <LabelledTextarea label="Definition" value={data.definition} onChange={(v) => onChange({ ...data, definition: v })} rows={3} />
      <LabelledSelect label="Category" value={data.category} onChange={(v) => onChange({ ...data, category: v })} options={GLOSSARY_CATEGORIES} placeholder="(none)" />
      <VisibleAfterInput value={data.visibleAfter} mediaType={mediaType} onChange={(v) => onChange({ ...data, visibleAfter: v })} />
    </>
  );
}
