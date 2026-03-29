"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Trophy, Plus, CheckCircle2, Lock } from "lucide-react";
import Image from "next/image";

const TMDB_POSTER = "https://image.tmdb.org/t/p/w92";

interface Nominee {
  id: string;
  movieTitle: string;
  posterPath: string | null;
  nomineeDetail: string | null;
  isWinner: boolean;
  _count?: { votes: number };
}

interface Category {
  id: string;
  name: string;
  slug: string;
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

  // New year form
  const [newYear, setNewYear] = useState("");
  const [newCeremonyDate, setNewCeremonyDate] = useState("");

  // New category form
  const [newCatYearId, setNewCatYearId] = useState("");
  const [newCatName, setNewCatName] = useState("");
  const [newCatSlug, setNewCatSlug] = useState("");
  const [newCatOrder, setNewCatOrder] = useState("0");

  // New nominee form
  const [newNomCatId, setNewNomCatId] = useState("");
  const [newNomMovie, setNewNomMovie] = useState("");
  const [newNomDetail, setNewNomDetail] = useState("");
  const [newNomPoster, setNewNomPoster] = useState("");

  // Movie search for nominees
  const [movieSearchQuery, setMovieSearchQuery] = useState("");
  const [movieSearchResults, setMovieSearchResults] = useState<{ id: number; title: string; posterPath: string | null }[]>([]);

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

