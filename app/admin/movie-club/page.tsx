"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import Image from "next/image";
import { Clapperboard, Pencil, X, Dice5, UserCheck, Vote, Eye } from "lucide-react";
import { posterUrl, STREAMING_PROVIDERS, LANGUAGES } from "@/lib/tmdb";

interface Week {
  id: string; weekNumber: number; startDate: string; endDate: string; status: string;
  pickMethod: string; pickTeaser: string | null; pickFilters: Record<string, string> | null;
  movieTmdbId: number | null; movieTitle: string | null; moviePoster: string | null;
  _count: { ratings: number; nominations: number };
}

const STATUSES = ["scheduled", "voting", "watching", "discussion", "archived"];
const GENRE_OPTIONS = [
  { id: "28", name: "Action" }, { id: "12", name: "Adventure" }, { id: "16", name: "Animation" },
  { id: "35", name: "Comedy" }, { id: "80", name: "Crime" }, { id: "99", name: "Documentary" },
  { id: "18", name: "Drama" }, { id: "10751", name: "Family" }, { id: "14", name: "Fantasy" },
  { id: "36", name: "History" }, { id: "27", name: "Horror" }, { id: "10402", name: "Music" },
  { id: "9648", name: "Mystery" }, { id: "10749", name: "Romance" }, { id: "878", name: "Sci-Fi" },
  { id: "53", name: "Thriller" }, { id: "10752", name: "War" }, { id: "37", name: "Western" },
];
const MPA_OPTIONS = ["G", "PG", "PG-13", "R", "NC-17"];

