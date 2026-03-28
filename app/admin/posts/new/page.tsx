"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import RichTextEditor from "@/components/RichTextEditor";
import { Save, ArrowLeft, Eye, EyeOff } from "lucide-react";
import Link from "next/link";

const TYPE_LABELS = {
  BLOG: "Blog Post",
  PUNCH_AND_JUDY: "Punch & Judy",
  MOVIE_MAP: "Movie Map",
};

function NewPostInner() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const type = (searchParams.get("type") ?? "BLOG") as keyof typeof TYPE_LABELS;

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [published, setPublished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!user || !title.trim() || !content) return;
    setSaving(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/posts", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title, type, content, excerpt: excerpt || null, coverImage: coverImage || null, published }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? `Save failed (${res.status})`);
        setSaving(false);
        return;
      }
      const { post } = await res.json();
      router.push(`/admin/posts/${post.id}/edit`);
    } catch (err) {
      setError("Network error — please try again.");
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin" className="text-[var(--foreground-muted)] hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h2 className="text-lg font-semibold text-white">New {TYPE_LABELS[type]}</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main editor */}
        <div className="lg:col-span-2 space-y-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="w-full bg-[var(--surface)] border border-[var(--border)] text-white text-xl font-bold rounded-xl px-4 py-3 focus:outline-none focus:border-[var(--ratist-red)] placeholder:text-[var(--foreground-muted)]"
          />
          <RichTextEditor
            content={content}
            onChange={setContent}
            placeholder={`Write your ${TYPE_LABELS[type].toLowerCase()} here…`}
          />
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Publish */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-3">Publish</h3>
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => setPublished(false)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors ${!published ? "border-[var(--ratist-red)] text-white bg-[var(--ratist-red)]/10" : "border-[var(--border)] text-[var(--foreground-muted)]"}`}
              >
                <EyeOff className="w-3.5 h-3.5" /> Draft
              </button>
              <button
                onClick={() => setPublished(true)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors ${published ? "border-green-500 text-green-400 bg-green-500/10" : "border-[var(--border)] text-[var(--foreground-muted)]"}`}
              >
                <Eye className="w-3.5 h-3.5" /> Published
              </button>
            </div>
            {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
            <button
              onClick={save}
              disabled={saving || !title.trim() || !content}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[var(--ratist-red)] text-white rounded-lg text-sm font-semibold hover:bg-[var(--ratist-red)]/80 transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? "Saving…" : "Save Post"}
            </button>
          </div>

          {/* Excerpt */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-2">Excerpt</h3>
            <textarea
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              placeholder="Short description for previews…"
              rows={3}
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] text-sm text-white rounded-lg px-3 py-2 focus:outline-none focus:border-[var(--ratist-red)] placeholder:text-[var(--foreground-muted)] resize-none"
            />
          </div>

          {/* Cover image */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-2">Cover Image URL</h3>
            <input
              value={coverImage}
              onChange={(e) => setCoverImage(e.target.value)}
              placeholder="https://…"
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] text-sm text-white rounded-lg px-3 py-2 focus:outline-none focus:border-[var(--ratist-red)] placeholder:text-[var(--foreground-muted)]"
            />
            {coverImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverImage} alt="" className="mt-2 rounded-lg w-full object-cover max-h-32" onError={(e) => (e.currentTarget.style.display = "none")} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NewPostPage() {
  return (
    <Suspense>
      <NewPostInner />
    </Suspense>
  );
}
