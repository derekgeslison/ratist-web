"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import RichTextEditor from "@/components/RichTextEditor";
import { Save, ArrowLeft, Eye, EyeOff, ExternalLink, Upload, Link2 } from "lucide-react";
import Link from "next/link";
import MediaLinker from "@/components/forum/MediaLinker";
import PersonLinker from "@/components/forum/PersonLinker";

export default function EditNewsPage() {
  const { user } = useAuth();
  const { id } = useParams<{ id: string }>();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [published, setPublished] = useState(false);
  const [slug, setSlug] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [youtubeKey, setYoutubeKey] = useState("");
  const [media, setMedia] = useState<{tmdbId: number; mediaType: "movie" | "tv"; title: string; posterPath: string | null}[]>([]);
  const [people, setPeople] = useState<{tmdbId: number; name: string; profilePath: string | null}[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!user || !id) return;
    user.getIdToken().then((token) =>
      fetch(`/api/admin/news/${id}`, { headers: { Authorization: `Bearer ${token}` } })
    ).then((r) => r.json())
    .then((data) => {
      const item = data.item;
      if (!item) return;
      setTitle(item.title);
      setContent(item.content ?? "");
      setExcerpt(item.excerpt ?? "");
      setCoverImage(item.coverImage ?? "");
      setPublished(item.published);
      setSlug(item.slug ?? "");
      setSourceUrl(item.sourceUrl ?? "");
      setSourceName(item.sourceName ?? "");
      setYoutubeKey(item.youtubeKey ?? "");
      setMedia(item.media ?? []);
      setPeople(item.people ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user, id]);

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    try {
      const token = await user.getIdToken();
      const form = new FormData();
      form.append("file", file);
      form.append("path", `news/${Date.now()}-${file.name}`);
      const res = await fetch("/api/upload", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
      if (res.ok) { const { url } = await res.json(); setCoverImage(url); }
    } catch { /* ignore */ }
    setUploading(false);
  }

  async function save() {
    if (!user || !title.trim()) return;
    setSaving(true); setError(""); setSaved(false);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/news/${id}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          title, content: content || null, excerpt: excerpt || null,
          coverImage: coverImage || null, published,
          movieTmdbId: null, showTmdbId: null, posterPath: null,
          media, people,
          sourceUrl: sourceUrl || null, sourceName: sourceName || null,
          youtubeKey: youtubeKey || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? `Save failed (${res.status})`);
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      setError("Network error — please try again.");
    }
    setSaving(false);
  }

  if (loading) return <p className="text-[var(--foreground-muted)]">Loading...</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/admin/news" className="text-[var(--foreground-muted)] hover:text-white transition-colors"><ArrowLeft className="w-4 h-4" /></Link>
          <h2 className="text-lg font-semibold text-white">Edit Article</h2>
        </div>
        {slug && published && (
          <a href={`/news/${slug}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-[var(--foreground-muted)] hover:text-white transition-colors">
            <ExternalLink className="w-3.5 h-3.5" /> View live
          </a>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Headline"
            className="w-full bg-[var(--surface)] border border-[var(--border)] text-white text-xl font-bold rounded-xl px-4 py-3 focus:outline-none focus:border-[var(--ratist-red)] placeholder:text-[var(--foreground-muted)]" />
          <RichTextEditor content={content} onChange={setContent} placeholder="Write your article here..." />
        </div>

        <div className="space-y-4">
          {/* Publish */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-3">
            <button onClick={() => setPublished(!published)}
              className={`flex items-center gap-2 text-sm font-medium transition-colors ${published ? "text-emerald-400" : "text-[var(--foreground-muted)]"}`}>
              {published ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              {published ? "Published" : "Draft"}
            </button>
            <button onClick={save} disabled={saving || !title.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[var(--ratist-red)] text-white text-sm font-semibold rounded-lg hover:bg-[var(--ratist-red-hover)] transition-colors disabled:opacity-50">
              <Save className="w-4 h-4" /> {saving ? "Saving..." : saved ? "Saved!" : "Save"}
            </button>
            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>

          {/* Excerpt */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-2">
            <label className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">Excerpt</label>
            <textarea value={excerpt} onChange={(e) => setExcerpt(e.target.value)} placeholder="Brief summary..." rows={3} maxLength={300}
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] text-sm text-white rounded-lg p-2.5 focus:outline-none focus:border-[var(--ratist-red)] resize-none placeholder:text-[var(--foreground-muted)]" />
          </div>

          {/* Cover image */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-2">
            <label className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">Cover Image</label>
            {coverImage && (
              <div className="relative aspect-video rounded-lg overflow-hidden bg-[var(--surface-2)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={coverImage} alt="" className="w-full h-full object-cover" />
                <button onClick={() => setCoverImage("")} className="absolute top-1 right-1 bg-black/70 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600 transition-colors">&times;</button>
              </div>
            )}
            <input value={coverImage} onChange={(e) => setCoverImage(e.target.value)} placeholder="Image URL"
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] text-sm text-white rounded-lg p-2.5 focus:outline-none focus:border-[var(--ratist-red)] placeholder:text-[var(--foreground-muted)]" />
            <label className="flex items-center gap-2 text-xs text-[var(--foreground-muted)] cursor-pointer hover:text-white transition-colors">
              <Upload className="w-3.5 h-3.5" /> {uploading ? "Uploading..." : "Or upload image"}
              <input type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} disabled={uploading} />
            </label>
          </div>

          {/* YouTube */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-2">
            <label className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">YouTube Video</label>
            <input value={youtubeKey} onChange={(e) => {
              const val = e.target.value;
              const match = val.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([a-zA-Z0-9_-]{11})/);
              setYoutubeKey(match ? match[1] : val);
            }} placeholder="YouTube URL or video ID"
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] text-sm text-white rounded-lg p-2.5 focus:outline-none focus:border-[var(--ratist-red)] placeholder:text-[var(--foreground-muted)]" />
            {youtubeKey && youtubeKey.length === 11 && (
              <div className="aspect-video rounded-lg overflow-hidden">
                <iframe src={`https://www.youtube.com/embed/${youtubeKey}`} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
              </div>
            )}
          </div>

          {/* Linked Movies & Shows */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-2">
            <label className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">Linked Movies & Shows</label>
            <MediaLinker selected={media} onChange={setMedia} max={10} />
          </div>

          {/* Linked Celebrities */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-2">
            <label className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">Linked Celebrities</label>
            <PersonLinker selected={people} onChange={setPeople} max={10} />
          </div>

          {/* Source attribution */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-2">
            <label className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider flex items-center gap-1"><Link2 className="w-3 h-3" /> Source Attribution</label>
            <input value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder="Source name (e.g. Deadline)"
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] text-sm text-white rounded-lg p-2.5 focus:outline-none focus:border-[var(--ratist-red)] placeholder:text-[var(--foreground-muted)]" />
            <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="Source URL"
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] text-sm text-white rounded-lg p-2.5 focus:outline-none focus:border-[var(--ratist-red)] placeholder:text-[var(--foreground-muted)]" />
          </div>
        </div>
      </div>
    </div>
  );
}
