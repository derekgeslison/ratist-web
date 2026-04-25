"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { ArrowLeft, Eye, EyeOff, Trash2, Sparkles, RefreshCcw, Users, Link2, Clock, BookOpen, Pencil, Check, X, Plus, Tag, MessageSquare } from "lucide-react";
import CompanionItemEditor, { type EditorDraft } from "@/components/admin/CompanionItemEditor";
import CompanionSubmittersTable from "@/components/admin/CompanionSubmittersTable";
import { usePopoverPosition } from "@/hooks/usePopoverPosition";

interface VisibleAfter { seconds?: number; season?: number; episode?: number }

interface Fact { id: string; fact: string; factType: string; visibleAfter: VisibleAfter }
interface ActorRow {
  id: string;
  actorName: string;
  actorTmdbId: number | null;
  note: string | null;
  visibleAfter: VisibleAfter;
  sortOrder: number;
}
interface AliasRow { name: string; visibleAfter: VisibleAfter }
interface GroupChangeRow { group: string; visibleAfter: VisibleAfter }
interface Character {
  id: string; name: string; actorName: string | null; baseDescription: string;
  group: string | null; visibleAfter: VisibleAfter; facts: Fact[];
  seasonNumber: number | null;
  sortOrder: number;
  actors: ActorRow[];
  nameAliases: AliasRow[];
  groupHistory: GroupChangeRow[];
}
interface Relationship {
  id: string; relationshipType: string; label: string; directed: boolean;
  fromCharacterId: string; toCharacterId: string; visibleAfter: VisibleAfter;
  seasonNumber: number | null;
}
interface TimelineEvent {
  id: string; description: string; importance: number; characterIds: string[]; visibleAfter: VisibleAfter;
  seasonNumber: number | null;
}
interface GlossaryTerm {
  id: string; term: string; definition: string; category: string | null; visibleAfter: VisibleAfter;
  seasonNumber: number | null;
}
interface AiringSeasonRow {
  seasonNumber: number;
  episodesGenerated: number[];
  status: "airing" | "completed";
  failureCount: number;
  lastError: string | null;
  lastSweepAt: string | null;
}
interface Companion {
  id: string; tmdbId: number; mediaType: "movie" | "tv";
  title: string; status: "draft" | "published"; seasonsGenerated: number[];
  runtimeSeconds: number | null;
  lastGeneratedAt: string | null; publishedAt: string | null;
  characters: Character[]; relationships: Relationship[];
  timeline: TimelineEvent[]; glossary: GlossaryTerm[];
  /** Airing-season tracker rows. Surfaced in the header + filter so admins
   *  can see which seasons are mid-air, how many episodes are in, and
   *  whether the cron sweep is failing on any of them. */
  airingSeasons?: AiringSeasonRow[];
  /** Per-installment recap blob. Movies: { current: { installment, series } }.
   *  TV: { "1": { installment, series }, "2": {...}, ... }. */
  recaps: Record<string, unknown> | null;
}

interface SuggestionRow {
  id: string;
  action: "add" | "edit" | "remove";
  targetType: string;
  targetId: string | null;
  appliedItemId?: string | null;
  rationale: string | null;
  payload: Record<string, unknown> | null;
  upvoteScore: number;
  voteCount: number;
  createdAt: string;
  resolvedAt?: string | null;
  submitter: { id: string; name: string; avatarUrl: string | null };
}

function fmtVisible(v: VisibleAfter, mediaType: "movie" | "tv"): string {
  if (mediaType === "movie") {
    if (typeof v.seconds === "number") {
      const m = Math.floor(v.seconds / 60);
      const s = v.seconds % 60;
      return `${m}:${String(s).padStart(2, "0")}`;
    }
    return "start";
  }
  const s = v.season ?? 1;
  const e = v.episode ?? 1;
  return `S${s}E${e}`;
}

type EditableType = "character" | "fact" | "timeline" | "glossary";
type ItemType = EditableType | "relationship";

interface EditingState {
  type: EditableType;
  id: string;
  field: "baseDescription" | "fact" | "description" | "definition";
  value: string;
}

