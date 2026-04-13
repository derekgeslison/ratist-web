"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import RichTextEditor from "@/components/RichTextEditor";
import { Save, ArrowLeft, Eye, EyeOff, Upload, Search, Film, Tv, Link2 } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

interface TmdbResult {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  media_type: "movie" | "tv";
  release_date?: string;
  first_air_date?: string;
}

function NewNewsInner() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rssId = searchParams.get("rss");

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [published, setPublished] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [youtubeKey, setYoutubeKey] = useState("");
  const [movieTmdbId, setMovieTmdbId] = useState<number | null>(null);
  const [showTmdbId, setShowTmdbId] = useState<number | null>(null);
  const [posterPath, setPosterPath] = useState<string | null>(null);
  const [linkedTitle, setLinkedTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  // TMDB search
  const [tmdbQuery, setTmdbQuery] = useState("");
  const [tmdbResults, setTmdbResults] = useState<TmdbResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);

  // Load RSS headline if creating from inbox
  useEffect(() => {
    if (!rssId || !user) return;
    user.getIdToken().then((token) =>
      fetch(`/api/admin/news/rss`, { headers: { Authorization: `Bearer ${token}` } })
    ).then((r) => r.json())
    .then((data) => {
      const headline = data.headlines?.find((h: { id: string }) => h.id === rssId);
      if (headline) {
        setTitle(headline.title);
        setSourceUrl(headline.url);
        setSourceName(headline.feedSource);
        if (headline.imageUrl) setCoverImage(headline.imageUrl);
      }
    }).catch(() => {});
  }, [rssId, user]);

  // TMDB search debounce
  useEffect(() => {
    if (tmdbQuery.length < 2) { setTmdbResults([]); return; }
    const timer = setTimeout(async () => {
      const API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;
      const res = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${API_KEY}&query=${encodeURIComponent(tmdbQuery)}&include_adult=false`);
      const data = await res.json();
      setTmdbResults(
        (data.results ?? [])
          .filter((r: TmdbResult) => r.media_type === "movie" || r.media_type === "tv")
          .slice(0, 8)
      );
      setSearchOpen(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [tmdbQuery]);

  function linkMedia(result: TmdbResult) {
    if (result.media_type === "movie") {
      setMovieTmdbId(result.id);
      setShowTmdbId(null);
    } else {
      setShowTmdbId(result.id);
      setMovieTmdbId(null);
    }
    setPosterPath(result.poster_path);
    setLinkedTitle(result.title ?? result.name ?? "");
    setTmdbQuery("");
    setSearchOpen(false);
  }

  function unlinkMedia() {
    setMovieTmdbId(null);
    setShowTmdbId(null);
    setPosterPath(null);
    setLinkedTitle("");
  }

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
      if (res.ok) {
        const { url } = await res.json();
        setCoverImage(url);
      }
    } catch { /* ignore */ }
    setUploading(false);
  }

  async function save() {
    if (!user || !title.trim()) return;
    setSaving(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/news", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          title, content: content || null, excerpt: excerpt || null,
          coverImage: coverImage || null, published,
          movieTmdbId, showTmdbId, posterPath,
          sourceUrl: sourceUrl || null, sourceName: sourceName || null,
          youtubeKey: youtubeKey || null,
          rssHeadlineId: rssId || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? `Save failed (${res.status})`);
        setSaving(false);
        return;
      }
      const { item } = await res.json();
      router.push(`/admin/news/${item.id}/edit`);
    } catch {
      setError("Network error — please try again.");
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/news" className="text-[var(--foreground-muted)] hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h2 className="text-lg font-semibold text-white">New News Article</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main editor */}
        <div className="lg:col-span-2 space-y-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Headline"
            className="w-full bg-[var(--surface)] border border-[var(--border)] text-white text-xl font-bold rounded-xl px-4 py-3 focus:outline-none focus:border-[var(--ratist-red)] placeholder:text-[var(--foreground-muted)]"
          />
          <RichTextEditor
            content={content}
            onChange={setContent}
            placeholder="Write your article here..."
          />
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Publish controls */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-3">
            <button
              onClick={() => setPublished(!published)}
              className={`flex items-center gap-2 text-sm font-medium transition-colors ${published ? "text-emerald-400" : "text-[var(--foreground-muted)]"}`}
            >
              {published ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              {published ? "Published" : "Draft"}
            </button>
            <button
              onClick={save}
              disabled={saving || !title.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[var(--ratist-red)] text-white text-sm font-semibold rounded-lg hover:bg-[var(--ratist-red-hover)] transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" /> {saving ? "Saving..." : "Save"}
            </button>
            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>

          {/* Excerpt */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-2">
            <label className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">Excerpt</label>
            <textarea
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              placeholder="Brief summary for the news feed..."
              rows={3}
              maxLength={300}
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] text-sm text-white rounded-lg p-2.5 focus:outline-none focus:border-[var(--ratist-red)] resize-none placeholder:text-[var(--foreground-muted)]"
            />
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
            <input
              value={coverImage}
              onChange={(e) => setCoverImage(e.target.value)}
              placeholder="Image URL"
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] text-sm text-white rounded-lg p-2.5 focus:outline-none focus:border-[var(--ratist-red)] placeholder:text-[var(--foreground-muted)]"
            />
            <label className="flex items-center gap-2 text-xs text-[var(--foreground-muted)] cursor-pointer hover:text-white transition-colors">
              <Upload className="w-3.5 h-3.5" /> {uploading ? "Uploading..." : "Or upload image"}
              <input type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} disabled={uploading} />
            </label>
          </div>

          {/* YouTube embed */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-2">
            <label className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">YouTube Video</label>
            <input
              value={youtubeKey}
              onChange={(e) => {
                // Accept full URL or just the key
                const val = e.target.value;
                const match = val.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([a-zA-Z0-9_-]{11})/);
                setYoutubeKey(match ? match[1] : val);
              }}
              placeholder="YouTube URL or video ID"
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] text-sm text-white rounded-lg p-2.5 focus:outline-none focus:border-[var(--ratist-red)] placeholder:text-[var(--foreground-muted)]"
            />
            {youtubeKey && youtubeKey.length === 11 && (
              <div className="aspect-video rounded-lg overflow-hidden">
                <iframe
                  src={`https://www.youtube.com/embed/${youtubeKey}`}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            )}
          </div>

          {/* Link to movie/show */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-2">
            <label className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">Linked Movie/Show</label>
            {linkedTitle ? (
              <div className="flex items-center gap-2">
                {posterPath && (
                  <Image src={`https://image.tmdb.org/t/p/w92${posterPath}`} alt="" width={32} height={48} className="rounded" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{linkedTitle}</p>
                  <p className="text-xs text-[var(--foreground-muted)]">{movieTmdbId ? "Movie" : "TV Show"}</p>
                </div>
                <button onClick={unlinkMedia} className="text-[var(--foreground-muted)] hover:text-red-400 text-xs">Remove</button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--foreground-muted)]" />
                <input
                  value={tmdbQuery}
                  onChange={(e) => setTmdbQuery(e.target.value)}
                  placeholder="Search TMDB..."
                  className="w-full bg-[var(--surface-2)] border border-[var(--border)] text-sm text-white rounded-lg pl-8 pr-3 py-2 focus:outline-none focus:border-[var(--ratist-red)] placeholder:text-[var(--foreground-muted)]"
                />
                {searchOpen && tmdbResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-xl z-20 max-h-60 overflow-y-auto">
                    {tmdbResults.map((r) => (
                      <button
                        key={`${r.media_type}-${r.id}`}
                        onClick={() => linkMedia(r)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[var(--surface-2)] transition-colors"
                      >
                        {r.media_type === "movie" ? <Film className="w-3.5 h-3.5 text-[var(--foreground-muted)]" /> : <Tv className="w-3.5 h-3.5 text-blue-400" />}
                        <span className="text-sm text-white truncate">{r.title ?? r.name}</span>
                        <span className="text-xs text-[var(--foreground-muted)] ml-auto">{(r.release_date ?? r.first_air_date ?? "").slice(0, 4)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Source attribution */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-2">
            <label className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider flex items-center gap-1"><Link2 className="w-3 h-3" /> Source Attribution</label>
            <input
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              placeholder="Source name (e.g. Deadline)"
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] text-sm text-white rounded-lg p-2.5 focus:outline-none focus:border-[var(--ratist-red)] placeholder:text-[var(--foreground-muted)]"
            />
            <input
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="Source URL"
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] text-sm text-white rounded-lg p-2.5 focus:outline-none focus:border-[var(--ratist-red)] placeholder:text-[var(--foreground-muted)]"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NewNewsPage() {
  return <Suspense fallback={<p className="text-[var(--foreground-muted)]">Loading...</p>}><NewNewsInner /></Suspense>;
}
