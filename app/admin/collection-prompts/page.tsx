"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Save, Loader2, Star, X, Sparkles } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface Prompt {
  id: string;
  title: string;
  description: string | null;
  activeFrom: string | null;
  activeTo: string | null;
  featured: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  collectionCount: number;
}

// "active right now" gate used to colour the status pill in the list.
function isActiveNow(p: Prompt): boolean {
  const now = Date.now();
  if (p.activeFrom && new Date(p.activeFrom).getTime() > now) return false;
  if (p.activeTo && new Date(p.activeTo).getTime() < now) return false;
  return true;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// Convert ISO → datetime-local input value ("YYYY-MM-DDTHH:mm").
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminCollectionPromptsPage() {
  const { user } = useAuth();
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/collection-prompts", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { setError("Failed to load prompts."); return; }
      const data = await res.json();
      setPrompts(data.prompts ?? []);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="py-20 text-center text-[var(--foreground-muted)]"><Loader2 className="w-6 h-6 animate-spin inline" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-5 h-5 text-[var(--ratist-red)]" />
            <h1 className="text-xl font-bold text-white">Collection prompts</h1>
          </div>
          <p className="text-sm text-[var(--foreground-muted)]">
            Themed prompts that surface in the community feed&apos;s Theme tab. Curators tag their collections to a prompt as a response.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 text-sm font-semibold text-white bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] rounded-full px-4 py-1.5 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> New prompt
        </button>
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-200 text-sm rounded-lg px-4 py-2.5 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-white ml-3">✕</button>
        </div>
      )}

      {creating && (
        <PromptForm
          onClose={() => setCreating(false)}
          onSaved={async () => { setCreating(false); await load(); }}
          onError={setError}
        />
      )}

      {prompts.length === 0 ? (
        <div className="text-center py-16 text-sm text-[var(--foreground-muted)] border border-dashed border-[var(--border)] rounded-lg">
          No prompts yet. Create one to seed the Theme tab.
        </div>
      ) : (
        <div className="space-y-2">
          {prompts.map((p) => editing === p.id ? (
            <PromptForm
              key={p.id}
              prompt={p}
              onClose={() => setEditing(null)}
              onSaved={async () => { setEditing(null); await load(); }}
              onError={setError}
            />
          ) : (
            <PromptRow
              key={p.id}
              prompt={p}
              onEdit={() => setEditing(p.id)}
              onDeleted={load}
              onError={setError}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PromptRow({ prompt, onEdit, onDeleted, onError }: {
  prompt: Prompt;
  onEdit: () => void;
  onDeleted: () => void;
  onError: (msg: string) => void;
}) {
  const { user } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const active = isActiveNow(prompt);

  async function handleDelete() {
    if (!user) return;
    setDeleting(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/collection-prompts/${prompt.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { onError("Failed to delete."); return; }
      onDeleted();
    } finally {
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-white">{prompt.title}</h3>
            {prompt.featured && (
              <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider bg-yellow-500/15 text-yellow-300 border border-yellow-500/40 rounded-full px-1.5 py-0.5">
                <Star className="w-2.5 h-2.5" /> Featured
              </span>
            )}
            <span className={`text-[10px] uppercase tracking-wider rounded-full border px-1.5 py-0.5 ${
              active ? "bg-green-500/15 text-green-300 border-green-500/40" : "bg-[var(--surface-2)] text-[var(--foreground-muted)] border-[var(--border)]"
            }`}>
              {active ? "Active" : "Inactive"}
            </span>
            <span className="text-[10px] text-[var(--foreground-muted)]">
              {prompt.collectionCount} response{prompt.collectionCount === 1 ? "" : "s"}
            </span>
          </div>
          {prompt.description && (
            <p className="text-xs text-[var(--foreground-muted)] mt-1.5 line-clamp-2">{prompt.description}</p>
          )}
          <p className="text-[10px] text-[var(--foreground-muted)] mt-2">
            Active: {formatDate(prompt.activeFrom)} → {formatDate(prompt.activeTo)}
            {prompt.createdBy && <> · by {prompt.createdBy}</>}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onEdit}
            className="text-xs text-[var(--foreground-muted)] hover:text-white border border-[var(--border)] hover:border-[var(--ratist-red)] rounded-full px-3 py-1 transition-colors"
          >
            Edit
          </button>
          {confirmingDelete ? (
            <span className="flex items-center gap-1.5 text-xs">
              <button onClick={handleDelete} disabled={deleting} className="text-red-400 hover:text-red-300 font-medium">
                {deleting ? "Deleting…" : "Confirm"}
              </button>
              <button onClick={() => setConfirmingDelete(false)} className="text-[var(--foreground-muted)] hover:text-white">Cancel</button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmingDelete(true)}
              disabled={prompt.collectionCount > 0}
              title={prompt.collectionCount > 0 ? "Cannot delete: prompt has responses. Edit it to deactivate instead." : "Delete prompt"}
              className="p-1 text-[var(--foreground-muted)] hover:text-red-400 disabled:opacity-30 disabled:hover:text-[var(--foreground-muted)] transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PromptForm({ prompt, onClose, onSaved, onError }: {
  prompt?: Prompt;
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const { user } = useAuth();
  const [title, setTitle] = useState(prompt?.title ?? "");
  const [description, setDescription] = useState(prompt?.description ?? "");
  const [activeFrom, setActiveFrom] = useState(toLocalInput(prompt?.activeFrom ?? null));
  const [activeTo, setActiveTo]     = useState(toLocalInput(prompt?.activeTo ?? null));
  const [featured, setFeatured] = useState(prompt?.featured ?? false);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!user || saving || !title.trim()) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      const body = {
        title: title.trim(),
        description: description.trim() || null,
        // datetime-local emits without timezone info; treat as local time.
        // Sending the raw string and letting the API's parseDate construct
        // a Date is acceptable — the backend stores TIMESTAMP(3) which
        // preserves the moment fine for either interpretation.
        activeFrom: activeFrom ? new Date(activeFrom).toISOString() : null,
        activeTo:   activeTo   ? new Date(activeTo).toISOString()   : null,
        featured,
      };
      const url = prompt ? `/api/admin/collection-prompts/${prompt.id}` : "/api/admin/collection-prompts";
      const res = await fetch(url, {
        method: prompt ? "PATCH" : "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        onError(data.error ?? "Failed to save.");
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--ratist-red)]/40 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">{prompt ? "Edit prompt" : "New prompt"}</h3>
        <button onClick={onClose} className="text-[var(--foreground-muted)] hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div>
        <label className="block text-xs font-medium text-[var(--foreground-muted)] mb-1">Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          placeholder="Films that aged like wine"
          className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-[var(--foreground-muted)] mb-1">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="What's the brief? Give curators a reason to respond."
          className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] resize-y"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-[var(--foreground-muted)] mb-1">Active from</label>
          <input
            type="datetime-local"
            value={activeFrom}
            onChange={(e) => setActiveFrom(e.target.value)}
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)]"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--foreground-muted)] mb-1">Active to</label>
          <input
            type="datetime-local"
            value={activeTo}
            onChange={(e) => setActiveTo(e.target.value)}
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)]"
          />
        </div>
      </div>
      <p className="text-[10px] text-[var(--foreground-muted)]">
        Leave dates blank for an evergreen prompt with no time bound.
      </p>

      <label className="flex items-center gap-2 text-sm text-white">
        <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} className="accent-[var(--ratist-red)]" />
        Featured (pinned on the Theme tab)
      </label>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
        <button onClick={onClose} className="text-xs text-[var(--foreground-muted)] hover:text-white px-3 py-1.5">Cancel</button>
        <button
          onClick={save}
          disabled={saving || !title.trim()}
          className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] rounded-full px-3 py-1.5 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
