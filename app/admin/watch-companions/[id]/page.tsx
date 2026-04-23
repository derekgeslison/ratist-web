"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { ArrowLeft, Eye, EyeOff, Trash2, Sparkles, RefreshCcw, Users, Link2, Clock, BookOpen } from "lucide-react";

interface VisibleAfter { seconds?: number; season?: number; episode?: number }

interface Fact { id: string; fact: string; factType: string; visibleAfter: VisibleAfter }
interface Character {
  id: string; name: string; actorName: string | null; baseDescription: string;
  group: string | null; visibleAfter: VisibleAfter; facts: Fact[];
}
interface Relationship {
  id: string; relationshipType: string; label: string; directed: boolean;
  fromCharacterId: string; toCharacterId: string; visibleAfter: VisibleAfter;
}
interface TimelineEvent {
  id: string; description: string; importance: number; characterIds: string[]; visibleAfter: VisibleAfter;
}
interface GlossaryTerm {
  id: string; term: string; definition: string; category: string | null; visibleAfter: VisibleAfter;
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

export default function ReviewCompanionPage() {
  const { user } = useAuth();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [companion, setCompanion] = useState<Companion | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
    const season = companion.mediaType === "tv"
      ? parseInt(prompt("Season to regenerate?", String(companion.seasonsGenerated[companion.seasonsGenerated.length - 1] ?? 1)) ?? "", 10)
      : null;
    if (companion.mediaType === "tv" && (!Number.isFinite(season!) || season! < 1)) return;

    setSaving(true);
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
    if (res.ok) {
      window.location.reload();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(`Regeneration failed: ${data.error ?? res.status}`);
      setSaving(false);
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Characters */}
          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--border)] flex items-center gap-2">
              <Users className="w-4 h-4 text-[var(--ratist-red)]" />
              <h3 className="text-sm font-semibold text-white">Characters ({companion.characters.length})</h3>
            </div>
            <div className="divide-y divide-[var(--border)]/40">
              {companion.characters.map((c) => (
                <div key={c.id} className="px-5 py-3">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <div>
                      <p className="text-sm font-semibold text-white">{c.name}</p>
                      {c.actorName && <p className="text-xs text-[var(--foreground-muted)]">played by {c.actorName}</p>}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-[var(--foreground-muted)] shrink-0">
                      {c.group && <span className="px-1.5 py-0.5 rounded bg-[var(--surface-2)]">{c.group}</span>}
                      <span>appears {fmtVisible(c.visibleAfter, companion.mediaType)}</span>
                    </div>
                  </div>
                  <p className="text-sm text-[var(--foreground-muted)] leading-relaxed">{c.baseDescription}</p>
                  {c.facts.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {c.facts.map((f) => (
                        <li key={f.id} className="text-xs text-[var(--foreground-muted)] flex items-start gap-2">
                          <span className="text-[10px] uppercase tracking-wider text-[var(--ratist-red)] font-semibold shrink-0 mt-0.5">{f.factType.replace(/_/g, " ")}</span>
                          <span>{f.fact}</span>
                          <span className="ml-auto shrink-0">{fmtVisible(f.visibleAfter, companion.mediaType)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Relationships */}
          {companion.relationships.length > 0 && (
            <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-[var(--border)] flex items-center gap-2">
                <Link2 className="w-4 h-4 text-[var(--ratist-red)]" />
                <h3 className="text-sm font-semibold text-white">Relationships ({companion.relationships.length})</h3>
              </div>
              <ul className="divide-y divide-[var(--border)]/40">
                {companion.relationships.map((r) => (
                  <li key={r.id} className="px-5 py-2 text-sm text-white flex items-center gap-2">
                    <span className="font-medium">{charName(r.fromCharacterId)}</span>
                    <span className="text-[var(--foreground-muted)] italic text-xs">{r.label}</span>
                    <span className="font-medium">{charName(r.toCharacterId)}</span>
                    <span className="ml-auto text-[10px] text-[var(--foreground-muted)]">{fmtVisible(r.visibleAfter, companion.mediaType)} · {r.relationshipType}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Timeline */}
          {companion.timeline.length > 0 && (
            <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-[var(--border)] flex items-center gap-2">
                <Clock className="w-4 h-4 text-[var(--ratist-red)]" />
                <h3 className="text-sm font-semibold text-white">Timeline events ({companion.timeline.length})</h3>
              </div>
              <ul className="divide-y divide-[var(--border)]/40">
                {companion.timeline.map((t) => (
                  <li key={t.id} className="px-5 py-2 text-sm text-white flex items-start gap-3">
                    <span className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wider shrink-0 mt-0.5 w-12">{fmtVisible(t.visibleAfter, companion.mediaType)}</span>
                    <span className="flex-1">{t.description}</span>
                    <span className="text-[10px] text-[var(--foreground-muted)] shrink-0 mt-0.5">★{t.importance}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Glossary */}
          {companion.glossary.length > 0 && (
            <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-[var(--border)] flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-[var(--ratist-red)]" />
                <h3 className="text-sm font-semibold text-white">Glossary ({companion.glossary.length})</h3>
              </div>
              <ul className="divide-y divide-[var(--border)]/40">
                {companion.glossary.map((g) => (
                  <li key={g.id} className="px-5 py-2 text-sm">
                    <div className="flex items-baseline gap-2">
                      <span className="font-semibold text-white">{g.term}</span>
                      {g.category && <span className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wider">{g.category}</span>}
                      <span className="ml-auto text-[10px] text-[var(--foreground-muted)]">{fmtVisible(g.visibleAfter, companion.mediaType)}</span>
                    </div>
                    <p className="text-[var(--foreground-muted)] mt-0.5">{g.definition}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
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
    </div>
  );
}
