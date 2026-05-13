"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import Image from "next/image";
import Link from "next/link";
import SignInLink from "@/components/SignInLink";
import { ArrowLeft, RefreshCw, ThumbsUp, ThumbsDown, Plus, X, Search, Clock, TrendingUp, MessageCircle, Trash2, Tv, Users, Award, Zap } from "lucide-react";
import CommentSection from "@/components/CommentSection";
import ReportButton from "@/components/ReportButton";
import ShareButton from "@/components/ShareButton";
import AdUnit from "@/components/AdUnit";
import { useFollowingIds } from "@/hooks/useFollowingIds";

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
  commentCount: number;
  createdAt: string;
  voterIds: { userId: string; value: number }[];
  creator: { name: string; firebaseUid: string; isCritic?: boolean };
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
  mediaType?: "movie" | "tv";
}

function PersonSearch({ label, onSelect, onClear }: { label: string; onSelect: (p: PersonResult) => void; onClear: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PersonResult[]>([]);
  const [selected, setSelected] = useState<PersonResult | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    if (selected || query.length < 2) { setResults([]); setHasMore(false); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/tmdb/person?q=${encodeURIComponent(query)}&page=1`);
      const data = await res.json();
      setResults(data.results ?? []);
      setPage(1);
      setHasMore(1 < (data.totalPages ?? 1));
    }, 300);
    return () => clearTimeout(t);
  }, [query, selected]);

  async function loadMore() {
    const nextPage = page + 1;
    const res = await fetch(`/api/tmdb/person?q=${encodeURIComponent(query)}&page=${nextPage}`);
    const data = await res.json();
    setResults((prev) => [...prev, ...(data.results ?? [])]);
    setPage(nextPage);
    setHasMore(nextPage < (data.totalPages ?? 1));
  }

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
        <div className="absolute z-10 top-full mt-1 w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden shadow-lg max-h-72 overflow-y-auto">
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
          {hasMore && (
            <button onClick={loadMore} className="w-full text-center py-2 text-xs text-[var(--foreground-muted)] hover:text-white transition-colors border-t border-[var(--border)]">
              Load more results...
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function MovieSearch({ onSelect, onClear }: { onSelect: (m: MovieResult) => void; onClear: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MovieResult[]>([]);
  const [selected, setSelected] = useState<MovieResult | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    if (selected || query.length < 2) { setResults([]); setHasMore(false); return; }
    const t = setTimeout(async () => {
      const [movieRes, showRes] = await Promise.all([
        fetch(`/api/tmdb/movie/search?q=${encodeURIComponent(query)}&page=1`).then((r) => r.json()),
        fetch(`/api/tmdb/tv/search?q=${encodeURIComponent(query)}&page=1`).then((r) => r.json()),
      ]);
      setResults([
        ...(movieRes.results ?? []).map((m: MovieResult) => ({ ...m, mediaType: "movie" as const })),
        ...(showRes.results ?? []).map((s: MovieResult) => ({ ...s, mediaType: "tv" as const })),
      ]);
      setPage(1);
      setHasMore(1 < (movieRes.totalPages ?? 1) || 1 < (showRes.totalPages ?? 1));
    }, 300);
    return () => clearTimeout(t);
  }, [query, selected]);

  async function loadMore() {
    const nextPage = page + 1;
    const [movieRes, showRes] = await Promise.all([
      fetch(`/api/tmdb/movie/search?q=${encodeURIComponent(query)}&page=${nextPage}`).then((r) => r.json()),
      fetch(`/api/tmdb/tv/search?q=${encodeURIComponent(query)}&page=${nextPage}`).then((r) => r.json()),
    ]);
    setResults((prev) => [...prev,
      ...(movieRes.results ?? []).map((m: MovieResult) => ({ ...m, mediaType: "movie" as const })),
      ...(showRes.results ?? []).map((s: MovieResult) => ({ ...s, mediaType: "tv" as const })),
    ]);
    setPage(nextPage);
    setHasMore(nextPage < (movieRes.totalPages ?? 1) || nextPage < (showRes.totalPages ?? 1));
  }

  function clear() { setQuery(""); setSelected(null); setResults([]); onClear(); }

  return (
    <div className="relative">
      <label className="text-xs text-[var(--foreground-muted)] mb-1 block">Movie or TV Show</label>
      {selected ? (
        <div className="flex items-center gap-2 px-3 py-2 bg-[var(--surface-2)] border border-blue-400/50 rounded-lg">
          {selected.posterPath && <Image src={`${TMDB_POSTER}${selected.posterPath}`} alt={selected.title} width={20} height={30} className="rounded object-cover shrink-0" style={{ width: 20, height: 30 }} />}
          <span className="text-sm text-white flex-1">{selected.title} ({selected.releaseDate?.slice(0, 4)})</span>
          <button onClick={clear}><X className="w-4 h-4 text-[var(--foreground-muted)]" /></button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)]" />
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search movie or TV show…"
            className="w-full pl-9 pr-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-sm text-white placeholder-[var(--foreground-muted)] focus:outline-none focus:border-blue-400" />
        </div>
      )}
      {!selected && results.length > 0 && (
        <div className="absolute z-10 top-full mt-1 w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden shadow-lg max-h-72 overflow-y-auto">
          {results.map((m) => (
            <button key={m.id} onClick={() => { setSelected(m); setResults([]); onSelect(m); }}
              className="flex items-center gap-3 w-full px-3 py-2 hover:bg-[var(--surface-2)] text-left">
              {m.posterPath && <Image src={`${TMDB_POSTER}${m.posterPath}`} alt={m.title} width={20} height={30} className="rounded object-cover shrink-0" style={{ width: 20, height: 30 }} />}
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm text-white">{m.title}</p>
                  {m.mediaType === "tv" && (
                    <span className="inline-flex items-center gap-0.5 text-[8px] font-bold text-blue-400 bg-blue-600/20 px-1 py-0.5 rounded leading-none"><Tv className="w-2.5 h-2.5" />TV</span>
                  )}
                </div>
                <p className="text-xs text-[var(--foreground-muted)]">{m.releaseDate?.slice(0, 4)}</p>
              </div>
            </button>
          ))}
          {hasMore && (
            <button onClick={loadMore} className="w-full text-center py-2 text-xs text-[var(--foreground-muted)] hover:text-white transition-colors border-t border-[var(--border)]">
              Load more results...
            </button>
          )}
        </div>
      )}
    </div>
  );
}

type SortMode = "newest" | "score" | "following" | "critics" | "commented" | "controversial";

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
  const [searchQuery, setSearchQuery] = useState("");
  const followingIds = useFollowingIds();

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

  const searchFiltered = searchQuery.trim()
    ? items.filter((i) => {
        const q = searchQuery.toLowerCase();
        return i.movieTitle.toLowerCase().includes(q) || i.characterName.toLowerCase().includes(q) ||
          i.originalActorName.toLowerCase().includes(q) || i.suggestedActorName.toLowerCase().includes(q);
      })
    : items;

  const modeFiltered = sort === "following"
    ? searchFiltered.filter((i) => followingIds.has(i.creator.firebaseUid))
    : sort === "critics"
    ? searchFiltered.filter((i) => i.creator.isCritic)
    : searchFiltered;

  const sorted = [...modeFiltered].sort((a, b) => {
    if (sort === "score") return b.score - a.score;
    if (sort === "commented") return b.commentCount - a.commentCount;
    if (sort === "controversial") {
      const ca = a.voterIds.length >= 5 ? a.voterIds.length * (1 - Math.abs(a.score) / a.voterIds.length) : -1;
      const cb = b.voterIds.length >= 5 ? b.voterIds.length * (1 - Math.abs(b.score) / b.voterIds.length) : -1;
      return cb - ca;
    }
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
    if (!res.ok) {
      if (data.existingId) {
        setFormError(data.error ?? "Already submitted");
        setShowForm(false);
        setSelectedMovie(null);
        setOriginalActor(null);
        setSuggestedActor(null);
        setCharacterName("");
        setOriginalActorNameManual("");
        setTimeout(() => {
          document.getElementById(`recast-${data.existingId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 100);
      } else {
        setFormError(data.error ?? "Failed");
      }
      setSubmitting(false);
      return;
    }
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
        <div className="flex items-center gap-2">
          <ShareButton
            label="Share"
            text="Recast on The Ratist — vote on dream recastings of iconic roles"
            url={`${process.env.NEXT_PUBLIC_SITE_URL ?? "https://theratist.com"}/community/recast`}
            cardImageUrl="/api/og/recast"
          />
          {user && !showForm && (
            <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition-colors">
              <Plus className="w-4 h-4" /> Suggest Recast
            </button>
          )}
        </div>
      </div>
      <p className="text-[var(--foreground-muted)] mb-6">Who should have played that role? Pick a movie or TV show, submit your ideal recast, and vote on others.</p>

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
            <SignInLink className="text-blue-400 hover:underline">Sign in</SignInLink> to suggest recasts and vote.
          </p>
        </div>
      )}

      {/* Search & Sort controls */}
      {!loading && items.length > 0 && (
        <div className="flex flex-col gap-3 mb-4">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search recasts..."
              className="w-full pl-9 pr-3 py-1.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-blue-400"
            />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-[var(--foreground-muted)] mr-1">Sort:</span>
            {([
              { mode: "newest", label: "Newest", icon: Clock, gated: false },
              { mode: "score", label: "Top Rated", icon: TrendingUp, gated: false },
              { mode: "commented", label: "Most Commented", icon: MessageCircle, gated: false },
              { mode: "controversial", label: "Controversial", icon: Zap, gated: false },
              { mode: "following", label: "Following", icon: Users, gated: true },
              { mode: "critics", label: "Critics", icon: Award, gated: true },
            ] as const).filter((b) => !b.gated || !!user).map(({ mode, label, icon: Icon }) => (
              <button
                key={mode}
                onClick={() => setSort(mode)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${sort === mode ? "bg-blue-600 text-white" : "bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"}`}
              >
                <Icon className="w-3 h-3" /> {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-[var(--foreground-muted)] text-center py-20">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-[var(--foreground-muted)] text-center py-20">No suggestions yet. Be the first!</p>
      ) : sorted.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-[var(--foreground-muted)] mb-3">
            No recasts match{sort === "following" ? " from anyone you follow" : sort === "critics" ? " from critics" : sort === "controversial" ? " (need 5+ votes to qualify)" : ""}.
          </p>
          <button onClick={() => setSort("newest")} className="text-sm text-blue-400 hover:underline">Show all</button>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((item) => {
            const userVote = item.voterIds.find((v) => v.userId === user?.uid)?.value ?? 0;
            const canDelete = user && (user.uid === item.creator.firebaseUid || isAdmin);
            return (
              <div key={item.id} id={`recast-${item.id}`} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
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
                      {item.originalActorTmdbId ? (
                        <Link href={`/celebrities/${item.originalActorTmdbId}`} className="text-sm text-[var(--foreground-muted)] line-through hover:text-[var(--ratist-red)] hover:no-underline transition-colors">
                          {item.originalActorName}
                        </Link>
                      ) : (
                        <span className="text-sm text-[var(--foreground-muted)] line-through">{item.originalActorName}</span>
                      )}
                      <span className="text-blue-400 text-sm">→</span>
                      {item.suggestedActorTmdbId ? (
                        <Link href={`/celebrities/${item.suggestedActorTmdbId}`} className="flex items-center gap-1.5 hover:text-[var(--ratist-red)] transition-colors">
                          {item.suggestedActorProfile && (
                            <Image src={`${TMDB_IMG}${item.suggestedActorProfile}`} alt={item.suggestedActorName} width={20} height={20} className="w-5 h-5 rounded-full object-cover shrink-0" />
                          )}
                          <span className="text-sm font-semibold text-white hover:text-[var(--ratist-red)] transition-colors">{item.suggestedActorName}</span>
                        </Link>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          {item.suggestedActorProfile && (
                            <Image src={`${TMDB_IMG}${item.suggestedActorProfile}`} alt={item.suggestedActorName} width={20} height={20} className="w-5 h-5 rounded-full object-cover shrink-0" />
                          )}
                          <span className="text-sm font-semibold text-white">{item.suggestedActorName}</span>
                        </div>
                      )}
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
