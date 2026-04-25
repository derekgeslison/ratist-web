"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import RichTextEditor from "@/components/RichTextEditor";
import { Save, ArrowLeft, Eye, EyeOff, Upload, Calendar, Clock } from "lucide-react";
import Link from "next/link";
import MediaLinker from "@/components/forum/MediaLinker";
import PersonLinker from "@/components/forum/PersonLinker";
import AiMovieMapPanel from "@/components/admin/AiMovieMapPanel";

const TYPE_LABELS = {
  BLOG: "Blog Post",
  PUNCH_AND_JUDY: "Two Thumbs",
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
  // datetime-local string. Empty = "publish at save time" (server fills
  // with now()). Future value = scheduled — public queries hide the
  // post until the timestamp passes.
  const [publishedAtLocal, setPublishedAtLocal] = useState("");
  const [showAuthor, setShowAuthor] = useState(true);
  const [media, setMedia] = useState<{tmdbId: number; mediaType: "movie" | "tv"; title: string; posterPath: string | null}[]>([]);
  const [people, setPeople] = useState<{tmdbId: number; name: string; profilePath: string | null}[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  async function save() {
    if (!user || !title.trim() || !content) return;
    setSaving(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const publishedAtIso = published && publishedAtLocal
        ? new Date(publishedAtLocal).toISOString()
        : null;
      const res = await fetch("/api/admin/posts", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          title, type, content, excerpt: excerpt || null, coverImage: coverImage || null,
          published, publishedAt: publishedAtIso, showAuthor, media, people,
        }),
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
            allowDebate={type === "PUNCH_AND_JUDY"}
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

            {/* Optional publish date — leave blank for "now". Future
                values schedule the post; public queries hide it until
                the timestamp passes. */}
            {published && (() => {
              let isScheduled = false;
              try {
                if (publishedAtLocal) isScheduled = new Date(publishedAtLocal).getTime() > Date.now();
              } catch { /* ignore */ }
              return (
                <div className="mb-4">
                  <label className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider font-semibold mb-1.5 flex items-center gap-1.5">
                    <Calendar className="w-3 h-3" />
                    Publish at
                    {isScheduled && (
                      <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-full px-1.5 py-0.5 normal-case tracking-normal">
                        <Clock className="w-2.5 h-2.5" /> Scheduled
                      </span>
                    )}
                  </label>
                  <input
                    type="datetime-local"
                    value={publishedAtLocal}
                    onChange={(e) => setPublishedAtLocal(e.target.value)}
                    className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)]"
                  />
                  <p className="text-[10px] text-[var(--foreground-muted)] mt-1 leading-relaxed">
                    Leave blank to publish immediately. Set a future date/time to schedule.
                  </p>
                </div>
              );
            })()}

            <label className="flex items-center gap-2 mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={showAuthor}
                onChange={(e) => setShowAuthor(e.target.checked)}
                className="accent-[var(--ratist-red)] w-3.5 h-3.5"
              />
              <span className="text-sm text-[var(--foreground-muted)]">Show author name</span>
            </label>
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

          {/* Linked Movies & Shows */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-2">
            <label className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">Linked Movies & Shows</label>
            <MediaLinker selected={media} onChange={setMedia} max={10} />
          </div>

          {type === "MOVIE_MAP" && <AiMovieMapPanel linkedMedia={media} />}

          {/* Linked Celebrities */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-2">
            <label className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">Linked Celebrities</label>
            <PersonLinker selected={people} onChange={setPeople} max={10} />
          </div>

          {/* Cover image */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-2">Cover Image</h3>
            <label className={`flex items-center justify-center gap-2 w-full px-4 py-3 border-2 border-dashed rounded-lg cursor-pointer transition-colors mb-2 ${
              uploading ? "border-[var(--ratist-red)]/50 text-[var(--foreground-muted)]" : "border-[var(--border)] text-[var(--foreground-muted)] hover:border-[var(--ratist-red)] hover:text-white"
            }`}>
              <Upload className="w-4 h-4" />
              <span className="text-sm">{uploading ? "Uploading..." : "Upload Image"}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                disabled={uploading}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file || !user) return;
                  setUploading(true);
                  try {
                    const token = await user.getIdToken();
                    const form = new FormData();
                    form.append("file", file);
                    const res = await fetch("/api/upload", {
                      method: "POST",
                      headers: { Authorization: `Bearer ${token}` },
                      body: form,
                    });
                    const data = await res.json();
                    if (res.ok && data.url) {
                      setCoverImage(data.url);
                    } else {
                      setError(data.error ?? "Upload failed");
                    }
                  } catch {
                    setError("Upload failed");
                  }
                  setUploading(false);
                  e.target.value = "";
                }}
              />
            </label>
            <div className="relative">
              <input
                value={coverImage}
                onChange={(e) => setCoverImage(e.target.value)}
                placeholder="Or paste image URL..."
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] text-sm text-white rounded-lg px-3 py-2 focus:outline-none focus:border-[var(--ratist-red)] placeholder:text-[var(--foreground-muted)]"
              />
            </div>
            {coverImage && (
              <div className="relative mt-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={coverImage} alt="" className="rounded-lg w-full object-cover max-h-32" onError={(e) => (e.currentTarget.style.display = "none")} />
                <button
                  type="button"
                  onClick={() => setCoverImage("")}
                  className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full p-1 transition-colors"
                >
                  <span className="text-xs px-1">Remove</span>
                </button>
              </div>
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
