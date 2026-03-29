"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, RefreshCw, ThumbsUp, ThumbsDown, Plus, X, Search } from "lucide-react";

const TMDB_IMG = "https://image.tmdb.org/t/p/w185";
const TMDB_POSTER = "https://image.tmdb.org/t/p/w92";

interface RecastItem {
  id: string;
  tmdbMovieId: number;
  movieTitle: string;
  posterPath: string | null;
  characterName: string;
  originalActorName: string;
  originalActorTmdbId: number | null;
  suggestedActorName: string;
  suggestedActorTmdbId: number | null;
  suggestedActorProfile: string | null;
  score: number;
  voterIds: { userId: string; value: number }[];
  creator: { name: string };
}

interface PersonResult {
  id: number;
  name: string;
  profilePath: string | null;
  department: string;
}

interface MovieResult {
  id: number;
  title: string;
  posterPath: string | null;
  releaseDate: string;
}

function MovieSearch({ onSelect }: { onSelect: (m: MovieResult) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MovieResult[]>([]);

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/tmdb/movie/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setResults(data.results ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="relative">
      <label className="text-xs text-[var(--foreground-muted)] mb-1 block">Movie</label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)]" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search movie…"
          className="w-full pl-9 pr-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-sm text-white placeholder-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
        />
      </div>
      {results.length > 0 && (
        <div className="absolute z-10 top-full mt-1 w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden shadow-lg">
          {results.map((m) => (
            <button
              key={m.id}
              onClick={() => { onSelect(m); setQuery(m.title); setResults([]); }}
              className="flex items-center gap-3 w-full px-3 py-2 hover:bg-[var(--surface-2)] text-left"
            >
              {m.posterPath && <Image src={`${TMDB_POSTER}${m.posterPath}`} alt={m.title} width={24} height={36} className="rounded object-cover" style={{ width: 24, height: 36 }} />}
              <div>
                <p className="text-sm font-medium text-white">{m.title}</p>
                <p className="text-xs text-[var(--foreground-muted)]">{m.releaseDate?.slice(0, 4)}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PersonSearch({ label, onSelect }: { label: string; onSelect: (p: PersonResult) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PersonResult[]>([]);

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/tmdb/person?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setResults(data.results ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="relative">
      <label className="text-xs text-[var(--foreground-muted)] mb-1 block">{label}</label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)]" />
        <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search actor…"
          className="w-full pl-9 pr-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-sm text-white placeholder-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]" />
      </div>
      {results.length > 0 && (
        <div className="absolute z-10 top-full mt-1 w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden shadow-lg">
          {results.map((p) => (
            <button key={p.id} onClick={() => { onSelect(p); setQuery(p.name); setResults([]); }}
              className="flex items-center gap-3 w-full px-3 py-2 hover:bg-[var(--surface-2)] text-left">
              {p.profilePath ? (
                <Image src={`${TMDB_IMG}${p.profilePath}`} alt={p.name} width={28} height={28} className="w-7 h-7 rounded-full object-cover" />
              ) : <div className="w-7 h-7 rounded-full bg-[var(--surface-2)]" />}
              <p className="text-sm text-white">{p.name}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RecastPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<RecastItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ characterName: "", originalActorName: "" });
  const [selectedMovie, setSelectedMovie] = useState<MovieResult | null>(null);
  const [originalActor, setOriginalActor] = useState<PersonResult | null>(null);
  const [suggestedActor, setSuggestedActor] = useState<PersonResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const fetchItems = useCallback(async () => {
    const res = await fetch("/api/community/recast");
    const data = await res.json();
    setItems(data.items ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  async function vote(itemId: string, value: 1 | -1) {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch(`/api/community/recast/${itemId}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ value }),
    });
    if (res.ok) {
      const { score, userVote } = await res.json();
      setItems((prev) => prev.map((it) =>
        it.id === itemId
          ? { ...it, score, voterIds: [...it.voterIds.filter((v) => v.userId !== user.uid), { userId: user.uid, value: userVote }] }
          : it
      ));
    }
  }

  async function submitRecast() {
    if (!selectedMovie || !form.characterName || !form.originalActorName || !suggestedActor || !user) return;
    setSubmitting(true);
    setFormError("");
    const token = await user.getIdToken();
    const res = await fetch("/api/community/recast", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        tmdbMovieId: selectedMovie.id,
        movieTitle: selectedMovie.title,
        posterPath: selectedMovie.posterPath,
        characterName: form.characterName,
        originalActorName: originalActor?.name ?? form.originalActorName,
        originalActorTmdbId: originalActor?.id ?? null,
        suggestedActorName: suggestedActor.name,
        suggestedActorTmdbId: suggestedActor.id,
        suggestedActorProfile: suggestedActor.profilePath,
      }),
    });
    const data = await res.json();
    if (!res.ok) { setFormError(data.error ?? "Failed"); setSubmitting(false); return; }
    setShowForm(false);
    setForm({ characterName: "", originalActorName: "" });
    setSelectedMovie(null);
    setOriginalActor(null);
    setSuggestedActor(null);
    fetchItems();
    setSubmitting(false);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <Link href="/community" className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Community Hub
      </Link>

      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <RefreshCw className="w-6 h-6 text-blue-400" />
          <h1 className="text-2xl font-bold text-white">Recast</h1>
        </div>
        {user && !showForm && (
          <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition-colors">
            <Plus className="w-4 h-4" /> Suggest Recast
          </button>
        )}
      </div>
      <p className="text-[var(--foreground-muted)] mb-8">Who should have played that role? Submit your ideal recast and vote on others.</p>

      {showForm && (
        <div className="bg-[var(--surface)] border border-blue-400/30 rounded-xl p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-white">Suggest a Recast</h2>
            <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-[var(--foreground-muted)]" /></button>
          </div>
          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <MovieSearch onSelect={setSelectedMovie} />
            <div>
              <label className="text-xs text-[var(--foreground-muted)] mb-1 block">Character Name</label>
              <input type="text" value={form.characterName} onChange={(e) => setForm((f) => ({ ...f, characterName: e.target.value }))}
                placeholder="e.g. Tony Stark"
                className="w-full px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-sm text-white placeholder-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]" />
            </div>
            <PersonSearch label="Original Actor (optional)" onSelect={setOriginalActor} />
            <div>
              <label className="text-xs text-[var(--foreground-muted)] mb-1 block">Original Actor Name (if not found)</label>
              <input type="text" value={form.originalActorName} onChange={(e) => setForm((f) => ({ ...f, originalActorName: e.target.value }))}
                placeholder="e.g. Robert Downey Jr."
                className="w-full px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-sm text-white placeholder-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]" />
            </div>
            <div className="sm:col-span-2">
              <PersonSearch label="Your Suggested Actor" onSelect={setSuggestedActor} />
            </div>
          </div>
          {formError && <p className="text-red-400 text-sm mb-3">{formError}</p>}
          <button onClick={submitRecast} disabled={!selectedMovie || !form.characterName || (!originalActor && !form.originalActorName) || !suggestedActor || submitting}
            className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors">
            {submitting ? "Submitting…" : "Submit Recast"}
          </button>
        </div>
      )}

      {!user && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-8 text-center">
          <p className="text-sm text-[var(--foreground-muted)]">
            <Link href="/auth/signin" className="text-blue-400 hover:underline">Sign in</Link> to suggest recasts and vote.
          </p>
        </div>
      )}

      {loading ? (
        <p className="text-[var(--foreground-muted)] text-center py-20">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-[var(--foreground-muted)] text-center py-20">No suggestions yet. Be the first!</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const userVote = item.voterIds.find((v) => v.userId === user?.uid)?.value ?? 0;
            return (
              <div key={item.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex gap-4">
                {item.posterPath && (
                  <Image src={`${TMDB_POSTER}${item.posterPath}`} alt={item.movieTitle} width={40} height={60} className="rounded shrink-0 object-cover" style={{ width: 40, height: 60 }} />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[var(--foreground-muted)] mb-0.5">{item.movieTitle}</p>
                  <p className="text-sm font-semibold text-white mb-1">{item.characterName}</p>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-[var(--foreground-muted)] line-through">{item.originalActorName}</span>
                    <span className="text-blue-400">→</span>
                    <div className="flex items-center gap-1.5">
                      {item.suggestedActorProfile && (
                        <Image src={`${TMDB_IMG}${item.suggestedActorProfile}`} alt={item.suggestedActorName} width={20} height={20} className="w-5 h-5 rounded-full object-cover" />
                      )}
                      <span className="text-white font-medium">{item.suggestedActorName}</span>
                    </div>
                  </div>
                  <p className="text-xs text-[var(--foreground-muted)] mt-1">by {item.creator.name}</p>
                </div>
                <div className="flex flex-col items-center gap-1 shrink-0">
                  <button onClick={() => vote(item.id, 1)} disabled={!user}
                    className={`p-1.5 rounded transition-colors ${userVote === 1 ? "text-green-400 bg-green-500/20" : "text-[var(--foreground-muted)] hover:text-green-400"}`}>
                    <ThumbsUp className="w-4 h-4" />
                  </button>
                  <span className={`text-sm font-semibold ${item.score > 0 ? "text-green-400" : item.score < 0 ? "text-red-400" : "text-[var(--foreground-muted)]"}`}>
                    {item.score > 0 ? "+" : ""}{item.score}
                  </span>
                  <button onClick={() => vote(item.id, -1)} disabled={!user}
                    className={`p-1.5 rounded transition-colors ${userVote === -1 ? "text-red-400 bg-red-500/20" : "text-[var(--foreground-muted)] hover:text-red-400"}`}>
                    <ThumbsDown className="w-4 h-4" />
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
