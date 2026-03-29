"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Sparkles, ThumbsUp, ThumbsDown, Plus, Search, X } from "lucide-react";

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
  voterIds: { userId: string; value: number }[];
  creator: { name: string };
}

interface PersonResult {
  id: number;
  name: string;
  profilePath: string | null;
  department: string;
}

function PersonSearch({ label, onSelect }: { label: string; onSelect: (p: PersonResult) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PersonResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      const res = await fetch(`/api/tmdb/person?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setResults(data.results ?? []);
      setLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="relative">
      <label className="text-xs text-[var(--foreground-muted)] mb-1 block">{label}</label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)]" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search celebrity…"
          className="w-full pl-9 pr-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-sm text-white placeholder-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
        />
        {loading && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--foreground-muted)]">…</span>}
      </div>
      {results.length > 0 && (
        <div className="absolute z-10 top-full mt-1 w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden shadow-lg">
          {results.map((p) => (
            <button
              key={p.id}
              onClick={() => { onSelect(p); setQuery(p.name); setResults([]); }}
              className="flex items-center gap-3 w-full px-3 py-2 hover:bg-[var(--surface-2)] transition-colors text-left"
            >
              {p.profilePath ? (
                <Image src={`${TMDB_IMG}${p.profilePath}`} alt={p.name} width={32} height={32} className="w-8 h-8 rounded-full object-cover" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[var(--surface-2)] flex items-center justify-center text-xs text-[var(--foreground-muted)]">{p.name[0]}</div>
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

export default function LooksLikePage() {
  const { user } = useAuth();
  const [items, setItems] = useState<LooksLikeItem[]>([]);
  const [loading, setLoading] = useState(true);
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
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
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
      <p className="text-[var(--foreground-muted)] mb-8">Celebrity lookalike pairs — vote on who really could be twins.</p>

      {/* Submit Form */}
      {showForm && (
        <div className="bg-[var(--surface)] border border-purple-400/30 rounded-xl p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-white">Submit a Lookalike Pair</h2>
            <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-[var(--foreground-muted)]" /></button>
          </div>
          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <PersonSearch label="Person 1" onSelect={setPerson1} />
            <PersonSearch label="Person 2" onSelect={setPerson2} />
          </div>
          {person1 && person2 && (
            <div className="flex items-center justify-center gap-4 mb-4">
              <div className="text-center">
                {person1.profilePath ? (
                  <Image src={`${TMDB_IMG}${person1.profilePath}`} alt={person1.name} width={64} height={64} className="w-16 h-16 rounded-full object-cover mx-auto" />
                ) : <div className="w-16 h-16 rounded-full bg-[var(--surface-2)] mx-auto" />}
                <p className="text-sm text-white mt-1">{person1.name}</p>
              </div>
              <span className="text-2xl text-purple-400">≈</span>
              <div className="text-center">
                {person2.profilePath ? (
                  <Image src={`${TMDB_IMG}${person2.profilePath}`} alt={person2.name} width={64} height={64} className="w-16 h-16 rounded-full object-cover mx-auto" />
                ) : <div className="w-16 h-16 rounded-full bg-[var(--surface-2)] mx-auto" />}
                <p className="text-sm text-white mt-1">{person2.name}</p>
              </div>
            </div>
          )}
          {formError && <p className="text-red-400 text-sm mb-3">{formError}</p>}
          <button
            onClick={submitPair}
            disabled={!person1 || !person2 || submitting}
            className="w-full py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors"
          >
            {submitting ? "Submitting…" : "Submit"}
          </button>
        </div>
      )}

      {!user && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-8 text-center">
          <p className="text-sm text-[var(--foreground-muted)]">
            <Link href="/auth/signin" className="text-purple-400 hover:underline">Sign in</Link> to submit pairs and vote.
          </p>
        </div>
      )}

      {loading ? (
        <p className="text-[var(--foreground-muted)] text-center py-20">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-[var(--foreground-muted)] text-center py-20">No pairs yet. Be the first to submit one!</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => {
            const userVote = item.voterIds.find((v) => v.userId === user?.uid)?.value ?? 0;
            return (
              <div key={item.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-center justify-center gap-3">
                  <div className="text-center flex-1">
                    <div className="relative w-20 h-20 mx-auto rounded-full overflow-hidden bg-[var(--surface-2)]">
                      {item.profilePath1 ? (
                        <Image src={`${TMDB_IMG}${item.profilePath1}`} alt={item.name1} fill sizes="80px" className="object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-[var(--foreground-muted)]">{item.name1[0]}</div>
                      )}
                    </div>
                    <p className="text-sm font-medium text-white mt-2 line-clamp-1">{item.name1}</p>
                  </div>
                  <span className="text-2xl text-purple-400 shrink-0">≈</span>
                  <div className="text-center flex-1">
                    <div className="relative w-20 h-20 mx-auto rounded-full overflow-hidden bg-[var(--surface-2)]">
                      {item.profilePath2 ? (
                        <Image src={`${TMDB_IMG}${item.profilePath2}`} alt={item.name2} fill sizes="80px" className="object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-[var(--foreground-muted)]">{item.name2[0]}</div>
                      )}
                    </div>
                    <p className="text-sm font-medium text-white mt-2 line-clamp-1">{item.name2}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-[var(--border)]">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => vote(item.id, 1)}
                      disabled={!user}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${userVote === 1 ? "bg-green-500/20 text-green-400" : "text-[var(--foreground-muted)] hover:text-green-400"}`}
                    >
                      <ThumbsUp className="w-3.5 h-3.5" /> Twins
                    </button>
                    <button
                      onClick={() => vote(item.id, -1)}
                      disabled={!user}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${userVote === -1 ? "bg-red-500/20 text-red-400" : "text-[var(--foreground-muted)] hover:text-red-400"}`}
                    >
                      <ThumbsDown className="w-3.5 h-3.5" /> Nah
                    </button>
                  </div>
                  <span className={`text-sm font-semibold ${item.score > 0 ? "text-green-400" : item.score < 0 ? "text-red-400" : "text-[var(--foreground-muted)]"}`}>
                    {item.score > 0 ? "+" : ""}{item.score}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
