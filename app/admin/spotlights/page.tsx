"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { Plus, Edit2, Trash2, Eye, EyeOff, X, Upload, GripVertical, AlertTriangle } from "lucide-react";

interface Spotlight {
  id: string;
  title: string;
  description: string | null;
  linkUrl: string;
  linkLabel: string;
  imageUrl: string | null;
  type: string;
  placement: string;
  style: string;
  bgColor: string | null;
  audience: string;
  startDate: string | null;
  endDate: string | null;
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

const PLACEMENT_OPTIONS = [
  { value: "homepage", label: "Homepage" },
  { value: "for_you", label: "For You" },
  { value: "movies", label: "Movies" },
  { value: "community", label: "Community" },
  { value: "all", label: "All Pages" },
];

const STYLE_OPTIONS = [
  { value: "subtle", label: "Subtle" },
  { value: "bold", label: "Bold" },
  { value: "gradient", label: "Gradient" },
];

const AUDIENCE_OPTIONS = [
  { value: "everyone", label: "Everyone" },
  { value: "signed_in", label: "Signed-in users" },
  { value: "signed_out", label: "Signed-out users" },
  { value: "non_subscriber", label: "Non-subscribers" },
  { value: "new_user", label: "New users (< 7 days)" },
];

const DEFAULT_FORM = {
  title: "", description: "", linkUrl: "", linkLabel: "Read more",
  imageUrl: "", type: "general", placement: "homepage", style: "subtle",
  bgColor: "", audience: "everyone", startDate: "", endDate: "",
};

export default function SpotlightsPage() {
  const { user } = useAuth();
  const [spotlights, setSpotlights] = useState<Spotlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Spotlight | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragItem = useRef<number | null>(null);
  const dragOver = useRef<number | null>(null);

  const fetchSpotlights = useCallback(async () => {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch("/api/admin/spotlights?admin=1", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      setSpotlights(data.spotlights ?? []);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchSpotlights(); }, [fetchSpotlights]);

  function openCreate() {
    setForm(DEFAULT_FORM);
    setCreating(true);
    setEditing(null);
  }

  function openEdit(s: Spotlight) {
    setForm({
      title: s.title,
      description: s.description ?? "",
      linkUrl: s.linkUrl,
      linkLabel: s.linkLabel,
      imageUrl: s.imageUrl ?? "",
      type: s.type,
      placement: s.placement ?? "homepage",
      style: s.style ?? "subtle",
      bgColor: s.bgColor ?? "",
      audience: s.audience ?? "everyone",
      startDate: s.startDate ? s.startDate.slice(0, 16) : "",
      endDate: s.endDate ? s.endDate.slice(0, 16) : "",
    });
    setEditing(s);
    setCreating(false);
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 5 * 1024 * 1024) { alert("Image must be under 5MB"); return; }
    setUploading(true);
    try {
      const token = await user.getIdToken();
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
      if (res.ok) {
        const { url } = await res.json();
        setForm((f) => ({ ...f, imageUrl: url }));
      }
    } catch { /* ignore */ }
    setUploading(false);
    e.target.value = "";
  }

  async function save() {
    if (!user || !form.title.trim() || !form.linkUrl.trim()) return;
    setSaving(true);
    const token = await user.getIdToken();
    const payload = {
      ...form,
      imageUrl: form.imageUrl || null,
      bgColor: form.bgColor || null,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
    };

    if (editing) {
      await fetch("/api/admin/spotlights", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id: editing.id, ...payload }),
      });
    } else {
      await fetch("/api/admin/spotlights", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

  async function handleDrop() {
    if (dragItem.current === null || dragOver.current === null || dragItem.current === dragOver.current) return;
    const reordered = [...spotlights];
    const [moved] = reordered.splice(dragItem.current, 1);
    reordered.splice(dragOver.current, 0, moved);
    setSpotlights(reordered);
    dragItem.current = null;
    dragOver.current = null;

    // Persist new order
    if (!user) return;
    const token = await user.getIdToken();
    await Promise.all(
      reordered.map((s, i) =>
        fetch("/api/admin/spotlights", {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ id: s.id, sortOrder: i }),
        })
      )
    );
  }

  const showForm = creating || editing;
  const isAnnouncement = form.type === "announcement";

  const input = "w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)]";
  const label = "text-xs text-[var(--foreground-muted)] mb-1 block";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Spotlights</h2>
          <p className="text-sm text-[var(--foreground-muted)]">Promote content across the site. Drag to reorder.</p>
        </div>
        {!showForm && (
          <button onClick={openCreate} className="flex items-center gap-1.5 px-4 py-2 bg-[var(--ratist-red)] text-white rounded-lg text-sm font-semibold hover:bg-[var(--ratist-red-hover)] transition-colors">
            <Plus className="w-4 h-4" /> New Spotlight
          </button>
        )}
      </div>

      {/* Create / Edit Form */}
      {showForm && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">{editing ? "Edit Spotlight" : "New Spotlight"}</h3>
            <button onClick={() => { setCreating(false); setEditing(null); }}><X className="w-5 h-5 text-[var(--foreground-muted)]" /></button>
          </div>

          {/* Row 1: Title + Type */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={label}>Title *</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={input} />
            </div>
            <div>
              <label className={label}>Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={input}>
                {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className={label}>Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className={`${input} resize-none`} />
          </div>

          {/* Row 2: Link URL + Link Label */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={label}>Link URL *</label>
              <input value={form.linkUrl} onChange={(e) => setForm({ ...form, linkUrl: e.target.value })} placeholder="/blog/my-post" className={`${input} placeholder:text-[var(--foreground-muted)]`} />
            </div>
            <div>
              <label className={label}>Link Label</label>
              <input value={form.linkLabel} onChange={(e) => setForm({ ...form, linkLabel: e.target.value })} className={input} />
            </div>
          </div>

          {/* Image */}
          <div>
            <label className={label}>Image</label>
            {isAnnouncement && (
              <p className="text-[10px] text-yellow-400/80 flex items-center gap-1 mb-1.5">
                <AlertTriangle className="w-3 h-3" /> Images are not displayed for the top banner (Announcement) type.
              </p>
            )}
            <div className="flex items-center gap-2">
              <input value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="Image URL or upload" className={`flex-1 ${input} placeholder:text-[var(--foreground-muted)]`} />
              <button onClick={() => fileRef.current?.click()} disabled={uploading} className="flex items-center gap-1.5 px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-xs text-[var(--foreground-muted)] hover:text-white hover:border-[var(--ratist-red)] transition-colors disabled:opacity-50">
                <Upload className="w-3.5 h-3.5" /> {uploading ? "Uploading..." : "Upload"}
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </div>
            {form.imageUrl && !isAnnouncement && (
              <div className="mt-2 relative inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={form.imageUrl} alt="" className="h-16 rounded-lg object-cover" />
                <button onClick={() => setForm({ ...form, imageUrl: "" })} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-black/80 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600 transition-colors">&times;</button>
              </div>
            )}
          </div>

          {/* Row 3: Placement + Style + Color */}
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className={label}>Placement</label>
              <select value={form.placement} onChange={(e) => setForm({ ...form, placement: e.target.value })} className={input}>
                {PLACEMENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Style</label>
              <select value={form.style} onChange={(e) => setForm({ ...form, style: e.target.value })} className={input}>
                {STYLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Accent Color</label>
              <div className="flex items-center gap-2">
                <input type="color" value={form.bgColor || "#CC0033"} onChange={(e) => setForm({ ...form, bgColor: e.target.value })} className="w-8 h-8 rounded border border-[var(--border)] bg-transparent cursor-pointer" />
                <input value={form.bgColor} onChange={(e) => setForm({ ...form, bgColor: e.target.value })} placeholder="Default (red)" className={`flex-1 ${input} placeholder:text-[var(--foreground-muted)]`} />
              </div>
            </div>
          </div>

          {/* Row 4: Audience + Schedule */}
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className={label}>Audience</label>
              <select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} className={input}>
                {AUDIENCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Start Date</label>
              <input type="datetime-local" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className={input} />
            </div>
            <div>
              <label className={label}>End Date</label>
              <input type="datetime-local" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className={input} />
            </div>
          </div>

          <button onClick={save} disabled={saving || !form.title.trim() || !form.linkUrl.trim()} className="px-5 py-2 bg-[var(--ratist-red)] text-white rounded-lg text-sm font-semibold hover:bg-[var(--ratist-red-hover)] transition-colors disabled:opacity-50">
            {saving ? "Saving..." : editing ? "Update" : "Create"}
          </button>
        </div>
      )}

      {/* List */}
      {loading ? (
        <p className="text-[var(--foreground-muted)] text-sm py-8 text-center">Loading...</p>
      ) : spotlights.length === 0 ? (
        <p className="text-[var(--foreground-muted)] text-sm py-8 text-center">No spotlights yet.</p>
      ) : (
        <div className="space-y-2">
          {spotlights.map((s, idx) => {
            const isScheduled = s.startDate || s.endDate;
            const now = new Date();
            const notYetStarted = s.startDate && new Date(s.startDate) > now;
            const expired = s.endDate && new Date(s.endDate) < now;

            return (
              <div
                key={s.id}
                draggable
                onDragStart={() => { dragItem.current = idx; }}
                onDragEnter={() => { dragOver.current = idx; }}
                onDragEnd={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                className={`flex items-center gap-3 p-4 rounded-xl border transition-colors cursor-grab active:cursor-grabbing ${
                  s.isActive && !expired
                    ? "bg-[var(--surface)] border-[var(--border)]"
                    : "bg-[var(--surface)]/50 border-[var(--border)]/50 opacity-60"
                }`}
              >
                <GripVertical className="w-4 h-4 text-[var(--foreground-muted)] shrink-0" />

                {s.imageUrl && s.type !== "announcement" && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <p className="text-sm font-semibold text-white truncate">{s.title}</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--foreground-muted)] border border-[var(--border)]">
                      {TYPE_OPTIONS.find((o) => o.value === s.type)?.label ?? s.type}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--foreground-muted)] border border-[var(--border)]">
                      {PLACEMENT_OPTIONS.find((o) => o.value === s.placement)?.label ?? s.placement}
                    </span>
                    {s.audience !== "everyone" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                        {AUDIENCE_OPTIONS.find((o) => o.value === s.audience)?.label ?? s.audience}
                      </span>
                    )}
                    {notYetStarted && <span className="text-[10px] text-yellow-400">Scheduled</span>}
                    {expired && <span className="text-[10px] text-red-400">Expired</span>}
                    {!notYetStarted && !expired && s.isActive && <span className="text-[10px] text-green-400">Active</span>}
                    {!s.isActive && <span className="text-[10px] text-[var(--foreground-muted)]">Inactive</span>}
                  </div>
                  {s.description && <p className="text-xs text-[var(--foreground-muted)] truncate">{s.description}</p>}
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-[var(--foreground-muted)]">
                    <span className="truncate">{s.linkUrl}</span>
                    {isScheduled && (
                      <span>
                        {s.startDate && new Date(s.startDate).toLocaleDateString()}
                        {s.startDate && s.endDate && " — "}
                        {s.endDate && new Date(s.endDate).toLocaleDateString()}
                      </span>
                    )}
                  </div>
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
            );
          })}
        </div>
      )}
    </div>
  );
}
