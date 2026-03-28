"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { Swords, Search, ThumbsUp, Check } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { posterUrl } from "@/lib/tmdb";

interface SearchResult {
  id: number;
  title: string;
  poster_path: string | null;
  release_date: string;
}

interface Argument {
  id: string;
  content: string;
  authorName: string;
  authorAvatar: string | null;
  helpfulCount: number;
  isHelpful: boolean;
  createdAt: string;
}

interface Debate {
  id: string;
  movieId: number;
  movieTitle: string;
  posterPath: string | null;
  forArguments: Argument[];
  againstArguments: Argument[];
  forVotes: number;
  againstVotes: number;
  userVote: string | null;
}

export default function PunchAndJudyPage() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<SearchResult | null>(null);
  const [debate, setDebate] = useState<Debate | null>(null);
  const [loading, setLoading] = useState(false);
  const [newArg, setNewArg] = useState({ for: "", against: "" });
  const [submitting, setSubmitting] = useState(false);

  async function searchMovies(q: string) {
    setQuery(q);
    if (q.length < 2) { setSearchResults([]); return; }
    const res = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&query=${encodeURIComponent(q)}&include_adult=false`);
    const data = await res.json();
    setSearchResults((data.results ?? []).slice(0, 6));
  }

  async function loadDebate(movie: SearchResult) {
    setSelectedMovie(movie);
    setSearchResults([]);
    setQuery(movie.title);
    setLoading(true);

    const token = user ? await user.getIdToken() : null;
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`/api/tools/punch-and-judy?movieId=${movie.id}`, { headers });
    const data = await res.json();

    if (!data.debate) {
      // Auto-create debate when first visited
      if (token) {
        const createRes = await fetch("/api/tools/punch-and-judy", {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create_debate",
            movieId: movie.id,
            movieTitle: movie.title,
            posterPath: movie.poster_path,
          }),
        });
        const created = await createRes.json();
        setDebate({
          id: created.debate.id,
          movieId: movie.id,
          movieTitle: movie.title,
          posterPath: movie.poster_path,
          forArguments: [],
          againstArguments: [],
          forVotes: 0,
          againstVotes: 0,
          userVote: null,
        });
      } else {
        setDebate(null);
      }
    } else {
      setDebate(data.debate);
    }
    setLoading(false);
  }

  async function submitArgument(side: "for" | "against") {
    if (!user || !debate || !newArg[side].trim()) return;
    setSubmitting(true);
    const token = await user.getIdToken();
    const res = await fetch("/api/tools/punch-and-judy", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add_argument", debateId: debate.id, side, content: newArg[side] }),
    });
    if (res.ok) {
      setNewArg((prev) => ({ ...prev, [side]: "" }));
      await loadDebate(selectedMovie!);
    }
    setSubmitting(false);
  }

  async function castVote(verdict: "for" | "against") {
    if (!user || !debate) return;
    const token = await user.getIdToken();
    await fetch("/api/tools/punch-and-judy", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "vote", debateId: debate.id, verdict }),
    });
    await loadDebate(selectedMovie!);
  }

  const toggleHelpful = useCallback(async (argumentId: string) => {
    if (!user || !debate) return;
    const token = await user.getIdToken();
    await fetch("/api/tools/punch-and-judy", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "helpful", argumentId }),
    });
    await loadDebate(selectedMovie!);
  }, [user, debate, selectedMovie]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalVotes = (debate?.forVotes ?? 0) + (debate?.againstVotes ?? 0);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-2">
        <Swords className="w-6 h-6 text-[var(--ratist-red)]" />
        <h1 className="text-2xl font-bold text-white">Punch &amp; Judy</h1>
      </div>
      <p className="text-[var(--foreground-muted)] mb-6">
        The structured debate format for controversial movies. See the best arguments for and against, then cast your verdict.
      </p>

      {!user && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-6 text-sm text-[var(--foreground-muted)]">
          <Link href="/auth/signin" className="text-[var(--ratist-red)] hover:underline">Sign in</Link> to submit arguments and vote.
        </div>
      )}

      {/* Movie search */}
      <div className="relative mb-8">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)]" />
        <input
          value={query}
          onChange={(e) => searchMovies(e.target.value)}
          placeholder="Search for a controversial movie..."
          className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
        />
        {searchResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl z-10 overflow-hidden">
            {searchResults.map((m) => (
              <button
                key={m.id}
                onClick={() => loadDebate(m)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--surface-2)] transition-colors text-left"
              >
                <div className="relative w-8 h-12 shrink-0 rounded overflow-hidden bg-[var(--surface-2)]">
                  {m.poster_path && (
                    <Image src={`https://image.tmdb.org/t/p/w92${m.poster_path}`} alt="" fill sizes="32px" className="object-cover" />
                  )}
                </div>
                <div>
                  <p className="text-sm text-white">{m.title}</p>
                  <p className="text-xs text-[var(--foreground-muted)]">{m.release_date?.slice(0, 4)}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Loading */}
      {loading && <p className="text-[var(--foreground-muted)] text-center py-10">Loading debate...</p>}

      {/* Debate */}
      {!loading && debate && (
        <div>
          {/* Movie header */}
          <div className="flex items-center gap-4 mb-6 pb-6 border-b border-[var(--border)]">
            {debate.posterPath && (
              <div className="relative w-14 h-20 shrink-0 rounded-lg overflow-hidden bg-[var(--surface-2)]">
                <Image src={posterUrl(debate.posterPath, "w92")} alt="" fill sizes="56px" className="object-cover" />
              </div>
            )}
            <div>
              <h2 className="text-lg font-bold text-white">{debate.movieTitle}</h2>
              <Link href={`/movies/${debate.movieId}`} className="text-xs text-[var(--ratist-red)] hover:underline">View movie →</Link>
            </div>
          </div>

          {/* Vote meter */}
          <div className="mb-8">
            <div className="flex justify-between text-xs text-[var(--foreground-muted)] mb-2">
              <span className="text-green-400 font-semibold">FOR ({debate.forVotes})</span>
              <span className="text-[var(--foreground-muted)]">{totalVotes} verdict{totalVotes !== 1 ? "s" : ""}</span>
              <span className="text-red-400 font-semibold">AGAINST ({debate.againstVotes})</span>
            </div>
            <div className="h-3 rounded-full bg-[var(--surface-2)] overflow-hidden flex">
              {totalVotes > 0 && (
                <>
                  <div
                    className="bg-green-500 transition-all duration-500"
                    style={{ width: `${(debate.forVotes / totalVotes) * 100}%` }}
                  />
                  <div
                    className="bg-red-500 transition-all duration-500"
                    style={{ width: `${(debate.againstVotes / totalVotes) * 100}%` }}
                  />
                </>
              )}
              {totalVotes === 0 && <div className="w-full bg-[var(--surface-2)]" />}
            </div>

            {/* Cast your vote */}
            {user && (
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => castVote("for")}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    debate.userVote === "for"
                      ? "bg-green-600 text-white"
                      : "bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-muted)] hover:border-green-500 hover:text-green-400"
                  }`}
                >
                  {debate.userVote === "for" && <Check className="inline w-4 h-4 mr-1" />}
                  👍 I&apos;m FOR it
                </button>
                <button
                  onClick={() => castVote("against")}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    debate.userVote === "against"
                      ? "bg-red-600 text-white"
                      : "bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-muted)] hover:border-red-500 hover:text-red-400"
                  }`}
                >
                  {debate.userVote === "against" && <Check className="inline w-4 h-4 mr-1" />}
                  👎 I&apos;m AGAINST it
                </button>
              </div>
            )}
          </div>

          {/* Arguments split */}
          <div className="grid sm:grid-cols-2 gap-6">
            {(["for", "against"] as const).map((side) => {
              const args = side === "for" ? debate.forArguments : debate.againstArguments;
              const label = side === "for" ? "Arguments FOR" : "Arguments AGAINST";
              const color = side === "for" ? "text-green-400" : "text-red-400";
              const borderColor = side === "for" ? "border-green-500" : "border-red-500";
              const bgColor = side === "for" ? "bg-green-500/10" : "bg-red-500/10";

              return (
                <div key={side}>
                  <h3 className={`text-sm font-bold ${color} uppercase tracking-wider mb-4`}>{label}</h3>

                  <div className="space-y-3 mb-4">
                    {args.length === 0 && (
                      <p className="text-xs text-[var(--foreground-muted)] italic py-2">No arguments yet. Be the first to make the case.</p>
                    )}
                    {args.map((arg) => (
                      <div key={arg.id} className={`${bgColor} border ${borderColor}/30 rounded-lg p-3`}>
                        <p className="text-sm text-white leading-relaxed mb-2">{arg.content}</p>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-[var(--foreground-muted)]">{arg.authorName}</span>
                          <button
                            onClick={() => toggleHelpful(arg.id)}
                            className={`flex items-center gap-1 text-xs transition-colors ${
                              arg.isHelpful
                                ? "text-yellow-400"
                                : "text-[var(--foreground-muted)] hover:text-yellow-400"
                            }`}
                          >
                            <ThumbsUp className="w-3 h-3" /> {arg.helpfulCount}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Add argument */}
                  {user && (
                    <div>
                      <textarea
                        value={newArg[side]}
                        onChange={(e) => setNewArg((p) => ({ ...p, [side]: e.target.value }))}
                        placeholder={`Make your case ${side === "for" ? "for" : "against"} this film...`}
                        rows={3}
                        maxLength={1000}
                        className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] resize-none"
                      />
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-xs text-[var(--foreground-muted)]">{newArg[side].length}/1000</span>
                        <button
                          onClick={() => submitArgument(side)}
                          disabled={submitting || !newArg[side].trim()}
                          className="px-4 py-1.5 bg-[var(--ratist-red)] text-white text-xs font-semibold rounded-full disabled:opacity-40 transition-opacity"
                        >
                          Submit
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Not found / needs sign in */}
      {!loading && selectedMovie && !debate && !user && (
        <div className="text-center py-10 text-[var(--foreground-muted)]">
          <p>
            <Link href="/auth/signin" className="text-[var(--ratist-red)] hover:underline">Sign in</Link> to start the debate for this movie.
          </p>
        </div>
      )}
    </div>
  );
}