export default function ReviewCompanionPage() {
  const { user } = useAuth();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [companion, setCompanion] = useState<Companion | null>(null);
  const [pendingSuggestions, setPendingSuggestions] = useState<SuggestionRow[]>([]);
  const [appliedSuggestions, setAppliedSuggestions] = useState<SuggestionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [regenStep, setRegenStep] = useState<string>("");
  // "all" = show every season's rows; number = filter to that season.
  const [seasonFilter, setSeasonFilter] = useState<number | "all">("all");
  // Modal editor state — null when closed.
  const [editorDraft, setEditorDraft] = useState<EditorDraft | null>(null);

  function refetch() {
    if (!user) return;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/admin/watch-companion/${id}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const data = await res.json();
        setCompanion(data.companion);
        setPendingSuggestions(data.pendingSuggestions ?? []);
        setAppliedSuggestions(data.appliedSuggestions ?? []);
      } catch { /* swallow — dialog just won't refresh */ }
    })();
  }
  async function getToken() { return (await user?.getIdToken()) ?? ""; }

  async function deleteItem(type: ItemType, itemId: string) {
    if (!user || !confirm("Delete this item? This can't be undone from here.")) return;
    const token = await user.getIdToken();
    const res = await fetch(`/api/admin/watch-companion/item/${type}/${itemId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    setCompanion((prev) => {
      if (!prev) return prev;
      switch (type) {
        case "character":
          return { ...prev, characters: prev.characters.filter((c) => c.id !== itemId) };
        case "fact":
          return {
            ...prev,
            characters: prev.characters.map((c) => ({ ...c, facts: c.facts.filter((f) => f.id !== itemId) })),
          };
        case "relationship":
          return { ...prev, relationships: prev.relationships.filter((r) => r.id !== itemId) };
        case "timeline":
          return { ...prev, timeline: prev.timeline.filter((t) => t.id !== itemId) };
        case "glossary":
          return { ...prev, glossary: prev.glossary.filter((g) => g.id !== itemId) };
      }
    });
  }

  async function saveEdit() {
    if (!editing || !user) return;
    setEditSaving(true);
    const token = await user.getIdToken();
    const body: Record<string, unknown> = { [editing.field]: editing.value };
    const res = await fetch(`/api/admin/watch-companion/item/${editing.type}/${editing.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) { setEditSaving(false); return; }
    setCompanion((prev) => {
      if (!prev) return prev;
      const { type, id, field, value } = editing;
      switch (type) {
        case "character":
          return { ...prev, characters: prev.characters.map((c) => c.id === id ? { ...c, baseDescription: value } : c) };
        case "fact":
          return {
            ...prev,
            characters: prev.characters.map((c) => ({
              ...c,
              facts: c.facts.map((f) => f.id === id ? { ...f, fact: value } : f),
            })),
          };
        case "timeline":
          return { ...prev, timeline: prev.timeline.map((t) => t.id === id ? { ...t, description: value } : t) };
        case "glossary":
          return { ...prev, glossary: prev.glossary.map((g) => g.id === id ? { ...g, [field]: value } : g) };
      }
    });
    setEditing(null);
    setEditSaving(false);
  }

  function startEdit(type: EditableType, itemId: string, field: EditingState["field"], value: string) {
    setEditing({ type, id: itemId, field, value });
  }

  useEffect(() => {
    if (!user) return;
    (async () => {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/watch-companion/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setError("Access denied or not found.");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setCompanion(data.companion);
      setPendingSuggestions(data.pendingSuggestions ?? []);
      setAppliedSuggestions(data.appliedSuggestions ?? []);
      setLoading(false);
    })();
  }, [user, id]);

  async function togglePublish() {
    if (!user || !companion) return;
    setSaving(true);
    const token = await user.getIdToken();
    const nextStatus = companion.status === "published" ? "draft" : "published";
    const res = await fetch(`/api/admin/watch-companion/${id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (res.ok) setCompanion({ ...companion, status: nextStatus });
    setSaving(false);
  }

  async function regenerate() {
    if (!user || !companion) return;
    // Default to the currently filtered season if the admin has one picked —
    // makes it obvious which season they're about to overwrite. Falls back to
    // the latest generated season.
    const defaultSeason = seasonFilter !== "all"
      ? seasonFilter
      : companion.seasonsGenerated[companion.seasonsGenerated.length - 1] ?? 1;
    const season = companion.mediaType === "tv"
      ? parseInt(prompt("Season to regenerate?", String(defaultSeason)) ?? "", 10)
      : null;
    if (companion.mediaType === "tv" && (!Number.isFinite(season!) || season! < 1)) return;

    setSaving(true);
    setRegenStep("Starting…");
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/watch-companion/generate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          tmdbId: companion.tmdbId,
          mediaType: companion.mediaType,
          ...(companion.mediaType === "tv" ? { season } : {}),
        }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        alert(`Regeneration failed: ${data.error ?? res.status}`);
        setSaving(false);
        setRegenStep("");
        return;
      }

      // Consume the SSE stream; reload only after a "complete" event.
      // Without this the page reloads instantly because an SSE response
      // has status 200 from the first byte.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;
      let errorMsg: string | null = null;

      const stepLabels: Record<string, string> = {
        grounding: "Fetching grounding…",
        characters: "Drafting characters…",
        facts: "Drafting facts…",
        relationships: "Drafting relationships…",
        timeline: "Drafting timeline…",
        glossary: "Drafting glossary…",
        recap: "Drafting recap…",
        persist: "Saving…",
      };

      // Collect non-fatal warnings (e.g. subtitle quota exhausted) so the
      // moderator sees them before the page reloads. Without this, a regen
      // that fell back to runtime-percentage estimates would just look
      // sloppier than the previous version with no explanation.
      const collectedWarnings: Array<{ source: string; reason: string; message: string }> = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const raw of events) {
          const trimmed = raw.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload) continue;
          try {
            const evt = JSON.parse(payload);
            if (evt.kind === "step" && evt.status === "running" && stepLabels[evt.step]) {
              setRegenStep(stepLabels[evt.step]);
            } else if (evt.kind === "complete") {
              completed = true;
            } else if (evt.kind === "warning") {
              collectedWarnings.push({
                source: evt.source ?? "unknown",
                reason: evt.reason ?? "unknown",
                message: evt.message ?? "(no detail)",
              });
            } else if (evt.kind === "error") {
              errorMsg = evt.message ?? "Generation failed";
            }
          } catch { /* ignore malformed */ }
        }
      }

      if (errorMsg) {
        alert(`Regeneration failed: ${errorMsg}`);
        setSaving(false);
        setRegenStep("");
        return;
      }
      if (collectedWarnings.length > 0) {
        const lines = collectedWarnings.map((w) => `• [${w.source}/${w.reason}] ${w.message}`).join("\n");
        alert(
          `Regeneration finished with ${collectedWarnings.length} warning${collectedWarnings.length === 1 ? "" : "s"}:\n\n${lines}\n\n` +
          (collectedWarnings.some((w) => w.source === "subtitles")
            ? "Without subtitles the AI estimates timestamps from runtime percentages, so this regen will use coarser numbers. Wait for quota to reset (typically 24h) and regen again for dialogue-anchored timestamps."
            : "")
        );
      }
      if (completed) {
        window.location.reload();
      } else {
        alert("Regeneration ended without completing — please try again.");
        setSaving(false);
        setRegenStep("");
      }
    } catch (err) {
      alert(`Regeneration failed: ${err instanceof Error ? err.message : "Network error"}`);
      setSaving(false);
      setRegenStep("");
    }
  }

  async function deleteCompanion() {
    if (!user || !companion) return;
    if (!confirm(`Delete the Watch Companion for "${companion.title}"? This is permanent.`)) return;
    setSaving(true);
    const token = await user.getIdToken();
    const res = await fetch(`/api/admin/watch-companion/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) router.push("/admin/watch-companions");
    else setSaving(false);
  }

  if (loading) return <p className="text-[var(--foreground-muted)]">Loading…</p>;
  if (error) return <p className="text-red-400">{error}</p>;
  if (!companion) return null;

  const charName = (cid: string) => companion.characters.find((c) => c.id === cid)?.name ?? "(unknown)";

  // Build a "community changes on this item" lookup. Approved edits
  // target the item via targetId. Approved adds created the item via
  // appliedItemId. The baseDescription alias case targets a character.
  const communityByItem = new Map<string, SuggestionRow[]>();
  for (const s of appliedSuggestions) {
    const bucketType = s.targetType === "baseDescription" ? "character" : s.targetType;
    const idForMap = s.targetId ?? s.appliedItemId ?? null;
    if (!idForMap) continue;
    const key = `${bucketType}:${idForMap}`;
    const arr = communityByItem.get(key) ?? [];
    arr.push(s);
    communityByItem.set(key, arr);
  }
  const communityFor = (type: string, id: string) => communityByItem.get(`${type}:${id}`) ?? [];

  // Apply the admin's season filter. Movies have seasonNumber: null on every
  // row and the filter stays as "all" implicitly.
  const matchesSeason = <T extends { seasonNumber: number | null }>(row: T) =>
    seasonFilter === "all" || row.seasonNumber === seasonFilter;
  const filteredCharacters = companion.characters.filter(matchesSeason);
  const filteredRelationships = companion.relationships.filter(matchesSeason);
  const filteredTimeline = companion.timeline.filter(matchesSeason);
  const filteredGlossary = companion.glossary.filter(matchesSeason);
  // Combine completed + airing seasons for the filter dropdown so admins
  // can scope the view to a season that's currently airing too. Airing
  // rows that have already finalized are excluded — those have flipped
  // into seasonsGenerated, which is the source of truth post-finalize.
  const airingForUi = (companion.airingSeasons ?? []).filter((a) => a.status === "airing");
  const sortedSeasons = Array.from(
    new Set([...companion.seasonsGenerated, ...airingForUi.map((a) => a.seasonNumber)]),
  ).sort((a, b) => a - b);

  // Compact "S3, S5 (airing · 4 eps)" label for the header. Failing cron
  // rows get a red dot so an at-risk row is impossible to miss when an
  // admin opens the page.
  const headerSeasonLabel = companion.mediaType === "tv" && (companion.seasonsGenerated.length > 0 || airingForUi.length > 0)
    ? ` · ${[
        ...companion.seasonsGenerated.map((n) => `S${n}`),
        ...airingForUi.map((a) => `S${a.seasonNumber} (airing · ${a.episodesGenerated.length} ep${a.episodesGenerated.length === 1 ? "" : "s"}${a.failureCount > 0 ? ` · ⚠ ${a.failureCount} failures` : ""})`),
      ].join(", ")}`
    : "";

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/watch-companions" className="text-[var(--foreground-muted)] hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h2 className="text-lg font-semibold text-white">{companion.title}</h2>
        <span className="text-xs text-[var(--foreground-muted)]">
          {companion.mediaType === "tv" ? "TV" : "Movie"} · TMDB {companion.tmdbId}
          {headerSeasonLabel}
        </span>
        {companion.mediaType === "tv" && sortedSeasons.length > 1 && (
          <label className="ml-auto flex items-center gap-2 text-[11px] text-[var(--foreground-muted)]">
            Filter:
            <select
              value={String(seasonFilter)}
              onChange={(e) => {
                const v = e.target.value;
                setSeasonFilter(v === "all" ? "all" : parseInt(v, 10));
              }}
              className="bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[var(--ratist-red)]"
            >
              <option value="all">All seasons</option>
              {sortedSeasons.map((n) => (
                <option key={n} value={n}>Season {n}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* User-facing rating feedback — counts and free-text comments
             from the public "Was this companion helpful?" widget. Sits
             above moderation since a flood of thumbs-down comments is
             often the FIRST signal that a companion needs intervention
             (regenerate, manual fix, etc.) — admin should see it
             before they dig into individual suggestions. */}
          <CompanionRatingsPanel companionId={companion.id} mediaType={companion.mediaType as "movie" | "tv"} getToken={getToken} />

          {/* Moderation — Queue + Submitters tabs, scoped to this
             companion. Always shown so admins can review submitters
             even when the queue is empty. */}
          <ModerationPanel
            companionId={companion.id}
            pendingSuggestions={pendingSuggestions}
            characters={companion.characters}
            mediaType={companion.mediaType}
            getToken={getToken}
            onResolved={refetch}
          />


          {/* Factions — quick bulk rename for all characters sharing a group */}
          <FactionEditor
            characters={companion.characters}
            companionId={companion.id}
            getToken={getToken}
            onRenamed={refetch}
          />

          {/* Recap editor — quick admin override for the AI-drafted
             recap text. Doesn't trigger a regen; just rewrites the
             slot in the companion's recaps JSON. Per-season for TV. */}
          <CompanionRecapEditor
            companionId={companion.id}
            mediaType={companion.mediaType}
            recaps={companion.recaps ?? {}}
            seasonsGenerated={companion.seasonsGenerated}
            getToken={getToken}
            onSaved={refetch}
          />

          {/* Characters */}
          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--border)] flex items-center gap-2">
              <Users className="w-4 h-4 text-[var(--ratist-red)]" />
              <h3 className="text-sm font-semibold text-white">Characters ({filteredCharacters.length}{seasonFilter !== "all" && ` of ${companion.characters.length}`})</h3>
            </div>
            <div className="divide-y divide-[var(--border)]/40">
              {filteredCharacters.map((c) => {
                const descEditing = editing?.type === "character" && editing.id === c.id;
                return (
                <div key={c.id} className="px-5 py-3">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">
                        {c.name}
                        {c.nameAliases && c.nameAliases.length > 0 && (
                          <span className="ml-2 text-[10px] font-normal text-[var(--foreground-muted)]">
                            later known as {c.nameAliases.map((a, i) => (
                              <span key={i}>
                                <span className="text-white">{a.name}</span>
                                <span className="text-[var(--foreground-muted)]/70"> @ {fmtVisible(a.visibleAfter, companion.mediaType)}</span>
                                {i < c.nameAliases.length - 1 ? ", " : ""}
                              </span>
                            ))}
                          </span>
                        )}
                      </p>
                      {/* Prefer the side-table actors list when populated,
                         falling back to the primary actorName for legacy
                         data. */}
                      {c.actors && c.actors.length > 1 ? (
                        <p className="text-xs text-[var(--foreground-muted)]">
                          played by{" "}
                          {c.actors.map((a, i) => (
                            <span key={a.id}>
                              <span className="text-white">{a.actorName}</span>
                              {a.note && <span className="text-[var(--foreground-muted)]/80"> ({a.note})</span>}
                              <span className="text-[var(--foreground-muted)]/60"> @ {fmtVisible(a.visibleAfter, companion.mediaType)}</span>
                              {i < c.actors.length - 1 ? ", " : ""}
                            </span>
                          ))}
                        </p>
                      ) : c.actorName ? (
                        <p className="text-xs text-[var(--foreground-muted)]">played by {c.actorName}</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-[var(--foreground-muted)] shrink-0">
                      {c.group && <span className="px-1.5 py-0.5 rounded bg-[var(--surface-2)]">{c.group}</span>}
                      {c.groupHistory && c.groupHistory.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-[var(--surface-2)]" title="Faction changes">
                          → {c.groupHistory.map((g, i) => (
                            <span key={i}>
                              <span className="text-white">{g.group}</span>
                              <span className="text-[var(--foreground-muted)]/70"> @ {fmtVisible(g.visibleAfter, companion.mediaType)}</span>
                              {i < c.groupHistory.length - 1 ? ", " : ""}
                            </span>
                          ))}
                        </span>
                      )}
                      <span>appears {fmtVisible(c.visibleAfter, companion.mediaType)}</span>
                      <ItemCommunityChanges
                        suggestions={communityFor("character", c.id)}
                        mediaType={companion.mediaType}
                        getToken={getToken}
                        onReverted={refetch}
                      />
                      <button
                        onClick={() => setEditorDraft({
                          type: "character",
                          id: c.id,
                          data: {
                            name: c.name,
                            baseDescription: c.baseDescription,
                            group: c.group ?? "",
                            actorName: c.actorName ?? "",
                            actorTmdbId: c.actors?.[0]?.actorTmdbId ?? null,
                            sortOrder: c.sortOrder,
                            visibleAfter: c.visibleAfter,
                          },
                        })}
                        className="p-1 rounded hover:text-white hover:bg-[var(--surface-2)] transition-colors"
                        title="Edit character"
                      ><Pencil className="w-3 h-3" /></button>
                      <button
                        onClick={() => setEditorDraft({
                          type: "fact",
                          id: null,
                          characterId: c.id,
                          data: { fact: "", factType: "other", visibleAfter: c.visibleAfter },
                        })}
                        className="p-1 rounded hover:text-white hover:bg-[var(--surface-2)] transition-colors"
                        title="Add event"
                      ><Plus className="w-3 h-3" /></button>
                      <button
                        onClick={() => deleteItem("character", c.id)}
                        className="p-1 rounded hover:text-red-400 hover:bg-[var(--surface-2)] transition-colors"
                        title="Delete character"
                      ><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </div>
                  {descEditing ? (
                    <div className="mt-2 space-y-2">
                      <textarea
                        value={editing.value}
                        onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                        rows={3}
                        className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)] resize-y"
                      />
                      <div className="flex gap-2">
                        <button onClick={saveEdit} disabled={editSaving} className="flex items-center gap-1 px-2 py-1 bg-[var(--ratist-red)] text-white rounded text-xs font-semibold hover:bg-[var(--ratist-red)]/80 disabled:opacity-50">
                          <Check className="w-3 h-3" /> Save
                        </button>
                        <button onClick={() => setEditing(null)} className="flex items-center gap-1 px-2 py-1 bg-[var(--surface-2)] border border-[var(--border)] text-[var(--foreground-muted)] rounded text-xs">
                          <X className="w-3 h-3" /> Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--foreground-muted)] leading-relaxed">{c.baseDescription}</p>
                  )}
                  {c.facts.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {c.facts.map((f) => {
                        const factEditing = editing?.type === "fact" && editing.id === f.id;
                        return (
                          <li key={f.id} className="text-xs text-[var(--foreground-muted)] flex items-start gap-2">
                            <span className="text-[10px] uppercase tracking-wider text-[var(--ratist-red)] font-semibold shrink-0 mt-0.5">{f.factType.replace(/_/g, " ")}</span>
                            {factEditing ? (
                              <div className="flex-1 space-y-1">
                                <textarea
                                  value={editing.value}
                                  onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                                  rows={2}
                                  className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[var(--ratist-red)] resize-y"
                                />
                                <div className="flex gap-1">
                                  <button onClick={saveEdit} disabled={editSaving} className="flex items-center gap-1 px-1.5 py-0.5 bg-[var(--ratist-red)] text-white rounded text-[10px] disabled:opacity-50">
                                    <Check className="w-2.5 h-2.5" /> Save
                                  </button>
                                  <button onClick={() => setEditing(null)} className="flex items-center gap-1 px-1.5 py-0.5 bg-[var(--surface-2)] border border-[var(--border)] text-[var(--foreground-muted)] rounded text-[10px]">
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <span className="flex-1">{f.fact}</span>
                                <span className="shrink-0">{fmtVisible(f.visibleAfter, companion.mediaType)}</span>
                                <ItemCommunityChanges
                                  suggestions={communityFor("fact", f.id)}
                                  mediaType={companion.mediaType}
                                  getToken={getToken}
                                  onReverted={refetch}
                                />
                                <button
                                  onClick={() => setEditorDraft({
                                    type: "fact",
                                    id: f.id,
                                    characterId: c.id,
                                    data: { fact: f.fact, factType: f.factType, visibleAfter: f.visibleAfter },
                                  })}
                                  className="p-0.5 rounded hover:text-white"
                                  title="Edit event"
                                ><Pencil className="w-2.5 h-2.5" /></button>
                                <button onClick={() => deleteItem("fact", f.id)} className="p-0.5 rounded hover:text-red-400" title="Delete"><Trash2 className="w-2.5 h-2.5" /></button>
                              </>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
              })}
            </div>
          </section>

          {/* Relationships */}
          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--border)] flex items-center gap-2">
              <Link2 className="w-4 h-4 text-[var(--ratist-red)]" />
              <h3 className="text-sm font-semibold text-white">Relationships ({filteredRelationships.length}{seasonFilter !== "all" && ` of ${companion.relationships.length}`})</h3>
              <button
                onClick={() => setEditorDraft({
                  type: "relationship",
                  id: null,
                  companionId: companion.id,
                  seasonNumber: seasonFilter === "all" ? null : seasonFilter,
                  data: { fromCharacterId: "", toCharacterId: "", label: "", relationshipType: "other", directed: true, visibleAfter: {} },
                })}
                className="ml-auto inline-flex items-center gap-1 text-xs text-[var(--foreground-muted)] hover:text-white"
                title="Add relationship"
              ><Plus className="w-3.5 h-3.5" /> Add</button>
            </div>
            {filteredRelationships.length === 0 ? (
              <p className="px-5 py-3 text-xs text-[var(--foreground-muted)] italic">No relationships in this view.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)]/40">
                {filteredRelationships.map((r) => (
                  <li key={r.id} className="px-5 py-2 text-sm text-white flex items-center gap-2">
                    <span className="font-medium">{charName(r.fromCharacterId)}</span>
                    <span className="text-[var(--foreground-muted)] italic text-xs">{r.label}</span>
                    <span className="font-medium">{charName(r.toCharacterId)}</span>
                    <span className="ml-auto text-[10px] text-[var(--foreground-muted)]">{fmtVisible(r.visibleAfter, companion.mediaType)} · {r.relationshipType}</span>
                    <ItemCommunityChanges
                      suggestions={communityFor("relationship", r.id)}
                      mediaType={companion.mediaType}
                      getToken={getToken}
                      onReverted={refetch}
                    />
                    <button
                      onClick={() => setEditorDraft({
                        type: "relationship",
                        id: r.id,
                        companionId: companion.id,
                        seasonNumber: r.seasonNumber,
                        data: {
                          fromCharacterId: r.fromCharacterId,
                          toCharacterId: r.toCharacterId,
                          label: r.label,
                          relationshipType: r.relationshipType,
                          directed: r.directed,
                          visibleAfter: r.visibleAfter,
                        },
                      })}
                      className="p-0.5 text-[var(--foreground-muted)] hover:text-white"
                      title="Edit relationship"
                    ><Pencil className="w-3 h-3" /></button>
                    <button onClick={() => deleteItem("relationship", r.id)} className="p-0.5 text-[var(--foreground-muted)] hover:text-red-400" title="Delete"><Trash2 className="w-3 h-3" /></button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Timeline */}
          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--border)] flex items-center gap-2">
              <Clock className="w-4 h-4 text-[var(--ratist-red)]" />
              <h3 className="text-sm font-semibold text-white">Timeline events ({filteredTimeline.length}{seasonFilter !== "all" && ` of ${companion.timeline.length}`})</h3>
              <button
                onClick={() => setEditorDraft({
                  type: "timeline",
                  id: null,
                  companionId: companion.id,
                  seasonNumber: seasonFilter === "all" ? null : seasonFilter,
                  data: { description: "", importance: 3, characterIds: [], visibleAfter: {} },
                })}
                className="ml-auto inline-flex items-center gap-1 text-xs text-[var(--foreground-muted)] hover:text-white"
                title="Add timeline event"
              ><Plus className="w-3.5 h-3.5" /> Add</button>
            </div>
            {filteredTimeline.length === 0 ? (
              <p className="px-5 py-3 text-xs text-[var(--foreground-muted)] italic">No timeline events in this view.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)]/40">
                {filteredTimeline.map((t) => (
                  <li key={t.id} className="px-5 py-2 text-sm text-white flex items-start gap-3">
                    <span className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wider shrink-0 mt-0.5 w-12">{fmtVisible(t.visibleAfter, companion.mediaType)}</span>
                    <span className="flex-1">{t.description}</span>
                    <span className="text-[10px] text-[var(--foreground-muted)] shrink-0 mt-0.5">★{t.importance}</span>
                    <ItemCommunityChanges
                      suggestions={communityFor("timeline", t.id)}
                      mediaType={companion.mediaType}
                      getToken={getToken}
                      onReverted={refetch}
                    />
                    <button
                      onClick={() => setEditorDraft({
                        type: "timeline",
                        id: t.id,
                        companionId: companion.id,
                        seasonNumber: t.seasonNumber,
                        data: { description: t.description, importance: t.importance, characterIds: t.characterIds, visibleAfter: t.visibleAfter },
                      })}
                      className="p-0.5 text-[var(--foreground-muted)] hover:text-white"
                      title="Edit timeline event"
                    ><Pencil className="w-3 h-3" /></button>
                    <button onClick={() => deleteItem("timeline", t.id)} className="p-0.5 text-[var(--foreground-muted)] hover:text-red-400" title="Delete"><Trash2 className="w-3 h-3" /></button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Glossary */}
          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--border)] flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[var(--ratist-red)]" />
              <h3 className="text-sm font-semibold text-white">Glossary ({filteredGlossary.length}{seasonFilter !== "all" && ` of ${companion.glossary.length}`})</h3>
              <button
                onClick={() => setEditorDraft({
                  type: "glossary",
                  id: null,
                  companionId: companion.id,
                  seasonNumber: seasonFilter === "all" ? null : seasonFilter,
                  data: { term: "", definition: "", category: "", visibleAfter: {} },
                })}
                className="ml-auto inline-flex items-center gap-1 text-xs text-[var(--foreground-muted)] hover:text-white"
                title="Add glossary term"
              ><Plus className="w-3.5 h-3.5" /> Add</button>
            </div>
            {filteredGlossary.length === 0 ? (
              <p className="px-5 py-3 text-xs text-[var(--foreground-muted)] italic">No glossary terms in this view.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)]/40">
                {filteredGlossary.map((g) => {
                  const isEditing = editing?.type === "glossary" && editing.id === g.id;
                  return (
                    <li key={g.id} className="px-5 py-2 text-sm">
                      <div className="flex items-baseline gap-2">
                        <span className="font-semibold text-white">{g.term}</span>
                        {g.category && <span className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wider">{g.category}</span>}
                        <span className="ml-auto text-[10px] text-[var(--foreground-muted)]">{fmtVisible(g.visibleAfter, companion.mediaType)}</span>
                        <ItemCommunityChanges
                          suggestions={communityFor("glossary", g.id)}
                          mediaType={companion.mediaType}
                          getToken={getToken}
                          onReverted={refetch}
                        />
                        <button
                          onClick={() => setEditorDraft({
                            type: "glossary",
                            id: g.id,
                            companionId: companion.id,
                            seasonNumber: g.seasonNumber,
                            data: { term: g.term, definition: g.definition, category: g.category ?? "", visibleAfter: g.visibleAfter },
                          })}
                          className="p-0.5 text-[var(--foreground-muted)] hover:text-white"
                          title="Edit glossary term"
                        ><Pencil className="w-3 h-3" /></button>
                        <button onClick={() => deleteItem("glossary", g.id)} className="p-0.5 text-[var(--foreground-muted)] hover:text-red-400" title="Delete"><Trash2 className="w-3 h-3" /></button>
                      </div>
                      {isEditing ? (
                        <div className="mt-1 space-y-1">
                          <textarea
                            value={editing.value}
                            onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                            rows={2}
                            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)] resize-y"
                          />
                          <div className="flex gap-1">
                            <button onClick={saveEdit} disabled={editSaving} className="flex items-center gap-1 px-1.5 py-0.5 bg-[var(--ratist-red)] text-white rounded text-[10px] disabled:opacity-50">
                              <Check className="w-2.5 h-2.5" /> Save
                            </button>
                            <button onClick={() => setEditing(null)} className="flex items-center gap-1 px-1.5 py-0.5 bg-[var(--surface-2)] border border-[var(--border)] text-[var(--foreground-muted)] rounded text-[10px]">
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[var(--foreground-muted)] mt-0.5">{g.definition}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white">Status</h3>
            <div>
              {companion.status === "published" ? (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-green-500/50 text-green-400 bg-green-500/10">
                  <Eye className="w-3 h-3" /> Published
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-[var(--border)] text-[var(--foreground-muted)]">
                  <EyeOff className="w-3 h-3" /> Draft
                </span>
              )}
            </div>
            <button
              onClick={togglePublish}
              disabled={saving}
              className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${
                companion.status === "published"
                  ? "bg-[var(--surface-2)] border border-[var(--border)] text-white hover:border-[var(--ratist-red)]"
                  : "bg-[var(--ratist-red)] text-white hover:bg-[var(--ratist-red)]/80"
              }`}
            >
              {companion.status === "published" ? <><EyeOff className="w-3.5 h-3.5" /> Unpublish</> : <><Eye className="w-3.5 h-3.5" /> Publish</>}
            </button>
          </div>

          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white">Actions</h3>
            <button
              onClick={regenerate}
              disabled={saving}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] text-white rounded-lg text-sm font-semibold hover:border-[var(--ratist-red)] transition-colors disabled:opacity-50"
            >
              {saving ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Regenerate{companion.mediaType === "tv" ? " season" : ""}
            </button>
            {saving && regenStep && (
              <p className="text-[11px] text-[var(--foreground-muted)] italic text-center">{regenStep}</p>
            )}
            <button
              onClick={deleteCompanion}
              disabled={saving}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] text-[var(--foreground-muted)] rounded-lg text-sm font-semibold hover:text-red-400 hover:border-red-500/50 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </div>

          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-xs text-[var(--foreground-muted)] space-y-1">
            <p>Last generated: {companion.lastGeneratedAt ? new Date(companion.lastGeneratedAt).toLocaleString() : "—"}</p>
            <p>Published at: {companion.publishedAt ? new Date(companion.publishedAt).toLocaleString() : "—"}</p>
          </div>
        </div>
      </div>

      <CompanionItemEditor
        open={!!editorDraft}
        draft={editorDraft}
        mediaType={companion.mediaType}
        characters={companion.characters.map((c) => ({ id: c.id, name: c.name }))}
        onClose={() => setEditorDraft(null)}
        onSaved={refetch}
        getToken={getToken}
      />
    </div>
  );
}

// ── ItemCommunityChanges ────────────────────────────────────────────────
// Inline admin badge + expand-to-revert popover. Rendered on any
// character / fact / timeline / glossary row that has at least one
// approved community suggestion attached (either via targetId for edits
// or appliedItemId for adds).

function ItemCommunityChanges({ suggestions, mediaType, getToken, onReverted }: {
  suggestions: SuggestionRow[];
  mediaType: "movie" | "tv";
  getToken: () => Promise<string>;
  onReverted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Fixed positioning so the popover escapes any overflow:hidden / rounded
  // section container — important when reverting on the last row of a
  // category, where the old absolute popover got clipped at the bottom of
  // the tile.
  const popoverStyle = usePopoverPosition(buttonRef, open, 340);
  if (suggestions.length === 0) return null;

  async function revert(id: string) {
    if (!confirm("Revert this community change? The item will be restored to its state before this suggestion was applied.")) return;
    setBusy(id);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/watch-companion/suggestions/${id}/revert`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) onReverted();
      else {
        const err = await res.json().catch(() => ({}));
        alert(err.error ?? "Revert failed");
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="inline-block">
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 transition-colors text-[10px] font-semibold"
        title={`${suggestions.length} community-approved change${suggestions.length === 1 ? "" : "s"}`}
      >
        <Users className="w-2.5 h-2.5" />
        <Check className="w-2.5 h-2.5 -ml-0.5" />
        {suggestions.length}
      </button>
      {open && popoverStyle && (
        <div style={popoverStyle} className="z-30 bg-[var(--surface)] border border-green-500/30 rounded-lg p-2 space-y-1.5 shadow-xl break-words">
          {suggestions.map((s) => (
            <div key={s.id} className="bg-[var(--surface-2)] border border-[var(--border)]/60 rounded p-2 space-y-1">
              <div className="flex items-baseline gap-2 text-[10px] text-[var(--foreground-muted)]">
                <span className="px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 font-semibold uppercase tracking-wider">{s.action}</span>
                <span>by {s.submitter.name}</span>
                <span className="ml-auto">{s.resolvedAt ? new Date(s.resolvedAt).toLocaleDateString() : ""}</span>
              </div>
              {s.rationale && (
                <p className="text-[11px] text-white italic leading-snug">&ldquo;{s.rationale}&rdquo;</p>
              )}
              {s.payload && Object.keys(s.payload).length > 0 && (
                <details>
                  <summary className="text-[10px] text-[var(--foreground-muted)] cursor-pointer hover:text-white">payload</summary>
                  <pre className="text-[10px] text-[var(--foreground-muted)] bg-[var(--surface)] rounded p-1.5 mt-1 overflow-x-auto whitespace-pre-wrap break-words">{JSON.stringify(s.payload, null, 2)}</pre>
                </details>
              )}
              <div className="flex justify-end">
                <button
                  onClick={() => revert(s.id)}
                  disabled={busy === s.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-muted)] hover:text-red-400 hover:border-red-500/50 rounded text-[10px] font-semibold uppercase tracking-wider disabled:opacity-50"
                >
                  {busy === s.id ? "…" : "Revert"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
// ── CompanionRatingsPanel ───────────────────────────────────────────────
// Admin-only readout of the per-companion thumbs up / thumbs down votes
// and any optional comments. Counts and comments aren't exposed on the
// public side — this is the sole surface for spotting "users hate this
// companion" so the admin can regenerate or manually fix it.

interface AdminRating {
  id: string;
  seasonNumber: number;
  vote: number;
  comment: string | null;
  userName: string;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SeasonBreakdown {
  seasonNumber: number;
  upCount: number;
  downCount: number;
}

function CompanionRatingsPanel({ companionId, mediaType, getToken }: {
  companionId: string;
  mediaType: "movie" | "tv";
  getToken: () => Promise<string>;
}) {
  const [data, setData] = useState<{ upCount: number; downCount: number; seasonBreakdown: SeasonBreakdown[]; ratings: AdminRating[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "up" | "down" | "comments">("all");
  // null = all seasons; number = filter to that season's ratings only.
  // Movies always have a single season=0 bucket so the season picker is
  // hidden in that case.
  const [seasonFilter, setSeasonFilter] = useState<number | null>(null);
  const [dismissing, setDismissing] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const token = await getToken();
      const res = await fetch(`/api/admin/watch-companion/${companionId}/ratings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok || cancelled) { setLoading(false); return; }
      const json = await res.json();
      if (cancelled) return;
      setData({
        upCount: json.upCount,
        downCount: json.downCount,
        seasonBreakdown: json.seasonBreakdown ?? [],
        ratings: json.ratings ?? [],
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companionId]);

  async function dismiss(ratingId: string, vote: number) {
    if (!confirm("Dismiss this rating? The user can re-rate later if they want — this just removes the current vote and any comment.")) return;
    setDismissing(ratingId);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/watch-companion/${companionId}/ratings?ratingId=${encodeURIComponent(ratingId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        alert("Couldn't dismiss the rating.");
        return;
      }
      // Optimistic local update — drop the row + decrement the matching
      // count so the panel stays accurate without a full refetch.
      setData((prev) => prev ? {
        ...prev,
        upCount: vote === 1 ? Math.max(0, prev.upCount - 1) : prev.upCount,
        downCount: vote === -1 ? Math.max(0, prev.downCount - 1) : prev.downCount,
        ratings: prev.ratings.filter((r) => r.id !== ratingId),
      } : prev);
    } finally {
      setDismissing(null);
    }
  }

  if (loading) return null;
  if (!data) return null;
  const total = data.upCount + data.downCount;
  // Approval rate as a quick health metric. Percent has more bite than
  // raw counts when scanning a list of companions ("32% up" jumps out).
  const approval = total > 0 ? Math.round((data.upCount / total) * 100) : null;

  const filtered = data.ratings.filter((r) => {
    if (seasonFilter !== null && r.seasonNumber !== seasonFilter) return false;
    if (filter === "up") return r.vote === 1;
    if (filter === "down") return r.vote === -1;
    if (filter === "comments") return !!r.comment;
    return true;
  });

  // Helper for rendering a season label. Movies always sit in the
  // seasonNumber=0 bucket and skip the label entirely; TV uses
  // "Season N". Used in both the breakdown row and per-rating header.
  const seasonLabel = (n: number) => mediaType === "tv" ? `Season ${n}` : "Movie";

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <h3 className="text-sm font-semibold text-white">User feedback</h3>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-green-400 tabular-nums">▲ {data.upCount}</span>
          <span className="text-red-400 tabular-nums">▼ {data.downCount}</span>
          {approval !== null && (
            <span className={`tabular-nums font-semibold ${approval >= 70 ? "text-green-400" : approval <= 40 ? "text-red-400" : "text-[var(--foreground-muted)]"}`}>
              {approval}% positive
            </span>
          )}
          <span className="text-[var(--foreground-muted)]">· {total} {total === 1 ? "vote" : "votes"}</span>
        </div>
      </div>

      {/* Per-season breakdown — only meaningful for TV with more than
         one season worth of ratings. Movies always have a single
         seasonNumber=0 bucket so the row would just duplicate the
         top-level totals. */}
      {mediaType === "tv" && data.seasonBreakdown.length > 1 && (
        <div className="bg-[var(--surface-2)]/60 border border-[var(--border)]/40 rounded p-2 space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] font-semibold">By season</p>
          <div className="flex flex-col gap-0.5">
            {data.seasonBreakdown.map((s) => {
              const seasonTotal = s.upCount + s.downCount;
              const seasonApproval = seasonTotal > 0 ? Math.round((s.upCount / seasonTotal) * 100) : null;
              return (
                <button
                  key={s.seasonNumber}
                  type="button"
                  onClick={() => setSeasonFilter(seasonFilter === s.seasonNumber ? null : s.seasonNumber)}
                  className={`flex items-center gap-3 text-[11px] px-2 py-1 rounded transition-colors text-left ${
                    seasonFilter === s.seasonNumber
                      ? "bg-[var(--ratist-red)]/10 border border-[var(--ratist-red)]/40"
                      : "hover:bg-[var(--surface)] border border-transparent"
                  }`}
                  title={seasonFilter === s.seasonNumber ? "Show all seasons" : `Filter to ${seasonLabel(s.seasonNumber)} ratings`}
                >
                  <span className="text-white shrink-0 w-20">{seasonLabel(s.seasonNumber)}</span>
                  <span className="text-green-400 tabular-nums w-10">▲ {s.upCount}</span>
                  <span className="text-red-400 tabular-nums w-10">▼ {s.downCount}</span>
                  {seasonApproval !== null && (
                    <span className={`tabular-nums font-semibold ${seasonApproval >= 70 ? "text-green-400" : seasonApproval <= 40 ? "text-red-400" : "text-[var(--foreground-muted)]"}`}>
                      {seasonApproval}%
                    </span>
                  )}
                </button>
              );
            })}
            {seasonFilter !== null && (
              <button
                type="button"
                onClick={() => setSeasonFilter(null)}
                className="text-[10px] text-[var(--foreground-muted)] hover:text-white text-left px-2"
              >
                Clear season filter →
              </button>
            )}
          </div>
        </div>
      )}

      {data.ratings.length === 0 ? (
        <p className="text-xs text-[var(--foreground-muted)] italic">No ratings yet.</p>
      ) : (
        <>
          <div className="flex items-center gap-1.5 flex-wrap">
            {([
              { key: "all", label: `All (${data.ratings.length})` },
              { key: "down", label: `Thumbs down (${data.downCount})` },
              { key: "comments", label: `With comments (${data.ratings.filter((r) => !!r.comment).length})` },
              { key: "up", label: `Thumbs up (${data.upCount})` },
            ] as const).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${
                  filter === key
                    ? "bg-[var(--ratist-red)] border-[var(--ratist-red)] text-white"
                    : "bg-[var(--surface-2)] border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <ul className="space-y-1.5 max-h-96 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="text-xs text-[var(--foreground-muted)] italic px-2 py-1">No ratings match the filter.</li>
            ) : filtered.map((r) => (
              <li key={r.id} className="bg-[var(--surface-2)]/60 border border-[var(--border)]/40 rounded p-2 text-xs">
                <div className="flex items-center gap-2 text-[10px] text-[var(--foreground-muted)] mb-1 flex-wrap">
                  <span className={r.vote === 1 ? "text-green-400" : "text-red-400"}>
                    {r.vote === 1 ? "▲ Thumbs up" : "▼ Thumbs down"}
                  </span>
                  {mediaType === "tv" && (
                    <>
                      <span>·</span>
                      <span className="text-[var(--foreground-muted)]">{seasonLabel(r.seasonNumber)}</span>
                    </>
                  )}
                  <span>·</span>
                  <span className="text-white">{r.userName}</span>
                  <span className="ml-auto">{new Date(r.updatedAt).toLocaleDateString()}</span>
                  <button
                    type="button"
                    onClick={() => dismiss(r.id, r.vote)}
                    disabled={dismissing === r.id}
                    className="text-[10px] text-[var(--foreground-muted)] hover:text-red-400 disabled:opacity-40"
                    title="Dismiss this rating (removes the vote and any comment)"
                  >
                    {dismissing === r.id ? "…" : "Dismiss"}
                  </button>
                </div>
                {r.comment ? (
                  <p className="text-white whitespace-pre-wrap leading-snug">&ldquo;{r.comment}&rdquo;</p>
                ) : (
                  <p className="text-[var(--foreground-muted)] italic text-[11px]">No comment.</p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
// ── ModerationPanel ─────────────────────────────────────────────────────
// Per-companion moderation view mirroring the global suggestions page —
// Queue tab shows pending suggestions ready to approve/dismiss, Submitters
// tab shows everyone who's submitted anything on this companion so admins
// can block repeat troll accounts without leaving the detail page.

function ModerationPanel({
  companionId, pendingSuggestions, characters, mediaType, getToken, onResolved,
}: {
  companionId: string;
  pendingSuggestions: SuggestionRow[];
  characters: Character[];
  mediaType: "movie" | "tv";
  getToken: () => Promise<string>;
  onResolved: () => void;
}) {
  const [tab, setTab] = useState<"queue" | "submitters">("queue");

  return (
    <section className="bg-[var(--surface)] border border-[var(--ratist-red)]/40 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-[var(--border)] flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-[var(--ratist-red)]" />
        <h3 className="text-sm font-semibold text-white">Moderation</h3>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setTab("queue")}
            className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
              tab === "queue"
                ? "border-[var(--ratist-red)] bg-[var(--ratist-red)]/10 text-white"
                : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--foreground-muted)] hover:text-white"
            }`}
          >
            Queue{pendingSuggestions.length > 0 ? ` (${pendingSuggestions.length})` : ""}
          </button>
          <button
            onClick={() => setTab("submitters")}
            className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
              tab === "submitters"
                ? "border-[var(--ratist-red)] bg-[var(--ratist-red)]/10 text-white"
                : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--foreground-muted)] hover:text-white"
            }`}
          >
            Submitters
          </button>
        </div>
      </div>
      {tab === "queue" ? (
        pendingSuggestions.length === 0 ? (
          <p className="px-5 py-6 text-xs text-[var(--foreground-muted)] italic text-center">
            No pending community suggestions.
          </p>
        ) : (
          <PendingSuggestionsList
            suggestions={pendingSuggestions}
            characters={characters}
            mediaType={mediaType}
            getToken={getToken}
            onResolved={onResolved}
          />
        )
      ) : (
        <div className="p-4">
          <CompanionSubmittersTable companionId={companionId} />
        </div>
      )}
    </section>
  );
}

// ── PendingSuggestionsPanel ─────────────────────────────────────────────
// Admin-facing inline review of community suggestions for this companion.
// Renders a readable preview of each suggestion's action + payload plus
// approve / dismiss buttons. Hitting approve triggers the existing
// suggestion-apply pipeline (writes the payload into live data).

function payloadLines(payload: Record<string, unknown> | null): Array<{ label: string; value: string }> {
  if (!payload) return [];
  const out: Array<{ label: string; value: string }> = [];
  const stringify = (v: unknown): string | null => {
    if (v === null || v === undefined) return null;
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    try { return JSON.stringify(v); } catch { return null; }
  };
  for (const [key, value] of Object.entries(payload)) {
    const s = stringify(value);
    if (s !== null && s.length > 0) out.push({ label: key, value: s });
  }
  return out;
}

function PendingSuggestionsList({
  suggestions, characters, mediaType, getToken, onResolved,
}: {
  suggestions: SuggestionRow[];
  characters: Character[];
  mediaType: "movie" | "tv";
  getToken: () => Promise<string>;
  onResolved: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function resolve(id: string, status: "approved" | "dismissed") {
    setBusy(id);
    try {
      const token = await getToken();
      await fetch(`/api/admin/watch-companion/suggestions/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      onResolved();
    } finally {
      setBusy(null);
    }
  }

  async function nuke(id: string) {
    if (!confirm("Delete this suggestion outright? The submitter won't see it again.")) return;
    setBusy(id);
    try {
      const token = await getToken();
      await fetch(`/api/admin/watch-companion/suggestions/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      onResolved();
    } finally {
      setBusy(null);
    }
  }

  const charName = (cid: string) => characters.find((c) => c.id === cid)?.name ?? "(unknown)";

  return (
    <ul className="divide-y divide-[var(--border)]/40">
        {suggestions.map((s) => {
          const targetName = s.targetId
            ? (s.targetType === "character" ? charName(s.targetId) :
               s.targetType === "fact" ? "(fact)" :
               s.targetType === "relationship" ? "(relationship)" :
               s.targetType === "timeline" ? "(timeline event)" :
               s.targetType === "glossary" ? "(glossary term)" : s.targetType)
            : null;
          const lines = payloadLines(s.payload);
          return (
            <li key={s.id} className="px-5 py-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap text-[11px] text-[var(--foreground-muted)]">
                <span className="px-1.5 py-0.5 rounded bg-[var(--ratist-red)]/10 text-[var(--ratist-red)] font-semibold uppercase tracking-wider">
                  {s.action} {s.targetType}
                </span>
                {targetName && <span>— {targetName}</span>}
                <span className="ml-auto">by {s.submitter.name} · {new Date(s.createdAt).toLocaleDateString()}</span>
              </div>
              {s.rationale && (
                <p className="text-sm text-white italic leading-relaxed">&ldquo;{s.rationale}&rdquo;</p>
              )}
              {lines.length > 0 && (
                <dl className="text-xs text-[var(--foreground-muted)] grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                  {lines.map(({ label, value }) => (
                    <div key={label} className="contents">
                      <dt className="text-[10px] uppercase tracking-wider font-semibold mt-0.5">{label}</dt>
                      <dd className="text-white break-words">
                        {label === "visibleAfter" ? (() => {
                          try {
                            const va = JSON.parse(value) as { seconds?: number; season?: number; episode?: number };
                            if (mediaType === "movie" && typeof va.seconds === "number") {
                              const m = Math.floor(va.seconds / 60);
                              const sec = va.seconds % 60;
                              return `${m}:${String(sec).padStart(2, "0")}`;
                            }
                            if (mediaType === "tv") return `S${va.season ?? "?"}E${va.episode ?? "?"}${typeof va.seconds === "number" ? ` @ ${va.seconds}s` : ""}`;
                            return value;
                          } catch { return value; }
                        })() : value}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => resolve(s.id, "approved")}
                  disabled={busy === s.id}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-[var(--ratist-red)] text-white rounded text-xs font-semibold hover:bg-[var(--ratist-red)]/80 disabled:opacity-50"
                ><Check className="w-3 h-3" /> Approve + apply</button>
                <button
                  onClick={() => resolve(s.id, "dismissed")}
                  disabled={busy === s.id}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-[var(--surface-2)] border border-[var(--border)] text-[var(--foreground-muted)] rounded text-xs hover:text-white disabled:opacity-50"
                ><X className="w-3 h-3" /> Dismiss</button>
                <button
                  onClick={() => nuke(s.id)}
                  disabled={busy === s.id}
                  className="ml-auto inline-flex items-center gap-1 px-2 py-1 text-[10px] text-[var(--foreground-muted)] hover:text-red-400 disabled:opacity-50"
                  title="Delete suggestion permanently"
                ><Trash2 className="w-3 h-3" /></button>
              </div>
            </li>
          );
        })}
      </ul>
  );
}

// ── CompanionRecapEditor ────────────────────────────────────────────────
// Two-textarea editor that overwrites the recap slot in the companion's
// recaps JSON without triggering a regen. Per-season for TV. The field
// shapes mirror what the AI pipeline writes — see lib/ai/watch-
// companion-chunks/recap.ts and the persistDraft path in
// watch-companion-generate.ts.

function CompanionRecapEditor({
  companionId, mediaType, recaps, seasonsGenerated, getToken, onSaved,
}: {
  companionId: string;
  mediaType: "movie" | "tv";
  recaps: Record<string, unknown>;
  seasonsGenerated: number[];
  getToken: () => Promise<string>;
  onSaved: () => void;
}) {
  const isTv = mediaType === "tv";
  const [season, setSeason] = useState<number>(seasonsGenerated[0] ?? 1);

  // Resolve the slot for the currently-selected season (TV) or the
  // single movie slot. Tolerates the legacy shape where slots were
  // bare strings instead of { installment, series } objects.
  function readSlot(): { installment: string; series: string } {
    const empty = { installment: "", series: "" };
    let raw: unknown;
    if (isTv) {
      raw = recaps[String(season)];
    } else {
      raw = (recaps as { current?: unknown }).current;
    }
    if (!raw) return empty;
    if (typeof raw === "string") return { installment: raw, series: "" };
    if (typeof raw === "object" && !Array.isArray(raw)) {
      const r = raw as { installment?: unknown; series?: unknown; text?: unknown };
      return {
        installment: typeof r.installment === "string" ? r.installment : typeof r.text === "string" ? r.text : "",
        series: typeof r.series === "string" ? r.series : "",
      };
    }
    return empty;
  }

  const [installmentDraft, setInstallmentDraft] = useState("");
  const [seriesDraft, setSeriesDraft] = useState("");
  const [savingKind, setSavingKind] = useState<"installment" | "series" | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<"installment" | "series" | null>(null);

  // Re-hydrate the textareas whenever the season changes (or the
  // companion data refetches — recaps reference identity flips on
  // refetch). Keeping them as controlled state lets the admin edit
  // without losing keystrokes when the parent rerenders.
  useEffect(() => {
    const slot = readSlot();
    setInstallmentDraft(slot.installment);
    setSeriesDraft(slot.series);
    setError("");
    setSaved(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season, recaps]);

  async function save(kind: "installment" | "series", text: string) {
    setSavingKind(kind);
    setError("");
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/watch-companion/${companionId}/recap`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          season: isTv ? season : null,
          // Empty string = clear the slot; the API maps this to delete.
          text: text.trim().length === 0 ? null : text.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error ?? "Save failed");
        return;
      }
      setSaved(kind);
      setTimeout(() => setSaved(null), 1500);
      onSaved();
    } catch {
      setError("Network error — try again");
    } finally {
      setSavingKind(null);
    }
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <h3 className="text-sm font-semibold text-white">Recap</h3>
        {isTv && seasonsGenerated.length > 1 && (
          <select
            value={season}
            onChange={(e) => setSeason(parseInt(e.target.value, 10))}
            className="bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[var(--ratist-red)]"
          >
            {seasonsGenerated.map((n) => (
              <option key={n} value={n}>Season {n}</option>
            ))}
          </select>
        )}
        <span className="text-[10px] text-[var(--foreground-muted)]">
          Edits write directly — no regen, no token cost.
        </span>
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-wider font-semibold text-[var(--foreground-muted)] mb-1 block">
          Installment recap {isTv ? `(Season ${season} only)` : "(this movie)"}
        </label>
        <textarea
          value={installmentDraft}
          onChange={(e) => setInstallmentDraft(e.target.value)}
          rows={6}
          maxLength={4000}
          placeholder="150-250 words on the events of this installment alone."
          className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1.5 text-sm text-white placeholder:text-[var(--foreground-muted)]/50 focus:outline-none focus:border-[var(--ratist-red)] resize-y"
        />
        <div className="flex items-center justify-end gap-2 mt-1.5 text-[10px] text-[var(--foreground-muted)]">
          <span>{installmentDraft.length}/4000</span>
          {saved === "installment" && <span className="text-green-400">Saved</span>}
          <button
            type="button"
            onClick={() => save("installment", installmentDraft)}
            disabled={savingKind !== null}
            className="px-2.5 py-1 rounded bg-[var(--ratist-red)] text-white text-[11px] font-semibold hover:bg-[var(--ratist-red)]/80 disabled:opacity-50"
          >
            {savingKind === "installment" ? "Saving…" : "Save installment"}
          </button>
        </div>
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-wider font-semibold text-[var(--foreground-muted)] mb-1 block">
          Series-so-far recap {isTv ? `(through Season ${season})` : "(franchise through this film)"}
        </label>
        <textarea
          value={seriesDraft}
          onChange={(e) => setSeriesDraft(e.target.value)}
          rows={6}
          maxLength={4000}
          placeholder={isTv
            ? `150-250 words covering every season through Season ${season}. Leave blank for Season 1.`
            : "150-250 words covering every prior film + this one. Leave blank for standalone movies."}
          className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1.5 text-sm text-white placeholder:text-[var(--foreground-muted)]/50 focus:outline-none focus:border-[var(--ratist-red)] resize-y"
        />
        <div className="flex items-center justify-end gap-2 mt-1.5 text-[10px] text-[var(--foreground-muted)]">
          <span>{seriesDraft.length}/4000</span>
          {saved === "series" && <span className="text-green-400">Saved</span>}
          <button
            type="button"
            onClick={() => save("series", seriesDraft)}
            disabled={savingKind !== null}
            className="px-2.5 py-1 rounded bg-[var(--ratist-red)] text-white text-[11px] font-semibold hover:bg-[var(--ratist-red)]/80 disabled:opacity-50"
          >
            {savingKind === "series" ? "Saving…" : "Save series"}
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

// ── FactionEditor ───────────────────────────────────────────────────────
// Bulk rename / clear a faction/group across every character that shares
// the name. Surfaced above the characters list so admins can consolidate
// AI-chosen group names without editing each character.

function FactionEditor({ characters, companionId, getToken, onRenamed }: {
  characters: Character[];
  companionId: string;
  getToken: () => Promise<string>;
  onRenamed: () => void;
}) {
  const groups = Array.from(new Set(characters.map((c) => c.group).filter((g): g is string => !!g))).sort();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  // Create-a-new-faction flow state. Null when closed.
  const [creating, setCreating] = useState<{ name: string; selectedIds: Set<string> } | null>(null);

  async function submitRename(oldGroup: string) {
    const token = await getToken();
    await fetch(`/api/admin/watch-companion/${companionId}/rename-group`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ oldGroup, newGroup: newName }),
    });
    setRenaming(null);
    setNewName("");
    onRenamed();
  }

  async function submitCreate() {
    if (!creating || creating.name.trim().length === 0 || creating.selectedIds.size === 0) return;
    const token = await getToken();
    await fetch(`/api/admin/watch-companion/${companionId}/rename-group`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ group: creating.name.trim(), characterIds: Array.from(creating.selectedIds) }),
    });
    setCreating(null);
    onRenamed();
  }

  return (
    <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-[var(--border)] flex items-center gap-2">
        <Tag className="w-4 h-4 text-[var(--ratist-red)]" />
        <h3 className="text-sm font-semibold text-white">Factions ({groups.length})</h3>
        <button
          onClick={() => setCreating({ name: "", selectedIds: new Set() })}
          className="ml-auto inline-flex items-center gap-1 text-xs text-[var(--foreground-muted)] hover:text-white"
          title="Create a new faction and assign characters"
        ><Plus className="w-3.5 h-3.5" /> New faction</button>
      </div>
      {groups.length === 0 && !creating ? (
        <p className="px-5 py-3 text-xs text-[var(--foreground-muted)] italic">No factions assigned yet.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]/40">
          {groups.map((g) => {
            const count = characters.filter((c) => c.group === g).length;
            const isRenaming = renaming === g;
            return (
              <li key={g} className="px-5 py-2 text-sm text-white flex items-center gap-2">
                <span className="font-medium">{g}</span>
                <span className="text-[10px] text-[var(--foreground-muted)]">{count} character{count === 1 ? "" : "s"}</span>
                {isRenaming ? (
                  <>
                    <input
                      autoFocus
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="New name (blank to clear)"
                      className="ml-auto bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-0.5 text-xs text-white focus:outline-none focus:border-[var(--ratist-red)]"
                    />
                    <button onClick={() => submitRename(g)} className="px-2 py-0.5 bg-[var(--ratist-red)] text-white rounded text-[10px] font-semibold"><Check className="w-3 h-3" /></button>
                    <button onClick={() => { setRenaming(null); setNewName(""); }} className="px-2 py-0.5 bg-[var(--surface-2)] border border-[var(--border)] text-[var(--foreground-muted)] rounded text-[10px]"><X className="w-3 h-3" /></button>
                  </>
                ) : (
                  <button
                    onClick={() => { setRenaming(g); setNewName(g); }}
                    className="ml-auto inline-flex items-center gap-1 text-xs text-[var(--foreground-muted)] hover:text-white"
                  >
                    <Pencil className="w-3 h-3" /> Rename
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {creating && (
        <div className="px-5 py-3 border-t border-[var(--border)] bg-[var(--surface-2)]/30 space-y-2">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={creating.name}
              onChange={(e) => setCreating({ ...creating, name: e.target.value })}
              placeholder="Faction name (e.g. Waystar)"
              className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)]"
            />
            <button
              onClick={submitCreate}
              disabled={creating.name.trim().length === 0 || creating.selectedIds.size === 0}
              className="px-3 py-1 bg-[var(--ratist-red)] text-white rounded text-xs font-semibold disabled:opacity-40"
            >Create</button>
            <button onClick={() => setCreating(null)} className="px-2 py-1 text-[var(--foreground-muted)] hover:text-white text-xs">Cancel</button>
          </div>
          <p className="text-[10px] text-[var(--foreground-muted)]">Pick the characters that belong to this faction:</p>
          <div className="flex flex-wrap gap-1 max-h-48 overflow-y-auto">
            {characters.map((c) => {
              const selected = creating.selectedIds.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    const next = new Set(creating.selectedIds);
                    if (selected) next.delete(c.id); else next.add(c.id);
                    setCreating({ ...creating, selectedIds: next });
                  }}
                  className={`px-2 py-0.5 text-[11px] rounded-full border transition-colors ${
                    selected
                      ? "bg-[var(--ratist-red)] border-[var(--ratist-red)] text-white"
                      : "bg-[var(--surface-2)] border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"
                  }`}
                >
                  {c.name}
                  {c.group && c.group !== creating.name.trim() && (
                    <span className="text-[9px] text-[var(--foreground-muted)]/70 ml-1">(currently {c.group})</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
