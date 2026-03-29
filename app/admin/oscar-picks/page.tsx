"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Trophy, Plus, CheckCircle2, Lock, Trash2 } from "lucide-react";
import Image from "next/image";

const TMDB_POSTER = "https://image.tmdb.org/t/p/w92";

// Standard Oscar categories for quick-add
const STANDARD_CATEGORIES = [
  "Best Picture", "Best Director", "Best Actor", "Best Actress",
  "Best Supporting Actor", "Best Supporting Actress", "Best Original Screenplay",
  "Best Adapted Screenplay", "Best Animated Feature", "Best International Feature Film",
  "Best Documentary Feature", "Best Original Score", "Best Original Song",
  "Best Cinematography", "Best Film Editing", "Best Costume Design",
  "Best Production Design", "Best Makeup and Hairstyling", "Best Visual Effects",
  "Best Sound",
];

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

interface Nominee {
  id: string;
  movieTitle: string;
  posterPath: string | null;
  nomineeDetail: string | null;
  isWinner: boolean;
}

interface Category {
  id: string;
  name: string;
  nominees: Nominee[];
  _count?: { votes: number };
}

interface OscarYear {
  id: string;
  year: number;
  isComplete: boolean;
  categories: Category[];
}

export default function AdminOscarPicksPage() {
  const { user } = useAuth();
  const [years, setYears] = useState<OscarYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeYear, setActiveYear] = useState<string | null>(null);
  const [newYear, setNewYear] = useState("");
  const [newCatName, setNewCatName] = useState("");
  const [customCat, setCustomCat] = useState(false);
  const [newNomCatId, setNewNomCatId] = useState("");
  const [movieSearchQuery, setMovieSearchQuery] = useState("");
  const [movieSearchResults, setMovieSearchResults] = useState<{ id: number; title: string; posterPath: string | null }[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<{ id: number; title: string; posterPath: string | null } | null>(null);
  const [nomineeDetail, setNomineeDetail] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  async function fetchYears() {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch("/api/admin/oscar-picks", { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    setYears(data.years ?? []);
    if (data.years?.length > 0 && !activeYear) setActiveYear(data.years[0].id);
    setLoading(false);
  }

  useEffect(() => { fetchYears(); }, [user]); // eslint-disable-line

  useEffect(() => {
    if (movieSearchQuery.length < 2) { setMovieSearchResults([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/tmdb/movie/search?q=${encodeURIComponent(movieSearchQuery)}`);
      const data = await res.json();
      setMovieSearchResults(data.results ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [movieSearchQuery]);

  async function doAction(payload: Record<string, unknown>) {
    if (!user) return;
    setSaving(true);
    setMsg("");
    const token = await user.getIdToken();
    const res = await fetch("/api/admin/oscar-picks", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setMsg(data.error ?? "Error"); return; }
    setMsg("Saved!");
    setTimeout(() => setMsg(""), 2000);
    await fetchYears();
  }

  const activeYearData = years.find((y) => y.id === activeYear);

  if (loading) return <p className="text-[var(--foreground-muted)] text-sm">Loading…</p>;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Trophy className="w-5 h-5 text-yellow-400" />
        <h2 className="text-lg font-semibold text-white">Oscar Picks Management</h2>
      </div>

      {msg && (
        <div className={`text-sm mb-4 px-3 py-2 rounded-lg ${msg === "Saved!" ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
          {msg}
        </div>
      )}

      {/* Step 1: Add a year */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 mb-6">
        <h3 className="text-sm font-semibold text-white mb-1">Step 1 — Add an Oscar Year</h3>
        <p className="text-xs text-[var(--foreground-muted)] mb-3">Enter the year of the ceremony (e.g. 2025 for the 97th Academy Awards).</p>
        <div className="flex gap-3">
          <input type="number" value={newYear} onChange={(e) => setNewYear(e.target.value)} placeholder="e.g. 2025"
            className="px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-sm text-white w-32 focus:outline-none focus:border-yellow-400" />
          <button disabled={!newYear || saving}
            onClick={() => { doAction({ action: "create-year", year: Number(newYear) }); setNewYear(""); }}
            className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black rounded-lg text-sm font-semibold transition-colors">
            <Plus className="w-4 h-4 inline mr-1" /> Add Year
          </button>
        </div>
      </div>

      {years.length === 0 ? (
        <p className="text-[var(--foreground-muted)] text-sm text-center py-12">No Oscar years yet. Add one above to get started.</p>
      ) : (
        <>
          {/* Year Tabs */}
          <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
            {years.map((y) => (
              <button key={y.id} onClick={() => setActiveYear(y.id)}
                className={`shrink-0 px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5 ${activeYear === y.id ? "bg-yellow-500 text-black" : "bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"}`}>
                {y.year} {y.isComplete && <Lock className="w-3 h-3" />}
              </button>
            ))}
          </div>

          {activeYearData && (
            <div className="space-y-6">
              {/* Step 2: Add categories */}
              {!activeYearData.isComplete && (
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-white mb-1">Step 2 — Add Categories to {activeYearData.year}</h3>
                  <p className="text-xs text-[var(--foreground-muted)] mb-3">
                    Categories are things like "Best Picture" or "Best Director". Pick from common ones below or type a custom one.
                  </p>
                  {!customCat ? (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {STANDARD_CATEGORIES.filter((c) => !activeYearData.categories.find((cat) => cat.name === c)).map((cat) => (
                        <button key={cat} disabled={saving}
                          onClick={() => doAction({ action: "add-category", oscarYearId: activeYearData.id, name: cat, slug: slugify(cat), sortOrder: activeYearData.categories.length })}
                          className="px-3 py-1.5 bg-[var(--surface-2)] border border-[var(--border)] hover:border-yellow-400 hover:text-white text-[var(--foreground-muted)] rounded-lg text-xs transition-colors">
                          + {cat}
                        </button>
                      ))}
                      <button onClick={() => setCustomCat(true)} className="px-3 py-1.5 bg-[var(--surface-2)] border border-dashed border-[var(--border)] hover:border-yellow-400 text-[var(--foreground-muted)] rounded-lg text-xs transition-colors">
                        + Custom…
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-3 mb-3">
                      <input type="text" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="Category name"
                        className="flex-1 px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-sm text-white placeholder-[var(--foreground-muted)] focus:outline-none focus:border-yellow-400" />
                      <button disabled={!newCatName || saving}
                        onClick={() => { doAction({ action: "add-category", oscarYearId: activeYearData.id, name: newCatName, slug: slugify(newCatName), sortOrder: activeYearData.categories.length }); setNewCatName(""); setCustomCat(false); }}
                        className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black rounded-lg text-sm font-semibold transition-colors">
                        Add
                      </button>
                      <button onClick={() => setCustomCat(false)} className="px-3 py-2 text-[var(--foreground-muted)] hover:text-white text-sm transition-colors">Cancel</button>
                    </div>
                  )}
                  {activeYearData.categories.length > 0 && (
                    <p className="text-xs text-green-400">{activeYearData.categories.length} categories added: {activeYearData.categories.map((c) => c.name).join(", ")}</p>
                  )}
                </div>
              )}

              {/* Step 3: Add nominees to each category */}
              {activeYearData.categories.length > 0 && (
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-[var(--border)] bg-[var(--surface-2)]">
                    <h3 className="text-sm font-semibold text-white">Step 3 — Add Nominees</h3>
                    <p className="text-xs text-[var(--foreground-muted)] mt-0.5">For each category, search for the nominated movie. For acting categories, add the actor&apos;s name in the detail field.</p>
                  </div>
                  <div className="divide-y divide-[var(--border)]">
                    {activeYearData.categories.map((cat) => (
                      <div key={cat.id} className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-semibold text-yellow-400">{cat.name}</h4>
                          <span className="text-xs text-[var(--foreground-muted)]">{cat._count?.votes ?? 0} votes · {cat.nominees.length} nominees</span>
                        </div>

                        {/* Existing nominees */}
                        {cat.nominees.length > 0 && (
                          <div className="space-y-1.5 mb-3">
                            {cat.nominees.map((n) => (
                              <div key={n.id} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg ${n.isWinner ? "bg-yellow-500/10 border border-yellow-400/30" : "bg-[var(--surface-2)]"}`}>
                                {n.posterPath && (
                                  <Image src={`${TMDB_POSTER}${n.posterPath}`} alt={n.movieTitle} width={20} height={30} className="rounded object-cover shrink-0" style={{ width: 20, height: 30 }} />
                                )}
                                <div className="flex-1 min-w-0">
                                  <span className="text-sm text-white">{n.movieTitle}</span>
                                  {n.nomineeDetail && <span className="text-xs text-[var(--foreground-muted)] ml-2">— {n.nomineeDetail}</span>}
                                </div>
                                {n.isWinner ? (
                                  <span className="flex items-center gap-1 text-xs text-yellow-400"><Trophy className="w-3 h-3" /> Winner</span>
                                ) : !activeYearData.isComplete ? (
                                  <button onClick={() => doAction({ action: "mark-winner", nomineeId: n.id })} title="Mark as real winner"
                                    className="text-[var(--foreground-muted)] hover:text-yellow-400 transition-colors shrink-0" >
                                    <CheckCircle2 className="w-4 h-4" />
                                  </button>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Add nominee */}
                        {!activeYearData.isComplete && (
                          <div className="flex gap-2 flex-wrap items-start">
                            <div className="relative flex-1 min-w-48">
                              <input
                                type="text"
                                value={newNomCatId === cat.id ? movieSearchQuery : ""}
                                placeholder="Search movie to add…"
                                onFocus={() => { setNewNomCatId(cat.id); setSelectedMovie(null); }}
                                onChange={(e) => { setNewNomCatId(cat.id); setMovieSearchQuery(e.target.value); setSelectedMovie(null); }}
                                className="w-full px-3 py-1.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-sm text-white placeholder-[var(--foreground-muted)] focus:outline-none focus:border-yellow-400"
                              />
                              {newNomCatId === cat.id && movieSearchResults.length > 0 && !selectedMovie && (
                                <div className="absolute z-20 top-full mt-1 w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden shadow-xl">
                                  {movieSearchResults.map((m) => (
                                    <button key={m.id}
                                      onClick={() => { setSelectedMovie(m); setMovieSearchQuery(m.title); setMovieSearchResults([]); }}
                                      className="flex items-center gap-2 w-full px-3 py-2 hover:bg-[var(--surface-2)] text-left">
                                      {m.posterPath && <Image src={`${TMDB_POSTER}${m.posterPath}`} alt={m.title} width={16} height={24} className="rounded object-cover shrink-0" style={{ width: 16, height: 24 }} />}
                                      <span className="text-sm text-white truncate">{m.title}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                            <input
                              type="text"
                              value={newNomCatId === cat.id ? nomineeDetail : ""}
                              placeholder="Actor name (optional)"
                              onFocus={() => setNewNomCatId(cat.id)}
                              onChange={(e) => { setNewNomCatId(cat.id); setNomineeDetail(e.target.value); }}
                              className="flex-1 min-w-32 px-3 py-1.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-sm text-white placeholder-[var(--foreground-muted)] focus:outline-none focus:border-yellow-400"
                            />
                            <button
                              disabled={newNomCatId !== cat.id || !selectedMovie || saving}
                              onClick={() => {
                                if (!selectedMovie) return;
                                doAction({ action: "add-nominee", categoryId: cat.id, tmdbMovieId: selectedMovie.id, movieTitle: selectedMovie.title, posterPath: selectedMovie.posterPath, nomineeDetail: (newNomCatId === cat.id && nomineeDetail) ? nomineeDetail : null });
                                setMovieSearchQuery("");
                                setSelectedMovie(null);
                                setNomineeDetail("");
                                setNewNomCatId("");
                              }}
                              className="px-3 py-1.5 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black rounded-lg text-sm font-semibold transition-colors shrink-0">
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Close year */}
              {!activeYearData.isComplete && activeYearData.categories.length > 0 && (
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-white mb-1">Close Voting</h3>
                  <p className="text-xs text-[var(--foreground-muted)] mb-3">
                    Once the real Oscars have been held, mark the real winners using the <CheckCircle2 className="w-3 h-3 inline" /> button next to each nominee, then close voting. This locks the year and shows the real winners to users.
                  </p>
                  <button
                    onClick={() => { if (confirm(`Close ${activeYearData.year} voting? Users won't be able to vote after this.`)) doAction({ action: "close-year", oscarYearId: activeYearData.id }); }}
                    className="flex items-center gap-2 px-4 py-2 bg-[var(--surface-2)] border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white hover:border-red-400 rounded-lg text-sm transition-colors">
                    <Lock className="w-4 h-4" /> Close {activeYearData.year} Voting
                  </button>
                </div>
              )}

              {activeYearData.isComplete && (
                <div className="px-4 py-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl flex items-center gap-2">
                  <Lock className="w-4 h-4 text-yellow-400 shrink-0" />
                  <p className="text-sm text-yellow-300">Voting for {activeYearData.year} is closed.</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
