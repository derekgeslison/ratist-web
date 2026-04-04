"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, RefreshCw, ThumbsUp, ThumbsDown, Plus, X, Search, Clock, TrendingUp, MessageCircle, Trash2 } from "lucide-react";
import CommentSection from "@/components/CommentSection";
import ReportButton from "@/components/ReportButton";
import AdUnit from "@/components/AdUnit";

const TMDB_IMG = "https://image.tmdb.org/t/p/w185";
const TMDB_POSTER = "https://image.tmdb.org/t/p/w92";

interface RecastItem {
  id: string;
  tmdbMovieId: number;
  movieTitle: string;
  posterPath: string | null;
  characterName: string;
  originalActorName: string;
  suggestedActorName: string;
  suggestedActorProfile: string | null;
  score: number;
  commentCount: number;
  createdAt: string;
  voterIds: { userId: string; value: number }[];
  creator: { name: string; firebaseUid: string };
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

function PersonSearch({ label, onSelect, onClear }: { label: string; onSelect: (p: PersonResult) => void; onClear: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PersonResult[]>([]);
  const [selected, setSelected] = useState<PersonResult | null>(null);

  useEffect(() => {
    if (selected || query.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/tmdb/person?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setResults(data.results ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [query, selected]);

  function clear() { setQuery(""); setSelected(null); setResults([]); onClear(); }

  return (
    <div className="relative">
      <label className="text-xs text-[var(--foreground-muted)] mb-1 block">{label}</label>
      {selected ? (
        <div className="flex items-center gap-2 px-3 py-2 bg-[var(--surface-2)] border border-blue-400/50 rounded-lg">
          {selected.profilePath && <Image src={`${TMDB_IMG}${selected.profilePath}`} alt={selected.name} width={24} height={24} className="w-6 h-6 rounded-full object-cover shrink-0" />}
          <span className="text-sm text-white flex-1">{selected.name}</span>
          <button onClick={clear}><X className="w-4 h-4 text-[var(--foreground-muted)]" /></button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)]" />
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search actor…"
            className="w-full pl-9 pr-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-sm text-white placeholder-[var(--foreground-muted)] focus:outline-none focus:border-blue-400" />
        </div>
      )}
      {!selected && results.length > 0 && (
        <div className="absolute z-10 top-full mt-1 w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden shadow-lg">
          {results.map((p) => (
            <button key={p.id} onClick={() => { setSelected(p); setResults([]); onSelect(p); }}
              className="flex items-center gap-3 w-full px-3 py-2 hover:bg-[var(--surface-2)] text-left">
              {p.profilePath ? <Image src={`${TMDB_IMG}${p.profilePath}`} alt={p.name} width={28} height={28} className="w-7 h-7 rounded-full object-cover" /> : <div className="w-7 h-7 rounded-full bg-[var(--surface-2)]" />}
              <div>
                <p className="text-sm text-white">{p.name}</p>
                <p className="text-xs text-[var(--foreground-muted)]">{p.department}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MovieSearch({ onSelect, onClear }: { onSelect: (m: MovieResult) => void; onClear: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MovieResult[]>([]);
  const [selected, setSelected] = useState<MovieResult | null>(null);

  useEffect(() => {
    if (selected || query.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/tmdb/movie/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setResults(data.results ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [query, selected]);

  function clear() { setQuery(""); setSelected(null); setResults([]); onClear(); }

  return (
    <div className="relative">
      <label className="text-xs text-[var(--foreground-muted)] mb-1 block">Movie</label>
      {selected ? (
        <div className="flex items-center gap-2 px-3 py-2 bg-[var(--surface-2)] border border-blue-400/50 rounded-lg">
          {selected.posterPath && <Image src={`${TMDB_POSTER}${selected.posterPath}`} alt={selected.title} width={20} height={30} className="rounded object-cover shrink-0" style={{ width: 20, height: 30 }} />}
          <span className="text-sm text-white flex-1">{selected.title} ({selected.releaseDate?.slice(0, 4)})</span>
          <button onClick={clear}><X className="w-4 h-4 text-[var(--foreground-muted)]" /></button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)]" />
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search movie…"
            className="w-full pl-9 pr-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-sm text-white placeholder-[var(--foreground-muted)] focus:outline-none focus:border-blue-400" />
        </div>
      )}
      {!selected && results.length > 0 && (
        <div className="absolute z-10 top-full mt-1 w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden shadow-lg">
          {results.map((m) => (
            <button key={m.id} onClick={() => { setSelected(m); setResults([]); onSelect(m); }}
              className="flex items-center gap-3 w-full px-3 py-2 hover:bg-[var(--surface-2)] text-left">
              {m.posterPath && <Image src={`${TMDB_POSTER}${m.posterPath}`} alt={m.title} width={20} height={30} className="rounded object-cover shrink-0" style={{ width: 20, height: 30 }} />}
              <div>
                <p className="text-sm text-white">{m.title}</p>
                <p className="text-xs text-[var(--foreground-muted)]">{m.releaseDate?.slice(0, 4)}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type SortMode = "newest" | "score";

export default function RecastPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<RecastItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortMode>("newest");
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [selectedMovie, setSelectedMovie] = useState<MovieResult | null>(null);
  const [originalActor, setOriginalActor] = useState<PersonResult | null>(null);
  const [suggestedActor, setSuggestedActor] = useState<PersonResult | null>(null);
  const [characterName, setCharacterName] = useState("");
  const [originalActorNameManual, setOriginalActorNameManual] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [votingId, setVotingId] = useState<string | null>(null);
  const [expandedComments, setExpandedComments] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch("/api/community/recast");
      const data = await res.json();
      setItems(data.items ?? []);
    } catch {
      // ignore
    }
    setLoading(false);
  }, []);

  // Check admin status
  useEffect(() => {
    if (!user) return;
    user.getIdToken().then((token) => {
      fetch("/api/auth/admin-check", { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json()).then((d) => { if (d.isAdmin) setIsAdmin(true); })
        .catch(() => {});
    });
  }, [user]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const sorted = [...items].sort((a, b) => {
    if (sort === "score") return b.score - a.score;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const effectiveOriginalActorName = originalActor?.name ?? originalActorNameManual;

  async function vote(itemId: string, value: 1 | -1) {
    if (!user || votingId) return;
    setVotingId(itemId);
    try {
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
    } finally {
      setVotingId(null);
    }
  }

  async function submitRecast() {
    if (!selectedMovie || !characterName.trim() || !effectiveOriginalActorName.trim() || !suggestedActor || !user) return;
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
        characterName: characterName.trim(),
        originalActorName: effectiveOriginalActorName.trim(),
        originalActorTmdbId: originalActor?.id ?? null,
        suggestedActorName: suggestedActor.name,
        suggestedActorTmdbId: suggestedActor.id,
        suggestedActorProfile: suggestedActor.profilePath,
      }),
    });
    const data = await res.json();
    if (!res.ok) { setFormError(data.error ?? "Failed"); setSubmitting(false); return; }
    setShowForm(false);
    setSelectedMovie(null);
    setOriginalActor(null);
    setSuggestedActor(null);
    setCharacterName("");
    setOriginalActorNameManual("");
    fetchItems();
    setSubmitting(false);
  }

  const canSubmit = !!(selectedMovie && characterName.trim() && effectiveOriginalActorName.trim() && suggestedActor && !submitting);

  function closeForm() {
    setShowForm(false);
    setSelectedMovie(null);
    setOriginalActor(null);
    setSuggestedActor(null);
    setCharacterName("");
    setOriginalActorNameManual("");
    setFormError("");
  }

  async function deleteItem(id: string) {
    setDeletingId(id);
    try {
      const token = await user!.getIdToken();
      const res = await fetch(`/api/community/recast/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setItems((prev) => prev.filter((item) => item.id !== id));
      }
    } finally {
      setDeletingId(null);
      setConfirmingDeleteId(null);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
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
      <p className="text-[var(--foreground-muted)] mb-6">Who should have played that role? Submit your ideal recast and vote on others.</p>

      <AdUnit slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_COMMUNITY ?? ""} format="auto" className="mb-6" />

      {/* Submit Form */}
      {showForm && (
        <div className="bg-[var(--surface)] border border-blue-400/30 rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">Suggest a Recast</h2>
            <button onClick={closeForm}><X className="w-5 h-5 text-[var(--foreground-muted)]" /></button>
          </div>
          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <MovieSearch onSelect={setSelectedMovie} onClear={() => setSelectedMovie(null)} />
            <div>
              <label className="text-xs text-[var(--foreground-muted)] mb-1 block">Character Name *</label>
              <input type="text" value={characterName} onChange={(e) => setCharacterName(e.target.value)}
                placeholder="e.g. Tony Stark"
                className="w-full px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-sm text-white placeholder-[var(--foreground-muted)] focus:outline-none focus:border-blue-400" />
            </div>
            <div>
              <PersonSearch label="Original Actor (search or type below)" onSelect={setOriginalActor} onClear={() => setOriginalActor(null)} />
              {!originalActor && (
                <input type="text" value={originalActorNameManual} onChange={(e) => setOriginalActorNameManual(e.target.value)}
                  placeholder="Or type name manually…"
                  className="w-full mt-2 px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-sm text-white placeholder-[var(--foreground-muted)] focus:outline-none focus:border-blue-400" />
              )}
            </div>
            <PersonSearch label="Your Suggested Actor *" onSelect={setSuggestedActor} onClear={() => setSuggestedActor(null)} />
          </div>
          {formError && <p className="text-red-400 text-sm mb-3">{formError}</p>}
          <button
            onClick={submitRecast}
            disabled={!canSubmit}
            className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors"
          >
            {submitting ? "Submitting…" : "Submit Recast"}
          </button>
          {!canSubmit && (selectedMovie || characterName || effectiveOriginalActorName || suggestedActor) && (
            <p className="text-xs text-[var(--foreground-muted)] mt-2 text-center">
              Still need: {[!selectedMovie && "movie", !characterName.trim() && "character name", !effectiveOriginalActorName.trim() && "original actor", !suggestedActor && "suggested actor"].filter(Boolean).join(", ")}
            </p>
          )}
        </div>
      )}

      {!user && !showForm && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-6 text-center">
          <p className="text-sm text-[var(--foreground-muted)]">
            <Link href="/auth/signin" className="text-blue-400 hover:underline">Sign in</Link> to suggest recasts and vote.
          </p>
        </div>
      )}

      {/* Sort controls */}
      {!loading && items.length > 0 && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-[var(--foreground-muted)]">Sort:</span>
          <button onClick={() => setSort("newest")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${sort === "newest" ? "bg-blue-600 text-white" : "bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"}`}>
            <Clock className="w-3 h-3" /> Newest
          </button>
          <button onClick={() => setSort("score")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${sort === "score" ? "bg-blue-600 text-white" : "bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"}`}>
            <TrendingUp className="w-3 h-3" /> Top Rated
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-[var(--foreground-muted)] text-center py-20">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-[var(--foreground-muted)] text-center py-20">No suggestions yet. Be the first!</p>
      ) : (
        <div className="space-y-3">
          {sorted.map((item) => {
            const userVote = item.voterIds.find((v) => v.userId === user?.uid)?.value ?? 0;
            const canDelete = user && (user.uid === item.creator.firebaseUid || isAdmin);
            return (
              <div key={item.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
                {/* Delete confirmation */}
                {confirmingDeleteId === item.id && (
                  <div className="flex items-center gap-3 mb-3 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg">
                    <span className="text-sm text-red-400 flex-1">Delete this recast?</span>
                    <button
                      onClick={() => deleteItem(item.id)}
                      disabled={deletingId === item.id}
                      className="px-3 py-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-semibold rounded transition-colors"
                    >
                      {deletingId === item.id ? "Deleting..." : "Delete"}
                    </button>
                    <button
                      onClick={() => setConfirmingDeleteId(null)}
                      className="px-3 py-1 bg-[var(--surface-2)] text-[var(--foreground-muted)] hover:text-white text-xs font-semibold rounded transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-4">
                  {/* Movie poster */}
                  {item.posterPath ? (
                    <Image src={`${TMDB_POSTER}${item.posterPath}`} alt={item.movieTitle} width={36} height={54} className="rounded shrink-0 object-cover" style={{ width: 36, height: 54 }} />
                  ) : (
                    <div className="w-9 h-14 rounded bg-[var(--surface-2)] shrink-0" />
                  )}

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[var(--foreground-muted)] mb-0.5">{item.movieTitle} · <span className="italic">{item.characterName}</span></p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-[var(--foreground-muted)] line-through">{item.originalActorName}</span>
                      <span className="text-blue-400 text-sm">→</span>
                      <div className="flex items-center gap-1.5">
                        {item.suggestedActorProfile && (
                          <Image src={`${TMDB_IMG}${item.suggestedActorProfile}`} alt={item.suggestedActorName} width={20} height={20} className="w-5 h-5 rounded-full object-cover shrink-0" />
                        )}
                        <span className="text-sm font-semibold text-white">{item.suggestedActorName}</span>
                      </div>
                    </div>
                    <p className="text-xs text-[var(--foreground-muted)] mt-1">by {item.creator.name}</p>
                  </div>

                  {/* Vote controls */}
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <button onClick={() => vote(item.id, 1)} disabled={!user || votingId === item.id}
                      className={`p-1.5 rounded transition-colors ${userVote === 1 ? "text-green-400 bg-green-500/20" : "text-[var(--foreground-muted)] hover:text-green-400 disabled:cursor-not-allowed"}`}>
                      <ThumbsUp className="w-4 h-4" />
                    </button>
                    <span className={`text-sm font-semibold ${item.score > 0 ? "text-green-400" : item.score < 0 ? "text-red-400" : "text-[var(--foreground-muted)]"}`}>
                      {item.score > 0 ? "+" : ""}{item.score}
                    </span>
                    <button onClick={() => vote(item.id, -1)} disabled={!user || votingId === item.id}
                      className={`p-1.5 rounded transition-colors ${userVote === -1 ? "text-red-400 bg-red-500/20" : "text-[var(--foreground-muted)] hover:text-red-400 disabled:cursor-not-allowed"}`}>
                      <ThumbsDown className="w-4 h-4" />
                    </button>
                    <span className="text-xs text-[var(--foreground-muted)]">{item.voterIds.length} vote{item.voterIds.length !== 1 ? "s" : ""}</span>
                  </div>
                </div>

                {/* Comment toggle & delete */}
                <div className="border-t border-[var(--border)] mt-3 pt-2 flex items-center">
                  <button
                    onClick={() => setExpandedComments(expandedComments === item.id ? null : item.id)}
                    className="flex items-center gap-1.5 text-xs text-[var(--foreground-muted)] hover:text-white transition-colors"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    {expandedComments === item.id ? "Hide Comments" : "Comments"}
                    {item.commentCount > 0 && (
                      <span className="text-xs text-[var(--foreground-muted)]">({item.commentCount})</span>
                    )}
                  </button>
                  {canDelete && confirmingDeleteId !== item.id && (
                    <button
                      onClick={() => setConfirmingDeleteId(item.id)}
                      className="ml-auto p-1.5 text-[var(--foreground-muted)] hover:text-red-400 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <ReportButton targetType="recast" targetId={item.id} />
                </div>
                {expandedComments === item.id && (
                  <CommentSection targetType="recast" targetId={item.id} isAdmin={isAdmin} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
