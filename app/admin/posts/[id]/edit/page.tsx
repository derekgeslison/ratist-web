"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import RichTextEditor from "@/components/RichTextEditor";
import { Save, ArrowLeft, Eye, EyeOff, ExternalLink } from "lucide-react";
import Link from "next/link";
import type { PostType } from "@prisma/client";

const TYPE_LABELS: Record<PostType, string> = {
  BLOG: "Blog Post",
  PUNCH_AND_JUDY: "Punch & Judy",
  MOVIE_MAP: "Movie Map",
};

const TYPE_SLUGS: Record<PostType, string> = {
  BLOG: "blog",
  PUNCH_AND_JUDY: "punch-and-judy",
  MOVIE_MAP: "movie-maps",
};

export default function EditPostPage() {
  const { user } = useAuth();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [type, setType] = useState<PostType>("BLOG");
  const [content, setContent] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [published, setPublished] = useState(false);
  const [slug, setSlug] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/posts/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setError("Access denied or post not found."); setLoading(false); return; }
      const { post } = await res.json();
      setTitle(post.title);
      setType(post.type);
      setContent(post.content);
      setExcerpt(post.excerpt ?? "");
      setCoverImage(post.coverImage ?? "");
      setPublished(post.published);
      setSlug(post.slug);
      setLoading(false);
    })();
  }, [user, id]);

  async function save() {
    if (!user || !title.trim() || !content) return;
    setSaving(true);
    setError("");
    const token = await user.getIdToken();
    const res = await fetch(`/api/admin/posts/${id}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title, content, excerpt: excerpt || null, coverImage: coverImage || null, published }),
    });
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? "Failed to save");
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  }

  if (loading) return <p className="text-[var(--foreground-muted)]">Loading…</p>;
  if (error && !content) return <p className="text-red-400">{error}</p>;

  const publicUrl = `/${TYPE_SLUGS[type]}/${slug}`;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin" className="text-[var(--foreground-muted)] hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h2 className="text-lg font-semibold text-white">Edit {TYPE_LABELS[type]}</h2>
        <Link href={publicUrl} target="_blank" className="flex items-center gap-1 text-xs text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] transition-colors ml-auto">
          <ExternalLink className="w-3.5 h-3.5" /> View
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="w-full bg-[var(--surface)] border border-[var(--border)] text-white text-xl font-bold rounded-xl px-4 py-3 focus:outline-none focus:border-[var(--ratist-red)] placeholder:text-[var(--foreground-muted)]"
          />
          {content !== "" && (
            <RichTextEditor
              content={content}
              onChange={setContent}
              placeholder="Write here…"
            />
          )}
        </div>

        <div className="space-y-4">
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
            <p className="text-xs text-[var(--foreground-muted)] mb-3">Slug: <span className="text-white font-mono">{slug}</span></p>
            {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
            <button
              onClick={save}
              disabled={saving || !title.trim() || !content}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${saved ? "bg-green-600 text-white" : "bg-[var(--ratist-red)] text-white hover:bg-[var(--ratist-red)]/80"}`}
            >
              <Save className="w-4 h-4" />
              {saved ? "Saved!" : saving ? "Saving…" : "Save Changes"}
            </button>
          </div>

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
