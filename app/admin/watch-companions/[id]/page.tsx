"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { ArrowLeft, Eye, EyeOff, Trash2, Sparkles, RefreshCcw, Users, Link2, Clock, BookOpen, Pencil, Check, X, Plus, Tag } from "lucide-react";
import CompanionItemEditor, { type EditorDraft } from "@/components/admin/CompanionItemEditor";

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
interface Character {
  id: string; name: string; actorName: string | null; baseDescription: string;
  group: string | null; visibleAfter: VisibleAfter; facts: Fact[];
  seasonNumber: number | null;
  actors: ActorRow[];
  nameAliases: AliasRow[];
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
interface Companion {
  id: string; tmdbId: number; mediaType: "movie" | "tv";
  title: string; status: "draft" | "published"; seasonsGenerated: number[];
  runtimeSeconds: number | null;
  lastGeneratedAt: string | null; publishedAt: string | null;
  characters: Character[]; relationships: Relationship[];
  timeline: TimelineEvent[]; glossary: GlossaryTerm[];
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
        persist: "Saving…",
      };

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

  // Apply the admin's season filter. Movies have seasonNumber: null on every
  // row and the filter stays as "all" implicitly.
  const matchesSeason = <T extends { seasonNumber: number | null }>(row: T) =>
    seasonFilter === "all" || row.seasonNumber === seasonFilter;
  const filteredCharacters = companion.characters.filter(matchesSeason);
  const filteredRelationships = companion.relationships.filter(matchesSeason);
  const filteredTimeline = companion.timeline.filter(matchesSeason);
  const filteredGlossary = companion.glossary.filter(matchesSeason);
  const sortedSeasons = [...companion.seasonsGenerated].sort((a, b) => a - b);

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/watch-companions" className="text-[var(--foreground-muted)] hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h2 className="text-lg font-semibold text-white">{companion.title}</h2>
        <span className="text-xs text-[var(--foreground-muted)]">
          {companion.mediaType === "tv" ? "TV" : "Movie"} · TMDB {companion.tmdbId}
          {companion.mediaType === "tv" && companion.seasonsGenerated.length > 0 && ` · S${companion.seasonsGenerated.join(", S")}`}
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
          {/* Factions — quick bulk rename for all characters sharing a group */}
          <FactionEditor
            characters={companion.characters}
            companionId={companion.id}
            getToken={getToken}
            onRenamed={refetch}
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
                      <span>appears {fmtVisible(c.visibleAfter, companion.mediaType)}</span>
                      <button
                        onClick={() => setEditorDraft({
                          type: "character",
                          id: c.id,
                          data: {
                            name: c.name,
                            baseDescription: c.baseDescription,
                            group: c.group ?? "",
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

  async function submit(oldGroup: string) {
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

  if (groups.length === 0) return null;

  return (
    <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-[var(--border)] flex items-center gap-2">
        <Tag className="w-4 h-4 text-[var(--ratist-red)]" />
        <h3 className="text-sm font-semibold text-white">Factions ({groups.length})</h3>
      </div>
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
                  <button onClick={() => submit(g)} className="px-2 py-0.5 bg-[var(--ratist-red)] text-white rounded text-[10px] font-semibold"><Check className="w-3 h-3" /></button>
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
    </section>
  );
}
