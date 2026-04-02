"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Search, X, ThumbsUp, Shuffle, Check } from "lucide-react";
import { rtdb } from "@/lib/firebase-rtdb";
import { ref, push, onValue, set, off, remove } from "firebase/database";
import { rtdbPaths } from "@/lib/screening";

const TMDB_SM = "https://image.tmdb.org/t/p/w92";

interface MovieResult { id: number; title: string; posterPath: string | null; releaseDate: string }

interface Suggestion {
  key: string;
  tmdbId: number;
  title: string;
  posterPath: string | null;
  releaseDate: string;
  suggestedBy: string;
  suggestedByName: string;
  votes: Record<string, boolean>;
}

interface Props {
  sessionId: string;
  myUserId: string;
  myName: string;
  isHost: boolean;
  onSelectMovie: (m: { id: number; title: string; posterPath: string | null }) => void;
}

export default function ScreeningMovieSuggestions({ sessionId, myUserId, myName, isHost, onSelectMovie }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MovieResult[]>([]);
  const [showSearch, setShowSearch] = useState(false);

  // Listen for suggestions
  useEffect(() => {
    if (!rtdb) return;
    const sugRef = ref(rtdb, rtdbPaths.suggestions(sessionId));
    const unsub = onValue(sugRef, (snap) => {
      const val = snap.val();
      if (!val) { setSuggestions([]); return; }
      const list: Suggestion[] = Object.entries(val).map(([key, v]) => {
        const data = v as any;
        return {
          key,
          tmdbId: data.tmdbId,
          title: data.title,
          posterPath: data.posterPath ?? null,
          releaseDate: data.releaseDate ?? "",
          suggestedBy: data.suggestedBy,
          suggestedByName: data.suggestedByName,
          votes: data.votes ?? {},
        };
      });
      setSuggestions(list);
    });
    return () => off(sugRef, "value", unsub);
  }, [sessionId]);

  // Movie search
  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/tmdb/movie/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setResults(data.results ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  async function suggestMovie(m: MovieResult) {
    if (!rtdb || !myUserId) return;
    // Check if already suggested
    if (suggestions.some((s) => s.tmdbId === m.id)) return;
    await push(ref(rtdb, rtdbPaths.suggestions(sessionId)), {
      tmdbId: m.id,
      title: m.title,
      posterPath: m.posterPath,
      releaseDate: m.releaseDate,
      suggestedBy: myUserId,
      suggestedByName: myName,
      votes: { [myUserId]: true },
    });
    setQuery("");
    setResults([]);
    setShowSearch(false);
  }

  async function toggleVote(suggestion: Suggestion) {
    if (!rtdb || !myUserId) return;
    const current = suggestion.votes[myUserId];
    if (current) {
      // Remove vote
      await remove(ref(rtdb, `${rtdbPaths.suggestions(sessionId)}/${suggestion.key}/votes/${myUserId}`));
    } else {
      await set(ref(rtdb, `${rtdbPaths.suggestions(sessionId)}/${suggestion.key}/votes/${myUserId}`), true);
    }
  }

  async function removeSuggestion(suggestion: Suggestion) {
    if (!rtdb) return;
    await remove(ref(rtdb, `${rtdbPaths.suggestions(sessionId)}/${suggestion.key}`));
  }

  function selectWinner(suggestion: Suggestion) {
    onSelectMovie({ id: suggestion.tmdbId, title: suggestion.title, posterPath: suggestion.posterPath });
    // Clear all suggestions
    if (rtdb) remove(ref(rtdb, rtdbPaths.suggestions(sessionId)));
  }

  function chooseForMe() {
    if (suggestions.length === 0) return;
    // Find max votes
    const maxVotes = Math.max(...suggestions.map((s) => Object.keys(s.votes).length));
    const tied = suggestions.filter((s) => Object.keys(s.votes).length === maxVotes);
    const winner = tied[Math.floor(Math.random() * tied.length)];
    selectWinner(winner);
  }

  // Sort by votes descending
  const sorted = [...suggestions].sort((a, b) => Object.keys(b.votes).length - Object.keys(a.votes).length);

  return (
    <div className="space-y-3">
      {/* Suggestion list */}
      {sorted.length > 0 && (
        <div className="space-y-2">
          {sorted.map((s) => {
            const voteCount = Object.keys(s.votes).length;
            const iVoted = !!s.votes[myUserId];
            const iSuggested = s.suggestedBy === myUserId;
            return (
              <div key={s.key} className="flex items-center gap-3 bg-[var(--surface-2)] rounded-lg px-3 py-2">
                <div className="w-10 h-14 rounded-lg overflow-hidden bg-[var(--surface)] flex-shrink-0">
                  {s.posterPath ? (
                    <Image src={`${TMDB_SM}${s.posterPath}`} alt={s.title} width={40} height={56} className="object-cover w-full h-full" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[8px] text-[var(--foreground-muted)]">?</div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{s.title}</p>
                  <p className="text-[10px] text-[var(--foreground-muted)]">
                    {s.releaseDate?.slice(0, 4)} · Suggested by {s.suggestedByName}
                  </p>
                </div>
                <button onClick={() => toggleVote(s)}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg transition-colors flex-shrink-0 ${iVoted ? "bg-green-500/20 text-green-400" : "bg-[var(--surface)] text-[var(--foreground-muted)] hover:text-white"}`}>
                  <ThumbsUp className="w-3 h-3" /> {voteCount}
                </button>
                {isHost && (
                  <button onClick={() => selectWinner(s)}
                    className="flex items-center gap-1 text-[10px] text-[var(--ratist-red)] hover:underline flex-shrink-0">
                    <Check className="w-3 h-3" /> Select
                  </button>
                )}
                {(iSuggested || isHost) && (
                  <button onClick={() => removeSuggestion(s)}
                    className="text-[var(--foreground-muted)] hover:text-red-400 flex-shrink-0">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Host controls */}
      {isHost && sorted.length >= 2 && (
        <button onClick={chooseForMe}
          className="flex items-center gap-2 text-xs text-[var(--foreground-muted)] hover:text-white transition-colors mx-auto">
          <Shuffle className="w-3 h-3" /> Choose for me (random from top voted)
        </button>
      )}

      {/* Add suggestion */}
      {!showSearch ? (
        <button onClick={() => setShowSearch(true)}
          className="w-full text-xs bg-[var(--surface-2)] border border-[var(--border)] rounded-lg py-2.5 text-[var(--foreground-muted)] hover:text-white hover:border-[var(--ratist-red)] transition-colors">
          + Suggest a Movie
        </button>
      ) : (
        <div className="relative">
          <div className="flex items-center gap-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2">
            <Search className="w-4 h-4 text-[var(--foreground-muted)]" />
            <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for a movie to suggest..."
              autoFocus
              className="flex-1 bg-transparent text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none" />
            <button onClick={() => { setShowSearch(false); setQuery(""); setResults([]); }}>
              <X className="w-4 h-4 text-[var(--foreground-muted)]" />
            </button>
          </div>
          {results.length > 0 && (
            <div className="absolute z-20 mt-1 w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-xl max-h-48 overflow-y-auto">
              {results.map((m) => {
                const alreadySuggested = suggestions.some((s) => s.tmdbId === m.id);
                return (
                  <button key={m.id} onClick={() => !alreadySuggested && suggestMovie(m)}
                    disabled={alreadySuggested}
                    className={`flex items-center gap-3 w-full px-3 py-2 text-left ${alreadySuggested ? "opacity-40" : "hover:bg-[var(--surface-2)]"}`}>
                    <div className="w-8 h-12 rounded overflow-hidden bg-[var(--surface-2)] flex-shrink-0">
                      {m.posterPath && <Image src={`${TMDB_SM}${m.posterPath}`} alt={m.title} width={32} height={48} className="object-cover w-full h-full" />}
                    </div>
                    <div>
                      <p className="text-sm text-white">{m.title}</p>
                      <p className="text-xs text-[var(--foreground-muted)]">{m.releaseDate?.slice(0, 4)}</p>
                    </div>
                    {alreadySuggested && <span className="text-[9px] text-[var(--foreground-muted)] ml-auto">Already suggested</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {sorted.length === 0 && !showSearch && (
        <p className="text-[10px] text-[var(--foreground-muted)] text-center">No suggestions yet. Be the first!</p>
      )}
    </div>
  );
}