  async function action(payload: Record<string, unknown>) {
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

      {msg && <p className={`text-sm mb-4 ${msg === "Saved!" ? "text-green-400" : "text-red-400"}`}>{msg}</p>}

      {/* Add Year */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-6">
        <h3 className="text-sm font-semibold text-white mb-3">Add Oscar Year</h3>
        <div className="flex gap-3 flex-wrap">
          <input type="number" value={newYear} onChange={(e) => setNewYear(e.target.value)} placeholder="Year (e.g. 2025)"
            className="px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-sm text-white w-36 focus:outline-none focus:border-yellow-400" />
          <input type="date" value={newCeremonyDate} onChange={(e) => setNewCeremonyDate(e.target.value)}
            className="px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-sm text-white focus:outline-none focus:border-yellow-400" />
          <button disabled={!newYear || saving} onClick={() => action({ action: "create-year", year: Number(newYear), ceremonyDate: newCeremonyDate || undefined })}
            className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black rounded-lg text-sm font-semibold transition-colors">
            <Plus className="w-4 h-4 inline mr-1" /> Add Year
          </button>
        </div>
      </div>

      {years.length === 0 ? (
        <p className="text-[var(--foreground-muted)] text-sm text-center py-12">No Oscar years yet. Add one above.</p>
      ) : (
        <>
          {/* Year Tabs */}
          <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
            {years.map((y) => (
              <button key={y.id} onClick={() => setActiveYear(y.id)}
                className={`shrink-0 px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${activeYear === y.id ? "bg-yellow-500 text-black" : "bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"}`}>
                {y.year} {y.isComplete && <Lock className="w-3 h-3 inline ml-1" />}
              </button>
            ))}
          </div>

          {activeYearData && (
            <div>
              {/* Add Category to this year */}
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-4">
                <h3 className="text-sm font-semibold text-white mb-3">Add Category to {activeYearData.year}</h3>
                <div className="flex gap-3 flex-wrap">
                  <input type="text" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="Category name"
                    className="px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-sm text-white flex-1 min-w-40 focus:outline-none focus:border-yellow-400" />
                  <input type="text" value={newCatSlug} onChange={(e) => setNewCatSlug(e.target.value)} placeholder="slug (e.g. best-picture)"
                    className="px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-sm text-white flex-1 min-w-40 focus:outline-none focus:border-yellow-400" />
                  <input type="number" value={newCatOrder} onChange={(e) => setNewCatOrder(e.target.value)} placeholder="Sort order"
                    className="px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-sm text-white w-24 focus:outline-none focus:border-yellow-400" />
                  <button disabled={!newCatName || !newCatSlug || saving}
                    onClick={() => action({ action: "add-category", oscarYearId: activeYearData.id, name: newCatName, slug: newCatSlug, sortOrder: Number(newCatOrder) })}
                    className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black rounded-lg text-sm font-semibold transition-colors">
                    <Plus className="w-4 h-4 inline mr-1" /> Add
                  </button>
                </div>
              </div>

              {/* Categories */}
              {activeYearData.categories.length === 0 ? (
                <p className="text-[var(--foreground-muted)] text-sm text-center py-8">No categories yet.</p>
              ) : (
                <div className="space-y-4">
                  {activeYearData.categories.map((cat) => (
                    <div key={cat.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
                      <div className="px-4 py-3 bg-[var(--surface-2)] flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-yellow-400">{cat.name}</h4>
                        <span className="text-xs text-[var(--foreground-muted)]">{cat._count?.votes ?? 0} votes</span>
                      </div>

                      {/* Nominees */}
                      <div className="p-4">
                        {cat.nominees.length > 0 && (
                          <div className="space-y-2 mb-3">
                            {cat.nominees.map((n) => (
                              <div key={n.id} className={`flex items-center gap-3 p-2 rounded-lg ${n.isWinner ? "bg-yellow-500/10 border border-yellow-400/30" : "bg-[var(--surface-2)]"}`}>
                                {n.posterPath && (
                                  <Image src={`${TMDB_POSTER}${n.posterPath}`} alt={n.movieTitle} width={24} height={36} className="rounded object-cover shrink-0" style={{ width: 24, height: 36 }} />
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-white truncate">{n.movieTitle}</p>
                                  {n.nomineeDetail && <p className="text-xs text-[var(--foreground-muted)]">{n.nomineeDetail}</p>}
                                </div>
                                {n.isWinner ? (
                                  <Trophy className="w-4 h-4 text-yellow-400 shrink-0" />
                                ) : !activeYearData.isComplete ? (
                                  <button onClick={() => action({ action: "mark-winner", nomineeId: n.id })}
                                    className="text-xs text-[var(--foreground-muted)] hover:text-yellow-400 transition-colors shrink-0">
                                    <CheckCircle2 className="w-4 h-4" />
                                  </button>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Add nominee form */}
                        {!activeYearData.isComplete && (
                          <div className="border-t border-[var(--border)] pt-3">
                            <p className="text-xs text-[var(--foreground-muted)] mb-2">Add nominee to {cat.name}</p>
                            <div className="flex gap-2 flex-wrap relative">
                              <div className="relative flex-1 min-w-48">
                                <input type="text" value={newNomCatId === cat.id ? movieSearchQuery : ""} placeholder="Search movie…"
                                  onFocus={() => setNewNomCatId(cat.id)}
                                  onChange={(e) => { setNewNomCatId(cat.id); setMovieSearchQuery(e.target.value); }}
                                  className="w-full px-3 py-1.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-sm text-white placeholder-[var(--foreground-muted)] focus:outline-none focus:border-yellow-400" />
                                {newNomCatId === cat.id && movieSearchResults.length > 0 && (
                                  <div className="absolute z-20 top-full mt-1 w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden shadow-xl">
                                    {movieSearchResults.map((m) => (
                                      <button key={m.id} onClick={() => {
                                        setNewNomMovie(m.title);
                                        setNewNomPoster(m.posterPath ?? "");
                                        setMovieSearchQuery(m.title);
                                        setMovieSearchResults([]);
                                      }} className="flex items-center gap-2 w-full px-3 py-2 hover:bg-[var(--surface-2)] text-left">
                                        {m.posterPath && <Image src={`${TMDB_POSTER}${m.posterPath}`} alt={m.title} width={20} height={30} className="rounded object-cover shrink-0" style={{ width: 20, height: 30 }} />}
                                        <span className="text-sm text-white truncate">{m.title}</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <input type="text" value={newNomCatId === cat.id ? newNomDetail : ""} placeholder="Detail (e.g. actor name)"
                                onFocus={() => setNewNomCatId(cat.id)}
                                onChange={(e) => { setNewNomCatId(cat.id); setNewNomDetail(e.target.value); }}
                                className="flex-1 min-w-36 px-3 py-1.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-sm text-white placeholder-[var(--foreground-muted)] focus:outline-none focus:border-yellow-400" />
                              <button disabled={newNomCatId !== cat.id || !newNomMovie || saving}
                                onClick={() => action({ action: "add-nominee", categoryId: cat.id, movieTitle: newNomMovie, posterPath: newNomPoster || null, nomineeDetail: newNomDetail || null })}
                                className="px-3 py-1.5 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black rounded-lg text-sm font-semibold transition-colors">
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Close Year */}
              {!activeYearData.isComplete && (
                <div className="mt-6 p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
                  <p className="text-sm text-[var(--foreground-muted)] mb-3">Close voting for {activeYearData.year} once the real Oscars have been held.</p>
                  <button onClick={() => { if (confirm(`Close voting for ${activeYearData.year}? This cannot be undone.`)) action({ action: "close-year", oscarYearId: activeYearData.id }); }}
                    className="px-4 py-2 bg-[var(--surface-2)] border border-[var(--border)] text-[var(--foreground-muted)] hover:text-white hover:border-red-400 rounded-lg text-sm transition-colors">
                    <Lock className="w-4 h-4 inline mr-1" /> Close {activeYearData.year} Voting
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
