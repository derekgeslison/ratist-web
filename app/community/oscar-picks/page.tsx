"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import Image from "next/image";
import Link from "next/link";
import SignInLink from "@/components/SignInLink";
import { ArrowLeft, Trophy, CheckCircle2, Lock, MessageCircle, Plus, ThumbsUp, Search } from "lucide-react";
import CommentSection from "@/components/CommentSection";
import AdUnit from "@/components/AdUnit";

const TMDB_IMG = "https://image.tmdb.org/t/p/w92";

interface Nominee {
  id: string;
  movieTitle: string;
  posterPath: string | null;
  nomineeDetail: string | null;
  isWinner: boolean;
  tmdbMovieId: number | null;
}

interface CategoryVote {
  nomineeId: string;
  count: number;
}

interface Category {
  id: string;
  name: string;
  nominees: Nominee[];
  votes: { nomineeId: string; userId: string }[];
  commentCount: number;
}

interface OscarYear {
  id: string;
  year: number;
  isComplete: boolean;
  ceremonyDate: string | null;
  categories: Category[];
}

export default function OscarPicksPage() {
  const { user } = useAuth();
  const [years, setYears] = useState<OscarYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeYear, setActiveYear] = useState<string | null>(null);
  // categoryId -> votes (optimistic)
  const [voteCounts, setVoteCounts] = useState<Record<string, CategoryVote[]>>({});
  // categoryId -> my vote nomineeId
  const [myVotes, setMyVotes] = useState<Record<string, string>>({});
  const [votingCategoryId, setVotingCategoryId] = useState<string | null>(null);
  const [expandedComments, setExpandedComments] = useState<string | null>(null);
  const [suggestingCategory, setSuggestingCategory] = useState<string | null>(null);
  const [suggestQuery, setSuggestQuery] = useState("");
  const [suggestResults, setSuggestResults] = useState<{ id: number; title: string; posterPath: string | null; releaseDate: string | null }[]>([]);
  const [suggestDetail, setSuggestDetail] = useState("");
  const [suggestions, setSuggestions] = useState<Record<string, { id: string; movieTitle: string; posterPath: string | null; nomineeDetail: string | null; secondCount: number; isApproved: boolean; secondedByMe: boolean }[]>>({});
  const [suggestSubmitting, setSuggestSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/community/oscar-picks")
      .then((r) => r.json())
      .then((data) => {
        const y: OscarYear[] = data.years ?? [];
        setYears(y);
        if (y.length > 0) setActiveYear(y[0].id);

        // Initialize vote counts and my votes from server data
        const counts: Record<string, CategoryVote[]> = {};
        const mine: Record<string, string> = {};
        y.forEach((year) => {
          year.categories.forEach((cat) => {
            // Tally votes
            const tally: Record<string, number> = {};
            cat.votes.forEach((v) => { tally[v.nomineeId] = (tally[v.nomineeId] ?? 0) + 1; });
            counts[cat.id] = Object.entries(tally).map(([nomineeId, count]) => ({ nomineeId, count }));
          });
        });
        setVoteCounts(counts);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Set my votes once user is available
  useEffect(() => {
    if (!user) return;
    const mine: Record<string, string> = {};
    years.forEach((year) => {
      year.categories.forEach((cat) => {
        const myVote = cat.votes.find((v) => v.userId === user.uid);
        if (myVote) mine[cat.id] = myVote.nomineeId;
      });
    });
    setMyVotes(mine);
  }, [user, years]);

  async function loadSuggestions(categoryId: string) {
    const headers: Record<string, string> = {};
    if (user) { const token = await user.getIdToken(); headers["Authorization"] = `Bearer ${token}`; }
    const res = await fetch(`/api/community/oscar-picks/suggest?categoryId=${categoryId}`, { headers });
    if (res.ok) {
      const data = await res.json();
      setSuggestions((prev) => ({ ...prev, [categoryId]: data.suggestions }));
    }
  }

  async function searchForSuggestion(q: string) {
    setSuggestQuery(q);
    if (q.length < 2) { setSuggestResults([]); return; }
    const res = await fetch(`/api/tmdb/movie/search?q=${encodeURIComponent(q)}`);
    if (res.ok) {
      const data = await res.json();
      setSuggestResults(data.results?.map((r: { id: number; title: string; posterPath: string | null; releaseDate: string | null }) => r) ?? []);
    }
  }

  async function submitSuggestion(categoryId: string, movie: { id: number; title: string; posterPath: string | null }) {
    if (!user || suggestSubmitting) return;
    setSuggestSubmitting(true);
    const token = await user.getIdToken();
    const res = await fetch("/api/community/oscar-picks/suggest", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "suggest",
        categoryId,
        tmdbMovieId: movie.id,
        movieTitle: movie.title,
        posterPath: movie.posterPath,
        nomineeDetail: suggestDetail.trim() || undefined,
      }),
    });
    if (res.ok) {
      setSuggestQuery("");
      setSuggestResults([]);
      setSuggestDetail("");
      setSuggestingCategory(null);
      await loadSuggestions(categoryId);
    }
    setSuggestSubmitting(false);
  }

  async function secondSuggestion(categoryId: string, suggestionId: string) {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch("/api/community/oscar-picks/suggest", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "second", suggestionId }),
    });
    if (res.ok) {
      await loadSuggestions(categoryId);
    }
  }

  async function castVote(categoryId: string, nomineeId: string, yearComplete: boolean) {
    if (!user || yearComplete || votingCategoryId) return;
    const prevVote = myVotes[categoryId];
    if (prevVote === nomineeId) return; // already voted for this

    setVotingCategoryId(categoryId);

    // Optimistic update
    setMyVotes((prev) => ({ ...prev, [categoryId]: nomineeId }));
    setVoteCounts((prev) => {
      const current = prev[categoryId] ?? [];
      const updated = current.filter((v) => v.nomineeId !== nomineeId && v.nomineeId !== prevVote);
      const prevCount = current.find((v) => v.nomineeId === prevVote)?.count ?? 0;
      const newCount = (current.find((v) => v.nomineeId === nomineeId)?.count ?? 0) + 1;
      if (prevVote) updated.push({ nomineeId: prevVote, count: Math.max(0, prevCount - 1) });
      updated.push({ nomineeId, count: newCount });
      return { ...prev, [categoryId]: updated };
    });

    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/community/oscar-picks/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ categoryId, nomineeId }),
      });
      if (res.ok) {
        const { votes } = await res.json();
        setVoteCounts((prev) => ({ ...prev, [categoryId]: votes }));
      }
    } finally {
      setVotingCategoryId(null);
    }
  }

  const activeYearData = years.find((y) => y.id === activeYear);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <Link href="/community" className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Community Hub
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <Trophy className="w-6 h-6 text-yellow-400" />
        <h1 className="text-2xl font-bold text-white">Oscar Picks</h1>
      </div>
      <p className="text-[var(--foreground-muted)] mb-8">Vote for your picks before the ceremony. See how the community compares to the real winners.</p>

      <AdUnit slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_COMMUNITY ?? ""} format="auto" className="mb-6" />

      {loading ? (
        <p className="text-[var(--foreground-muted)] text-center py-20">Loading…</p>
      ) : years.length === 0 ? (
        <div className="text-center py-20">
          <Trophy className="w-12 h-12 text-[var(--foreground-muted)] mx-auto mb-3" />
          <p className="text-[var(--foreground-muted)]">Oscar picks coming soon. Check back closer to the ceremony!</p>
        </div>
      ) : (
        <>
          {/* Year Tabs */}
          {years.length > 1 && (
            <div className="flex gap-2 mb-8 overflow-x-auto pb-1">
              {years.map((y) => (
                <button
                  key={y.id}
                  onClick={() => setActiveYear(y.id)}
                  className={`shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    activeYear === y.id
                      ? "bg-yellow-500 text-black"
                      : "bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"
                  }`}
                >
                  {y.year} {y.isComplete && <Lock className="w-3 h-3 inline ml-1" />}
                </button>
              ))}
            </div>
          )}

          {activeYearData && (
            <div>
              {activeYearData.isComplete ? (
                <div className="flex items-center gap-2 px-4 py-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl mb-6">
                  <Lock className="w-4 h-4 text-yellow-400" />
                  <p className="text-sm text-yellow-300">The {activeYearData.year} ceremony has taken place. Voting is closed. <Trophy className="w-3.5 h-3.5 inline" /> marks the real winners.</p>
                </div>
              ) : activeYearData.categories.some((c) => c.nominees.some((n) => n.isWinner)) && (
                <div className="flex items-center gap-2 px-4 py-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl mb-6">
                  <Trophy className="w-4 h-4 text-yellow-400" />
                  <p className="text-sm text-yellow-300">Real winners are being revealed for {activeYearData.year}. <Trophy className="w-3.5 h-3.5 inline" /> marks each real winner.</p>
                </div>
              )}

              {!user && !activeYearData.isComplete && (
                <div className="px-4 py-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl mb-6 text-center">
                  <p className="text-sm text-[var(--foreground-muted)]">
                    <SignInLink className="text-yellow-400 hover:underline">Sign in</SignInLink> to cast your picks.
                  </p>
                </div>
              )}

              <div className="space-y-8">
                {activeYearData.categories.map((cat) => {
                  const categoryVotes = voteCounts[cat.id] ?? [];
                  const totalVotes = categoryVotes.reduce((sum, v) => sum + v.count, 0);
                  const myPick = myVotes[cat.id];

                  return (
                    <div key={cat.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
                      <div className="px-5 py-3 border-b border-[var(--border)] bg-[var(--surface-2)]">
                        <h2 className="text-sm font-semibold text-yellow-400 uppercase tracking-wider">{cat.name}</h2>
                      </div>
                      <div className="p-4 space-y-2">
                        {cat.nominees.map((nominee) => {
                          const voteCount = categoryVotes.find((v) => v.nomineeId === nominee.id)?.count ?? 0;
                          const pct = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
                          const isMyPick = myPick === nominee.id;
                          const isWinner = nominee.isWinner;

                          return (
                            <button
                              key={nominee.id}
                              onClick={() => castVote(cat.id, nominee.id, activeYearData.isComplete)}
                              disabled={activeYearData.isComplete || !user || votingCategoryId === cat.id}
                              className={`relative w-full text-left rounded-lg overflow-hidden border transition-all ${
                                isWinner
                                  ? "border-yellow-400 bg-yellow-500/10"
                                  : isMyPick
                                  ? "border-[var(--ratist-red)] bg-[var(--ratist-red)]/5"
                                  : "border-[var(--border)] hover:border-[var(--foreground-muted)]"
                              } ${activeYearData.isComplete || !user ? "cursor-default" : "cursor-pointer"}`}
                            >
                              {/* Progress bar */}
                              {totalVotes > 0 && (
                                <div
                                  className={`absolute inset-y-0 left-0 ${isWinner ? "bg-yellow-500/15" : "bg-[var(--ratist-red)]/10"} transition-all`}
                                  style={{ width: `${pct}%` }}
                                />
                              )}
                              <div className="relative flex items-center gap-3 px-4 py-3">
                                {nominee.posterPath && (
                                  <Image
                                    src={`${TMDB_IMG}${nominee.posterPath}`}
                                    alt={nominee.movieTitle}
                                    width={32}
                                    height={48}
                                    className="rounded shrink-0 object-cover"
                                    style={{ width: 32, height: 48 }}
                                  />
                                )}
                                <div className="flex-1 min-w-0">
                                  {nominee.nomineeDetail ? (
                                    <>
                                      <p className={`text-sm font-medium ${isWinner ? "text-yellow-300" : "text-white"}`}>
                                        {nominee.nomineeDetail}
                                      </p>
                                      <p className="text-xs text-[var(--foreground-muted)]">{nominee.movieTitle}</p>
                                    </>
                                  ) : (
                                    <p className={`text-sm font-medium ${isWinner ? "text-yellow-300" : "text-white"}`}>
                                      {nominee.movieTitle}
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {totalVotes > 0 && (
                                    <span className="text-xs text-[var(--foreground-muted)]">{pct}%</span>
                                  )}
                                  {isMyPick && !activeYearData.isComplete && (
                                    <CheckCircle2 className="w-4 h-4 text-[var(--ratist-red)]" />
                                  )}
                                  {isWinner && (
                                    <Trophy className="w-4 h-4 text-yellow-400" />
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      {totalVotes > 0 && (
                        <div className="px-5 py-2 border-t border-[var(--border)] text-xs text-[var(--foreground-muted)]">
                          {totalVotes} vote{totalVotes !== 1 ? "s" : ""}
                        </div>
                      )}

                      {/* Suggest + Comment row */}
                      <div className="px-5 py-2 border-t border-[var(--border)] flex items-center gap-4">
                        {user && !activeYearData.isComplete && (
                          <button
                            onClick={() => {
                              if (suggestingCategory === cat.id) { setSuggestingCategory(null); }
                              else { setSuggestingCategory(cat.id); loadSuggestions(cat.id); }
                            }}
                            className="flex items-center gap-1.5 text-xs text-[var(--foreground-muted)] hover:text-yellow-400 transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            {suggestingCategory === cat.id ? "Hide Suggestions" : "Suggest Nominee"}
                          </button>
                        )}
                        <button
                          onClick={() => setExpandedComments(expandedComments === cat.id ? null : cat.id)}
                          className="flex items-center gap-1.5 text-xs text-[var(--foreground-muted)] hover:text-white transition-colors"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          {expandedComments === cat.id ? "Hide Comments" : "Comments"}
                          {cat.commentCount > 0 && (
                            <span className="text-xs text-[var(--foreground-muted)]">({cat.commentCount})</span>
                          )}
                        </button>
                      </div>

                      {/* Suggestions panel */}
                      {suggestingCategory === cat.id && (
                        <div className="px-5 py-3 border-t border-[var(--border)] bg-[var(--surface-2)]/50">
                          {/* Search to suggest */}
                          <div className="relative mb-3">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--foreground-muted)]" />
                            <input
                              type="text"
                              value={suggestQuery}
                              onChange={(e) => searchForSuggestion(e.target.value)}
                              placeholder="Search for a movie to suggest..."
                              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-yellow-400"
                            />
                          </div>
                          {suggestResults.length > 0 && (
                            <div className="space-y-1 mb-3 max-h-40 overflow-y-auto">
                              {suggestResults.map((movie) => (
                                <button
                                  key={movie.id}
                                  onClick={() => submitSuggestion(cat.id, movie)}
                                  disabled={suggestSubmitting}
                                  className="flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg hover:bg-[var(--surface)] transition-colors"
                                >
                                  {movie.posterPath && (
                                    <Image src={`${TMDB_IMG}${movie.posterPath}`} alt="" width={24} height={36} className="rounded shrink-0" />
                                  )}
                                  <div className="min-w-0">
                                    <p className="text-sm text-white truncate">{movie.title}</p>
                                    {movie.releaseDate && <p className="text-[10px] text-[var(--foreground-muted)]">{movie.releaseDate.slice(0, 4)}</p>}
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Pending suggestions */}
                          {(suggestions[cat.id] ?? []).filter((s) => !s.isApproved).length > 0 && (
                            <div className="space-y-2 mt-3">
                              <p className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wider">Community Suggestions</p>
                              {(suggestions[cat.id] ?? []).filter((s) => !s.isApproved).map((s) => (
                                <div key={s.id} className="flex items-center gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2">
                                  {s.posterPath && (
                                    <Image src={`${TMDB_IMG}${s.posterPath}`} alt="" width={24} height={36} className="rounded shrink-0" />
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm text-white truncate">{s.movieTitle}</p>
                                    {s.nomineeDetail && <p className="text-[10px] text-[var(--foreground-muted)]">{s.nomineeDetail}</p>}
                                    <p className="text-[10px] text-[var(--foreground-muted)]">{s.secondCount}/50 seconds needed</p>
                                  </div>
                                  <button
                                    onClick={() => secondSuggestion(cat.id, s.id)}
                                    disabled={s.secondedByMe}
                                    className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                                      s.secondedByMe
                                        ? "border-yellow-400/30 bg-yellow-400/10 text-yellow-400"
                                        : "border-[var(--border)] text-[var(--foreground-muted)] hover:border-yellow-400 hover:text-yellow-400"
                                    }`}
                                  >
                                    <ThumbsUp className="w-3 h-3" /> {s.secondedByMe ? "Seconded" : "Second"}
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {expandedComments === cat.id && (
                        <div className="px-5 py-2 border-t border-[var(--border)]">
                          <CommentSection targetType="oscar_category" targetId={cat.id} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
