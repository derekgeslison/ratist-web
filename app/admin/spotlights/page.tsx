"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Plus, Edit2, Trash2, Eye, EyeOff, X } from "lucide-react";

interface Spotlight {
  id: string;
  title: string;
  description: string | null;
  linkUrl: string;
  linkLabel: string;
  imageUrl: string | null;
  type: string;
  isActive: boolean;
  sortOrder: number;
}

const TYPE_OPTIONS = [
  { value: "blog", label: "Blog Post" },
  { value: "punch_and_judy", label: "Two Thumbs" },
  { value: "feature", label: "New Feature" },
  { value: "announcement", label: "Announcement (top banner)" },
  { value: "general", label: "General" },
];

export default function SpotlightsPage() {
  const { user } = useAuth();
  const [spotlights, setSpotlights] = useState<Spotlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Spotlight | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", linkUrl: "", linkLabel: "Read more", imageUrl: "", type: "general" });
  const [saving, setSaving] = useState(false);

  async function fetchSpotlights() {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch("/api/admin/spotlights?admin=1", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      setSpotlights(data.spotlights ?? []);
    }
    setLoading(false);
  }

  useEffect(() => { fetchSpotlights(); }, [user]);

  function openCreate() {
    setForm({ title: "", description: "", linkUrl: "", linkLabel: "Read more", imageUrl: "", type: "general" });
    setCreating(true);
    setEditing(null);
  }

  function openEdit(s: Spotlight) {
    setForm({ title: s.title, description: s.description ?? "", linkUrl: s.linkUrl, linkLabel: s.linkLabel, imageUrl: s.imageUrl ?? "", type: s.type });
    setEditing(s);
    setCreating(false);
  }

  async function save() {
    if (!user || !form.title.trim() || !form.linkUrl.trim()) return;
    setSaving(true);
    const token = await user.getIdToken();

    if (editing) {
      await fetch("/api/admin/spotlights", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id: editing.id, ...form }),
      });
    } else {
      await fetch("/api/admin/spotlights", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    }

    setEditing(null);
    setCreating(false);
    setSaving(false);
    await fetchSpotlights();
  }

  async function toggleActive(s: Spotlight) {
    if (!user) return;
    const token = await user.getIdToken();
    await fetch("/api/admin/spotlights", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id: s.id, isActive: !s.isActive }),
    });
    await fetchSpotlights();
  }

  async function deleteSpotlight(s: Spotlight) {
    if (!user || !confirm(`Delete "${s.title}"?`)) return;
    const token = await user.getIdToken();
    await fetch(`/api/admin/spotlights?id=${s.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    await fetchSpotlights();
  }

  const showForm = creating || editing;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Homepage Spotlights</h2>
          <p className="text-sm text-[var(--foreground-muted)]">Highlight content on the homepage.</p>
        </div>
        {!showForm && (
          <button onClick={openCreate} className="flex items-center gap-1.5 px-4 py-2 bg-[var(--ratist-red)] text-white rounded-lg text-sm font-semibold hover:bg-[var(--ratist-red-hover)] transition-colors">
            <Plus className="w-4 h-4" /> New Spotlight
          </button>
        )}
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">{editing ? "Edit Spotlight" : "New Spotlight"}</h3>
            <button onClick={() => { setCreating(false); setEditing(null); }}><X className="w-5 h-5 text-[var(--foreground-muted)]" /></button>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-[var(--foreground-muted)] mb-1 block">Title *</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)]" />
            </div>
            <div>
              <label className="text-xs text-[var(--foreground-muted)] mb-1 block">Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)]">
                {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-[var(--foreground-muted)] mb-1 block">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)] resize-none" />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-[var(--foreground-muted)] mb-1 block">Link URL *</label>
              <input value={form.linkUrl} onChange={(e) => setForm({ ...form, linkUrl: e.target.value })} placeholder="/blog/my-post" className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]" />
            </div>
            <div>
              <label className="text-xs text-[var(--foreground-muted)] mb-1 block">Link Label</label>
              <input value={form.linkLabel} onChange={(e) => setForm({ ...form, linkLabel: e.target.value })} className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)]" />
            </div>
          </div>
          <div>
            <label className="text-xs text-[var(--foreground-muted)] mb-1 block">Image URL (optional)</label>
            <input value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://..." className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]" />
          </div>
          <button onClick={save} disabled={saving || !form.title.trim() || !form.linkUrl.trim()} className="px-5 py-2 bg-[var(--ratist-red)] text-white rounded-lg text-sm font-semibold hover:bg-[var(--ratist-red-hover)] transition-colors disabled:opacity-50">
            {saving ? "Saving…" : editing ? "Update" : "Create"}
          </button>
        </div>
      )}

      {/* List */}
      {loading ? (
        <p className="text-[var(--foreground-muted)] text-sm py-8 text-center">Loading…</p>
      ) : spotlights.length === 0 ? (
        <p className="text-[var(--foreground-muted)] text-sm py-8 text-center">No spotlights yet.</p>
      ) : (
        <div className="space-y-2">
          {spotlights.map((s) => (
            <div key={s.id} className={`flex items-center gap-4 p-4 rounded-xl border transition-colors ${s.isActive ? "bg-[var(--surface)] border-[var(--border)]" : "bg-[var(--surface)]/50 border-[var(--border)]/50 opacity-60"}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-semibold text-white truncate">{s.title}</p>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--foreground-muted)] border border-[var(--border)]">
                    {TYPE_OPTIONS.find((o) => o.value === s.type)?.label ?? s.type}
                  </span>
                  {s.isActive ? (
                    <span className="text-[10px] text-green-400">Active</span>
                  ) : (
                    <span className="text-[10px] text-[var(--foreground-muted)]">Inactive</span>
                  )}
                </div>
                {s.description && <p className="text-xs text-[var(--foreground-muted)] truncate">{s.description}</p>}
                <p className="text-xs text-[var(--foreground-muted)] mt-0.5">{s.linkUrl}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => toggleActive(s)} className="p-1.5 rounded text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--surface-2)] transition-colors" title={s.isActive ? "Deactivate" : "Activate"}>
                  {s.isActive ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                <button onClick={() => openEdit(s)} className="p-1.5 rounded text-[var(--foreground-muted)] hover:text-white hover:bg-[var(--surface-2)] transition-colors" title="Edit">
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => deleteSpotlight(s)} className="p-1.5 rounded text-[var(--foreground-muted)] hover:text-red-400 hover:bg-[var(--surface-2)] transition-colors" title="Delete">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
