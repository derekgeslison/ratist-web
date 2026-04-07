"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ThumbsUp, Search, Plus, X, Clock, TrendingUp } from "lucide-react";
import { posterUrl } from "@/lib/tmdb";

interface Nomination {
  id: string; tmdbId: number; title: string; posterPath: string | null;
  submittedBy: string; voteCount: number; userVoted: boolean;
}

export default function NominationsPage() {
  const { weekId } = useParams<{ weekId: string }>();
  const { user } = useAuth();
  const [nominations, setNominations] = useState<Nomination[]>([]);
  const [userVoteCount, setUserVoteCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<"popular" | "newest">("popular");

  // Nominate form
  const [showNominate, setShowNominate] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: number; title: string; posterPath: string | null; releaseDate: string }[]>([]);
  const [nominating, setNominating] = useState(false);
  const [pendingNomination, setPendingNomination] = useState<{ id: number; title: string; posterPath: string | null } | null>(null);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      if (user) { const token = await user.getIdToken(); headers.Authorization = `Bearer ${token}`; }
      const res = await fetch("/api/movie-club/weeks", { headers });
      if (res.ok) {
        const data = await res.json();
        const votingWeek = (data.votingWeeks ?? []).find((w: { id: string }) => w.id === weekId);
        if (votingWeek) {
          setNominations(votingWeek.nominations ?? []);
          setUserVoteCount(data.userVoteCount ?? 0);
        }
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [user, weekId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Movie search
  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/tmdb/movie/search?q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      setSearchResults(data.results ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  async function nominate(movie: { id: number; title: string; posterPath: string | null }) {
    if (!user || nominating) return;
    setNominating(true); setError("");
    const token = await user.getIdToken();
    const res = await fetch("/api/movie-club/vote", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ weekId, tmdbId: movie.id, title: movie.title, posterPath: movie.posterPath, action: "nominate" }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Failed"); }
    else { setShowNominate(false); setSearchQuery(""); setSearchResults([]); fetchData(); }
    setNominating(false);
  }

  async function voteFor(nominationId: string) {
    if (!user || userVoteCount >= 3) return;
    const token = await user.getIdToken();
    const res = await fetch("/api/movie-club/vote", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ weekId, tmdbId: nominationId, action: "vote" }),
    });
    if (res.ok) fetchData();
  }

  const sorted = [...nominations].sort((a, b) => sort === "popular" ? b.voteCount - a.voteCount : 0);

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <Link href="/community/movie-club" className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Movie Club
      </Link>

      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-white">Nominate & Vote</h1>
        {user && !showNominate && (
          <button onClick={() => setShowNominate(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white rounded-lg text-sm font-semibold transition-colors">
            <Plus className="w-4 h-4" /> Nominate
          </button>
        )}
      </div>
      <p className="text-[var(--foreground-muted)] mb-1">Suggest movies for this week. Vote for up to 3.</p>
      <p className="text-xs text-[var(--foreground-muted)] mb-6">Voting closes Tuesday night. Winner revealed Wednesday at 2:00 AM ET.</p>

      {user && <p className="text-xs text-[var(--foreground-muted)] mb-4">{3 - userVoteCount} vote{3 - userVoteCount !== 1 ? "s" : ""} remaining</p>}

      {/* Nominate form */}
      {showNominate && (
        <div className="bg-[var(--surface)] border border-[var(--ratist-red)]/30 rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white">Search for a Movie</h2>
            <button onClick={() => { setShowNominate(false); setSearchQuery(""); setSearchResults([]); setError(""); }}>
              <X className="w-5 h-5 text-[var(--foreground-muted)]" />
            </button>
          </div>
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)]" />
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search movies..."
              className="w-full pl-9 pr-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]" />
          </div>
          {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

          {/* Confirmation step */}
          {pendingNomination && (
            <div className="bg-[var(--ratist-red)]/10 border border-[var(--ratist-red)]/30 rounded-lg p-3 mb-2 flex items-center gap-3">
              {pendingNomination.posterPath && <Image src={posterUrl(pendingNomination.posterPath, "w92")} alt="" width={32} height={48} className="rounded shrink-0" />}
              <div className="flex-1">
                <p className="text-sm text-white font-medium">{pendingNomination.title}</p>
                <p className="text-xs text-[var(--foreground-muted)]">Ready to nominate?</p>
              </div>
              <button onClick={() => { nominate(pendingNomination); setPendingNomination(null); }} disabled={nominating}
                className="px-3 py-1.5 bg-[var(--ratist-red)] text-white text-xs font-semibold rounded-lg disabled:opacity-50">
                {nominating ? "..." : "Submit"}
              </button>
              <button onClick={() => setPendingNomination(null)} className="text-xs text-[var(--foreground-muted)] hover:text-white">Cancel</button>
            </div>
          )}

          {searchResults.length > 0 && !pendingNomination && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {searchResults.map((m) => {
                const alreadyNominated = nominations.some((n) => n.tmdbId === m.id);
                return (
                  <button key={m.id} onClick={() => { if (!alreadyNominated) { setPendingNomination(m); setSearchResults([]); setSearchQuery(""); } }} disabled={alreadyNominated}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left ${alreadyNominated ? "opacity-40" : "hover:bg-[var(--surface-2)]"}`}>
                    {m.posterPath && <Image src={posterUrl(m.posterPath, "w92")} alt="" width={28} height={42} className="rounded w-7 h-10 object-cover shrink-0" />}
                    <div className="flex-1">
                      <p className="text-sm text-white">{m.title}</p>
                      <p className="text-xs text-[var(--foreground-muted)]">{m.releaseDate?.slice(0, 4)}</p>
                    </div>
                    {alreadyNominated && <span className="text-[9px] text-[var(--foreground-muted)]">Already nominated</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Sort */}
      {nominations.length > 0 && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-[var(--foreground-muted)]">Sort:</span>
          <button onClick={() => setSort("popular")} className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${sort === "popular" ? "bg-[var(--ratist-red)] text-white" : "bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-muted)]"}`}>
            <TrendingUp className="w-3 h-3 inline mr-1" />Most Voted
          </button>
          <button onClick={() => setSort("newest")} className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${sort === "newest" ? "bg-[var(--ratist-red)] text-white" : "bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-muted)]"}`}>
            <Clock className="w-3 h-3 inline mr-1" />Newest
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-[var(--foreground-muted)] text-center py-20">Loading...</p>
      ) : nominations.length === 0 ? (
        <p className="text-[var(--foreground-muted)] text-center py-20">No nominations yet. Be the first to suggest a movie!</p>
      ) : (
        <div className="space-y-2">
          {sorted.map((nom) => (
            <div key={nom.id} className="flex items-center gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
              {nom.posterPath && <Image src={posterUrl(nom.posterPath, "w92")} alt="" width={36} height={54} className="rounded w-9 h-14 object-cover shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{nom.title}</p>
                <p className="text-xs text-[var(--foreground-muted)]">Submitted by {nom.submittedBy}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-bold text-white">{nom.voteCount}</span>
                <button
                  onClick={() => voteFor(nom.id)}
                  disabled={!user || nom.userVoted || userVoteCount >= 3}
                  className={`p-2 rounded-lg transition-colors ${
                    nom.userVoted ? "text-[var(--ratist-red)] bg-[var(--ratist-red)]/10" : "text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] hover:bg-[var(--surface-2)]"
                  } disabled:opacity-50`}
                >
                  <ThumbsUp className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
