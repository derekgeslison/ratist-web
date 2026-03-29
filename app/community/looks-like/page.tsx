"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Sparkles, ThumbsUp, ThumbsDown, Plus, Search, X, Clock, TrendingUp } from "lucide-react";

const TMDB_IMG = "https://image.tmdb.org/t/p/w185";

interface LooksLikeItem {
  id: string;
  tmdbPersonId1: number;
  name1: string;
  profilePath1: string | null;
  tmdbPersonId2: number;
  name2: string;
  profilePath2: string | null;
  score: number;
  createdAt: string;
  voterIds: { userId: string; value: number }[];
  creator: { name: string };
}

interface PersonResult {
  id: number;
  name: string;
  profilePath: string | null;
  department: string;
}

function PersonSearch({ label, onSelect, onClear }: { label: string; onSelect: (p: PersonResult) => void; onClear: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PersonResult[]>([]);
  const [selected, setSelected] = useState<PersonResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selected || query.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      const res = await fetch(`/api/tmdb/person?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setResults(data.results ?? []);
      setLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query, selected]);

  function clear() {
    setQuery("");
    setSelected(null);
    setResults([]);
    onClear();
  }

  return (
    <div className="relative">
      <label className="text-xs text-[var(--foreground-muted)] mb-1 block">{label}</label>
      {selected ? (
        <div className="flex items-center gap-2 px-3 py-2 bg-[var(--surface-2)] border border-purple-400/50 rounded-lg">
          {selected.profilePath ? (
            <Image src={`${TMDB_IMG}${selected.profilePath}`} alt={selected.name} width={24} height={24} className="w-6 h-6 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-[var(--surface)] shrink-0" />
          )}
          <span className="text-sm text-white flex-1">{selected.name}</span>
          <button onClick={clear} className="text-[var(--foreground-muted)] hover:text-white"><X className="w-4 h-4" /></button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search celebrity…"
            className="w-full pl-9 pr-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-sm text-white placeholder-[var(--foreground-muted)] focus:outline-none focus:border-purple-400"
          />
          {loading && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--foreground-muted)]">…</span>}
        </div>
      )}
      {!selected && results.length > 0 && (
        <div className="absolute z-10 top-full mt-1 w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden shadow-lg">
          {results.map((p) => (
            <button
              key={p.id}
              onClick={() => { setSelected(p); setResults([]); onSelect(p); }}
              className="flex items-center gap-3 w-full px-3 py-2 hover:bg-[var(--surface-2)] transition-colors text-left"
            >
              {p.profilePath ? (
                <Image src={`${TMDB_IMG}${p.profilePath}`} alt={p.name} width={28} height={28} className="w-7 h-7 rounded-full object-cover" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-[var(--surface-2)] flex items-center justify-center text-xs text-[var(--foreground-muted)]">{p.name[0]}</div>
              )}
              <div>
                <p className="text-sm font-medium text-white">{p.name}</p>
                <p className="text-xs text-[var(--foreground-muted)]">{p.department}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type SortMode = "newest" | "score";

export default function LooksLikePage() {
  const { user } = useAuth();
  const [items, setItems] = useState<LooksLikeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortMode>("newest");
  const [showForm, setShowForm] = useState(false);
  const [person1, setPerson1] = useState<PersonResult | null>(null);
  const [person2, setPerson2] = useState<PersonResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const fetchItems = useCallback(async () => {
    const res = await fetch("/api/community/looks-like");
    const data = await res.json();
    setItems(data.items ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const sorted = [...items].sort((a, b) => {
    if (sort === "score") return b.score - a.score;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  async function vote(itemId: string, value: 1 | -1) {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch(`/api/community/looks-like/${itemId}/vote`, {
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

  async function submitPair() {
    if (!person1 || !person2 || !user) return;
    setSubmitting(true);
    setFormError("");
    const token = await user.getIdToken();
    const res = await fetch("/api/community/looks-like", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        tmdbPersonId1: person1.id,
        name1: person1.name,
        profilePath1: person1.profilePath,
        tmdbPersonId2: person2.id,
        name2: person2.name,
        profilePath2: person2.profilePath,
      }),
    });
    const data = await res.json();
    if (!res.ok) { setFormError(data.error ?? "Failed to submit"); setSubmitting(false); return; }
    setShowForm(false);
    setPerson1(null);
    setPerson2(null);
    fetchItems();
    setSubmitting(false);
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <Link href="/community" className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Community Hub
      </Link>

      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <Sparkles className="w-6 h-6 text-purple-400" />
          <h1 className="text-2xl font-bold text-white">Looks Like</h1>
        </div>
        {user && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" /> Submit Pair
          </button>
        )}
      </div>
      <p className="text-[var(--foreground-muted)] mb-6">Celebrity lookalike pairs — vote on who really could be twins.</p>

      {/* Submit Form */}
      {showForm && (
        <div className="bg-[var(--surface)] border border-purple-400/30 rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">Submit a Lookalike Pair</h2>
            <button onClick={() => { setShowForm(false); setPerson1(null); setPerson2(null); }}><X className="w-5 h-5 text-[var(--foreground-muted)]" /></button>
          </div>
          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <PersonSearch label="Person 1" onSelect={setPerson1} onClear={() => setPerson1(null)} />
            <PersonSearch label="Person 2" onSelect={setPerson2} onClear={() => setPerson2(null)} />
          </div>
          {formError && <p className="text-red-400 text-sm mb-3">{formError}</p>}
          <button
            onClick={submitPair}
            disabled={!person1 || !person2 || submitting}
            className="w-full py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors"
          >
            {submitting ? "Submitting…" : "Submit Pair"}
          </button>
        </div>
      )}

      {!user && !showForm && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-6 text-center">
          <p className="text-sm text-[var(--foreground-muted)]">
            <Link href="/auth/signin" className="text-purple-400 hover:underline">Sign in</Link> to submit pairs and vote.
          </p>
        </div>
      )}

      {/* Sort controls */}
      {!loading && items.length > 0 && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-[var(--foreground-muted)]">Sort:</span>
          <button
            onClick={() => setSort("newest")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${sort === "newest" ? "bg-purple-600 text-white" : "bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"}`}
          >
            <Clock className="w-3 h-3" /> Newest
          </button>
          <button
            onClick={() => setSort("score")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${sort === "score" ? "bg-purple-600 text-white" : "bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"}`}
          >
            <TrendingUp className="w-3 h-3" /> Top Rated
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-[var(--foreground-muted)] text-center py-20">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-[var(--foreground-muted)] text-center py-20">No pairs yet. Be the first to submit one!</p>
      ) : (
        <div className="space-y-3">
          {sorted.map((item) => {
            const userVote = item.voterIds.find((v) => v.userId === user?.uid)?.value ?? 0;
            return (
              <div key={item.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex items-center gap-4">
                {/* Person 1 */}
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <div className="relative w-12 h-12 shrink-0 rounded-full overflow-hidden bg-[var(--surface-2)]">
                    {item.profilePath1 ? (
                      <Image src={`${TMDB_IMG}${item.profilePath1}`} alt={item.name1} fill sizes="48px" className="object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-lg font-bold text-[var(--foreground-muted)]">{item.name1[0]}</div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{item.name1}</p>
                  </div>
                </div>

                {/* VS badge */}
                <span className="text-lg text-purple-400 font-bold shrink-0">≈</span>

                {/* Person 2 */}
                <div className="flex items-center gap-2.5 flex-1 min-w-0 justify-end">
                  <div className="min-w-0 text-right">
                    <p className="text-sm font-medium text-white truncate">{item.name2}</p>
                  </div>
                  <div className="relative w-12 h-12 shrink-0 rounded-full overflow-hidden bg-[var(--surface-2)]">
                    {item.profilePath2 ? (
                      <Image src={`${TMDB_IMG}${item.profilePath2}`} alt={item.name2} fill sizes="48px" className="object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-lg font-bold text-[var(--foreground-muted)]">{item.name2[0]}</div>
                    )}
                  </div>
                </div>

                {/* Vote controls */}
                <div className="flex flex-col items-center gap-0.5 shrink-0 border-l border-[var(--border)] pl-4 ml-2">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => vote(item.id, 1)}
                      disabled={!user}
                      title="Twins!"
                      className={`p-1.5 rounded transition-colors ${userVote === 1 ? "bg-green-500/20 text-green-400" : "text-[var(--foreground-muted)] hover:text-green-400 disabled:cursor-not-allowed"}`}
                    >
                      <ThumbsUp className="w-4 h-4" />
                    </button>
                    <span className={`text-sm font-semibold w-8 text-center ${item.score > 0 ? "text-green-400" : item.score < 0 ? "text-red-400" : "text-[var(--foreground-muted)]"}`}>
                      {item.score > 0 ? "+" : ""}{item.score}
                    </span>
                    <button
                      onClick={() => vote(item.id, -1)}
                      disabled={!user}
                      title="Nah"
                      className={`p-1.5 rounded transition-colors ${userVote === -1 ? "bg-red-500/20 text-red-400" : "text-[var(--foreground-muted)] hover:text-red-400 disabled:cursor-not-allowed"}`}
                    >
                      <ThumbsDown className="w-4 h-4" />
                    </button>
                  </div>
                  <span className="text-xs text-[var(--foreground-muted)]">{item.voterIds.length} vote{item.voterIds.length !== 1 ? "s" : ""}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