export default function AdminMovieClubPage() {
  const { user } = useAuth();
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Edit form state
  const [editPickMethod, setEditPickMethod] = useState("random");
  const [editTeaser, setEditTeaser] = useState("");
  const [editGenre, setEditGenre] = useState("");
  const [editMpa, setEditMpa] = useState("");
  const [editProvider, setEditProvider] = useState("");
  const [editYearFrom, setEditYearFrom] = useState("");
  const [editYearTo, setEditYearTo] = useState("");
  const [movieSearch, setMovieSearch] = useState("");
  const [movieResults, setMovieResults] = useState<{ id: number; title: string; posterPath: string | null; releaseDate?: string }[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<{ tmdbId: number; title: string; posterPath: string | null } | null>(null);
  const [previewMovie, setPreviewMovie] = useState<{ tmdbId: number; title: string; posterPath: string | null } | null>(null);
  const [saving, setSaving] = useState(false);

  async function fetchWeeks() {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch("/api/admin/movie-club", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) { const data = await res.json(); setWeeks(data.weeks ?? []); }
    setLoading(false);
  }

  useEffect(() => { fetchWeeks(); }, [user]);

  useEffect(() => {
    if (movieSearch.length < 2 || editPickMethod !== "admin") { setMovieResults([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/tmdb/movie/search?q=${encodeURIComponent(movieSearch)}`);
      const data = await res.json();
      setMovieResults(data.results ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [movieSearch, editPickMethod]);

  function startEdit(week: Week) {
    setEditingId(week.id);
    setEditPickMethod(week.pickMethod);
    setEditTeaser(week.pickTeaser ?? "");
    setEditGenre(week.pickFilters?.genre ?? "");
    setEditMpa(week.pickFilters?.mpaRating ?? "");
    setEditProvider(week.pickFilters?.provider ?? "");
    setEditYearFrom(week.pickFilters?.yearFrom ?? "");
    setEditYearTo(week.pickFilters?.yearTo ?? "");
    setSelectedMovie(week.movieTmdbId ? { tmdbId: week.movieTmdbId, title: week.movieTitle ?? "", posterPath: week.moviePoster } : null);
    setPreviewMovie(null);
  }

  async function saveEdit() {
    if (!user || !editingId) return;
    setSaving(true);
    const token = await user.getIdToken();
    const filters = editPickMethod === "random" ? {
      genre: editGenre || undefined, mpaRating: editMpa || undefined,
      provider: editProvider || undefined, yearFrom: editYearFrom || undefined, yearTo: editYearTo || undefined,
    } : undefined;

    await fetch("/api/admin/movie-club", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        weekId: editingId,
        pickMethod: editPickMethod,
        pickTeaser: editTeaser.trim() || null,
        pickFilters: filters,
        ...(editPickMethod === "admin" && selectedMovie ? { movieTmdbId: selectedMovie.tmdbId, movieTitle: selectedMovie.title, moviePoster: selectedMovie.posterPath } : {}),
      }),
    });
    setEditingId(null);
    fetchWeeks();
    setSaving(false);
  }

  async function previewRandom() {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch("/api/admin/movie-club", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "preview_random",
        filters: Object.fromEntries(Object.entries({ genre: editGenre, mpaRating: editMpa, provider: editProvider, yearFrom: editYearFrom, yearTo: editYearTo }).filter(([, v]) => v)),
      }),
    });
    if (res.ok) { const data = await res.json(); setPreviewMovie(data.movie); }
  }

  async function updateStatus(weekId: string, status: string) {
    if (!user || !window.confirm(`Change status to "${status}"?`)) return;
    const token = await user.getIdToken();
    await fetch("/api/admin/movie-club", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ weekId, status }),
    });
    fetchWeeks();
  }

  const statusColor = (s: string) => {
    if (s === "watching") return "text-green-400 bg-green-500/10";
    if (s === "discussion") return "text-blue-400 bg-blue-500/10";
    if (s === "voting") return "text-purple-400 bg-purple-500/10";
    if (s === "archived") return "text-[var(--foreground-muted)] bg-[var(--surface-2)]";
    return "text-yellow-400 bg-yellow-500/10";
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Clapperboard className="w-5 h-5 text-[var(--ratist-red)]" />
        <h2 className="text-lg font-semibold text-white">Movie Club</h2>
        <span className="text-xs text-[var(--foreground-muted)]">Weeks auto-generate. Edit to customize.</span>
      </div>

      {loading ? (
        <p className="text-[var(--foreground-muted)]">Loading...</p>
      ) : (
        <div className="space-y-3">
          {weeks.map((w) => (
            <div key={w.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
              {/* Week header */}
              <div className="p-4 flex items-center gap-3">
                {w.moviePoster && <Image src={posterUrl(w.moviePoster, "w92")} alt="" width={32} height={48} className="rounded w-8 h-12 object-cover shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-white">Week {w.weekNumber}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusColor(w.status)}`}>{w.status}</span>
                    <span className="text-[10px] text-[var(--foreground-muted)]">{w.pickMethod}</span>
                  </div>
                  <p className="text-xs text-[var(--foreground-muted)]">
                    {w.movieTitle ?? w.pickTeaser ?? "No movie set"} · {w.startDate} — {w.endDate} · {w._count.ratings} rated
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <select value={w.status} onChange={(e) => updateStatus(w.id, e.target.value)}
                    className="bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-white">
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button onClick={() => editingId === w.id ? setEditingId(null) : startEdit(w)}
                    className="p-1.5 text-[var(--foreground-muted)] hover:text-white transition-colors">
                    {editingId === w.id ? <X className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Edit panel */}
              {editingId === w.id && (
                <div className="border-t border-[var(--border)] p-4 space-y-4 bg-[var(--surface-2)]/30">
                  {/* Pick method */}
                  <div>
                    <label className="text-xs text-[var(--foreground-muted)] mb-2 block">Pick Method</label>
                    <div className="flex gap-2">
                      {[
                        { v: "random", l: "Random", i: Dice5 },
                        { v: "admin", l: "Admin Pick", i: UserCheck },
                        { v: "community_vote", l: "Community Vote", i: Vote },
                      ].map(({ v, l, i: Icon }) => (
                        <button key={v} onClick={() => setEditPickMethod(v)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors ${editPickMethod === v ? "border-[var(--ratist-red)] bg-[var(--ratist-red)]/10 text-white" : "border-[var(--border)] text-[var(--foreground-muted)]"}`}>
                          <Icon className="w-3.5 h-3.5" /> {l}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Random filters */}
                  {editPickMethod === "random" && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        <select value={editGenre} onChange={(e) => setEditGenre(e.target.value)} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-white">
                          <option value="">Any Genre</option>
                          {GENRE_OPTIONS.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                        <select value={editMpa} onChange={(e) => setEditMpa(e.target.value)} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-white">
                          <option value="">Any Rating</option>
                          {MPA_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <select value={editProvider} onChange={(e) => setEditProvider(e.target.value)} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-white">
                          <option value="">Any Service</option>
                          {STREAMING_PROVIDERS.map((p) => <option key={p.id} value={String(p.id)}>{p.short}</option>)}
                        </select>
                        <input value={editYearFrom} onChange={(e) => setEditYearFrom(e.target.value)} placeholder="Year from" className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-white" />
                        <input value={editYearTo} onChange={(e) => setEditYearTo(e.target.value)} placeholder="Year to" className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-white" />
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={previewRandom} className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-xs text-white hover:border-[var(--ratist-red)] transition-colors">
                          <Eye className="w-3.5 h-3.5" /> Preview Random Pick
                        </button>
                        {previewMovie && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-white">→</span>
                            {previewMovie.posterPath && <Image src={posterUrl(previewMovie.posterPath, "w92")} alt="" width={24} height={36} className="rounded" />}
                            <span className="text-xs text-white"><strong>{previewMovie.title}</strong> {(previewMovie as { year?: string }).year ? `(${(previewMovie as { year?: string }).year})` : ""} {(previewMovie as { voteAverage?: number }).voteAverage ? `· ${(previewMovie as { voteAverage?: number }).voteAverage?.toFixed(1)}/10` : ""}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Admin pick — movie search */}
                  {editPickMethod === "admin" && (
                    <div>
                      <label className="text-xs text-[var(--foreground-muted)] mb-1 block">Select Movie</label>
                      {selectedMovie && (
                        <div className="flex items-center gap-2 p-2 bg-[var(--ratist-red)]/10 border border-[var(--ratist-red)]/30 rounded-lg mb-2">
                          {selectedMovie.posterPath && <Image src={posterUrl(selectedMovie.posterPath, "w92")} alt="" width={24} height={36} className="rounded" />}
                          <span className="text-sm text-white">{selectedMovie.title}</span>
                          <button onClick={() => setSelectedMovie(null)} className="ml-auto text-xs text-[var(--foreground-muted)] hover:text-red-400">Remove</button>
                        </div>
                      )}
                      <input value={movieSearch} onChange={(e) => setMovieSearch(e.target.value)} placeholder="Search for a movie..."
                        className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)]" />
                      {movieResults.length > 0 && !selectedMovie && (
                        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg mt-1 max-h-32 overflow-y-auto">
                          {movieResults.map((m) => (
                            <button key={m.id} onClick={() => { setSelectedMovie({ tmdbId: m.id, title: m.title, posterPath: m.posterPath }); setMovieResults([]); setMovieSearch(""); }}
                              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--surface-2)] text-left text-sm text-white">
                              {m.posterPath && <Image src={posterUrl(m.posterPath, "w92")} alt="" width={24} height={36} className="rounded shrink-0" />}
                              <span>{m.title}</span>
                              {m.releaseDate && <span className="text-xs text-[var(--foreground-muted)]">({m.releaseDate.slice(0, 4)})</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Teaser */}
                  <div>
                    <label className="text-xs text-[var(--foreground-muted)] mb-1 block">Teaser (shown in Coming Up)</label>
                    <input value={editTeaser} onChange={(e) => setEditTeaser(e.target.value)} placeholder='e.g. "Random Horror Movie on Netflix"'
                      className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)]" />
                  </div>

                  <button onClick={saveEdit} disabled={saving}
                    className="px-4 py-2 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white rounded-lg text-sm font-semibold disabled:opacity-50">
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
