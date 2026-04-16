"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { ArrowLeft, Save, Eye, EyeOff, Search, Film, Tv, X } from "lucide-react";
import Link from "next/link";

interface TmdbResult {
  id: number;
  title: string;
  posterPath: string | null;
  releaseDate?: string;
  media_type?: string;
}

export default function NewTrailerPage() {
  const { user } = useAuth();
  const router = useRouter();

  const searchTimer = useRef<NodeJS.Timeout | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<TmdbResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<{
    tmdbId: number;
    mediaType: "movie" | "tv";
    title: string;
    posterPath: string | null;
    year: string;
  } | null>(null);

  const [youtubeKey, setYoutubeKey] = useState("");
  const [title, setTitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [published, setPublished] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function searchTmdb(query: string) {
    if (!query.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const [movieRes, tvRes] = await Promise.all([
        fetch(`/api/tmdb/movie/search?q=${encodeURIComponent(query)}&page=1`).then((r) => r.json()),
        fetch(`/api/tmdb/tv/search?q=${encodeURIComponent(query)}&page=1`).then((r) => r.json()),
      ]);
      const movies = (movieRes.results ?? []).slice(0, 5).map((m: TmdbResult) => ({ ...m, media_type: "movie" }));
      const shows = (tvRes.results ?? []).slice(0, 5).map((s: TmdbResult) => ({ ...s, media_type: "tv" }));
      setSearchResults([...movies, ...shows]);
    } catch { /* ignore */ }
    setSearching(false);
  }

  function selectMedia(item: TmdbResult) {
    const isMovie = item.media_type === "movie";
    const year = (item.releaseDate ?? "").slice(0, 4);
    setSelectedMedia({
      tmdbId: item.id,
      mediaType: isMovie ? "movie" : "tv",
      title: item.title,
      posterPath: item.posterPath,
      year,
    });
    setTitle(`${item.title} — Official Trailer`);
    setExcerpt(`Watch the official trailer for ${item.title}.`);
    setSearchResults([]);
    setSearchQuery("");
  }

  function handleYoutubeInput(val: string) {
    const match = val.match(
      /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/
    );
    setYoutubeKey(match ? match[1] : val);
  }

  async function save() {
    if (!user || !title.trim() || !youtubeKey) return;
    setSaving(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/news", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "TRAILER",
          title,
          excerpt: excerpt || null,
          content: null,
          coverImage: null,
          published,
          movieTmdbId: selectedMedia?.mediaType === "movie" ? selectedMedia.tmdbId : null,
          showTmdbId: selectedMedia?.mediaType === "tv" ? selectedMedia.tmdbId : null,
          posterPath: selectedMedia?.posterPath ?? null,
          youtubeKey,
          sourceName: "YouTube",
          sourceUrl: `https://www.youtube.com/watch?v=${youtubeKey}`,
          media: selectedMedia
            ? [{ tmdbId: selectedMedia.tmdbId, mediaType: selectedMedia.mediaType, title: selectedMedia.title, posterPath: selectedMedia.posterPath }]
            : [],
          people: [],
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? `Save failed (${res.status})`);
        setSaving(false);
        return;
      }
      router.push("/admin/news");
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
        <h2 className="text-lg font-semibold text-white">Add Trailer</h2>
      </div>

      <div className="max-w-2xl space-y-5">
        {/* Step 1: Search for movie/show */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-3">
          <label className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">
            Movie or TV Show
          </label>

          {selectedMedia ? (
            <div className="flex items-center gap-3">
              {selectedMedia.posterPath && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`https://image.tmdb.org/t/p/w92${selectedMedia.posterPath}`}

                  alt=""
                  className="w-10 h-14 rounded object-cover bg-[var(--surface-2)]"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{selectedMedia.title}</p>
                <p className="text-xs text-[var(--foreground-muted)] flex items-center gap-1">
                  {selectedMedia.mediaType === "movie" ? <Film className="w-3 h-3" /> : <Tv className="w-3 h-3" />}
                  {selectedMedia.mediaType === "movie" ? "Movie" : "TV Show"}
                  {selectedMedia.year && ` (${selectedMedia.year})`}
                </p>
              </div>
              <button
                onClick={() => { setSelectedMedia(null); setTitle(""); setExcerpt(""); }}
                className="text-[var(--foreground-muted)] hover:text-red-400 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)]" />
                <input
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (searchTimer.current) clearTimeout(searchTimer.current);
                    searchTimer.current = setTimeout(() => searchTmdb(e.target.value), 300);
                  }}
                  placeholder="Search for a movie or TV show..."
                  className="w-full bg-[var(--surface-2)] border border-[var(--border)] text-sm text-white rounded-lg pl-9 pr-3 py-2.5 focus:outline-none focus:border-[var(--ratist-red)] placeholder:text-[var(--foreground-muted)]"
                />
              </div>
              {searchResults.length > 0 && (
                <div className="absolute z-10 top-full mt-1 w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl max-h-80 overflow-y-auto shadow-lg">
                  {searchResults.map((item) => {
                    const isMovie = item.media_type === "movie";
                    const year = (item.releaseDate ?? "").slice(0, 4);
                    return (
                      <button
                        key={`${item.media_type}-${item.id}`}
                        onClick={() => selectMedia(item)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--surface-2)] transition-colors text-left"
                      >
                        {item.posterPath ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`https://image.tmdb.org/t/p/w92${item.posterPath}`}
                            alt=""
                            className="w-8 h-12 rounded object-cover bg-[var(--surface-2)]"
                          />
                        ) : (
                          <div className="w-8 h-12 rounded bg-[var(--surface-2)] flex items-center justify-center">
                            {isMovie ? <Film className="w-3 h-3 text-[var(--foreground-muted)]" /> : <Tv className="w-3 h-3 text-[var(--foreground-muted)]" />}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm text-white truncate">{item.title}</p>
                          <p className="text-xs text-[var(--foreground-muted)]">
                            {isMovie ? "Movie" : "TV Show"}{year && ` (${year})`}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Step 2: YouTube URL */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-3">
          <label className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">
            YouTube Trailer
          </label>
          <input
            value={youtubeKey}
            onChange={(e) => handleYoutubeInput(e.target.value)}
            placeholder="Paste YouTube URL or video ID"
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] text-sm text-white rounded-lg px-3 py-2.5 focus:outline-none focus:border-[var(--ratist-red)] placeholder:text-[var(--foreground-muted)]"
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

        {/* Step 3: Title & excerpt (auto-filled, editable) */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-3">
          <label className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">
            Post Details
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Trailer title (auto-filled from selection)"
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] text-sm text-white rounded-lg px-3 py-2.5 focus:outline-none focus:border-[var(--ratist-red)] placeholder:text-[var(--foreground-muted)]"
          />
          <textarea
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            placeholder="Brief description"
            rows={2}
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] text-sm text-white rounded-lg px-3 py-2.5 focus:outline-none focus:border-[var(--ratist-red)] resize-none placeholder:text-[var(--foreground-muted)]"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setPublished(!published)}
            className={`flex items-center gap-2 text-sm font-medium transition-colors ${published ? "text-emerald-400" : "text-[var(--foreground-muted)]"}`}
          >
            {published ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            {published ? "Publish immediately" : "Save as draft"}
          </button>
          <button
            onClick={save}
            disabled={saving || !title.trim() || !youtubeKey}
            className="flex items-center gap-2 px-5 py-2.5 bg-[var(--ratist-red)] text-white text-sm font-semibold rounded-lg hover:bg-[var(--ratist-red-hover)] transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" /> {saving ? "Saving..." : "Add Trailer"}
          </button>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </div>
  );
}
