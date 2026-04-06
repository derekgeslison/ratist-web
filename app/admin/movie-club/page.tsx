"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import Image from "next/image";
import { Clapperboard, Plus, Calendar, Film, Users, Dice5, UserCheck, Vote, Trash2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { posterUrl } from "@/lib/tmdb";

interface Week {
  id: string;
  weekNumber: number;
  startDate: string;
  endDate: string;
  status: string;
  pickMethod: string;
  pickTeaser: string | null;
  movieTmdbId: number | null;
  movieTitle: string | null;
  moviePoster: string | null;
  _count: { ratings: number; votes: number };
}

const PICK_METHODS = [
  { value: "random", label: "Random", icon: Dice5, desc: "Auto-pick a random movie (with optional filters)" },
  { value: "admin", label: "Admin Pick", icon: UserCheck, desc: "You choose the movie" },
  { value: "community_vote", label: "Community Vote", icon: Vote, desc: "Members vote from candidates you set" },
];

const STATUSES = ["upcoming", "watching", "discussion", "archived"];

export default function AdminMovieClubPage() {
  const { user } = useAuth();
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Create form
  const [startDate, setStartDate] = useState("");
  const [pickMethod, setPickMethod] = useState("random");
  const [pickTeaser, setPickTeaser] = useState("");
  const [movieSearch, setMovieSearch] = useState("");
  const [movieResults, setMovieResults] = useState<{ id: number; title: string; posterPath: string | null }[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<{ tmdbId: number; title: string; posterPath: string | null } | null>(null);
  const [filterGenre, setFilterGenre] = useState("");
  const [filterMpa, setFilterMpa] = useState("");
  const [filterProvider, setFilterProvider] = useState("");
  const [filterYearFrom, setFilterYearFrom] = useState("");
  const [filterYearTo, setFilterYearTo] = useState("");
  const [creating, setCreating] = useState(false);

  async function fetchWeeks() {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch("/api/admin/movie-club", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) { const data = await res.json(); setWeeks(data.weeks ?? []); }
    setLoading(false);
  }

  useEffect(() => { fetchWeeks(); }, [user]);

  // Movie search for admin pick
  useEffect(() => {
    if (movieSearch.length < 2 || pickMethod !== "admin") { setMovieResults([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/tmdb/movie/search?q=${encodeURIComponent(movieSearch)}`);
      const data = await res.json();
      setMovieResults(data.results ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [movieSearch, pickMethod]);

  async function createWeek() {
    if (!user || !startDate || creating) return;
    setCreating(true);
    const token = await user.getIdToken();

    const body: Record<string, unknown> = {
      startDate,
      pickMethod,
      pickTeaser: pickTeaser.trim() || null,
    };

    if (pickMethod === "admin" && selectedMovie) {
      body.movieTmdbId = selectedMovie.tmdbId;
      body.movieTitle = selectedMovie.title;
      body.moviePoster = selectedMovie.posterPath;
    }

    if (pickMethod === "random") {
      body.pickFilters = {
        genre: filterGenre || undefined,
        mpaRating: filterMpa || undefined,
        provider: filterProvider || undefined,
        yearFrom: filterYearFrom || undefined,
        yearTo: filterYearTo || undefined,
      };
    }

    const res = await fetch("/api/admin/movie-club", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      setShowCreate(false);
      setStartDate(""); setPickMethod("random"); setPickTeaser(""); setSelectedMovie(null);
      setFilterGenre(""); setFilterMpa(""); setFilterProvider(""); setFilterYearFrom(""); setFilterYearTo("");
      fetchWeeks();
    }
    setCreating(false);
  }

  async function updateStatus(weekId: string, status: string) {
    if (!user) return;
    const token = await user.getIdToken();
    await fetch("/api/admin/movie-club", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ weekId, status }),
    });
    fetchWeeks();
  }

  const statusColor = (s: string) => {
    if (s === "watching") return "text-amber-400 bg-amber-500/10 border-amber-500/30";
    if (s === "discussion") return "text-blue-400 bg-blue-500/10 border-blue-500/30";
    if (s === "archived") return "text-[var(--foreground-muted)] bg-[var(--surface-2)] border-[var(--border)]";
    return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Clapperboard className="w-5 h-5 text-amber-400" />
          <h2 className="text-lg font-semibold text-white">Movie Club</h2>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-semibold transition-colors">
          <Plus className="w-4 h-4" /> New Week
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-[var(--surface)] border border-amber-500/30 rounded-xl p-5 mb-6 space-y-4">
          <h3 className="text-sm font-semibold text-white">Schedule a New Week</h3>

          <div>
            <label className="text-xs text-[var(--foreground-muted)] mb-1 block">Start Date (Monday)</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400" />
          </div>

          <div>
            <label className="text-xs text-[var(--foreground-muted)] mb-2 block">Pick Method</label>
            <div className="grid sm:grid-cols-3 gap-2">
              {PICK_METHODS.map(({ value, label, icon: Icon, desc }) => (
                <button key={value} onClick={() => setPickMethod(value)}
                  className={`p-3 rounded-lg border text-left transition-colors ${pickMethod === value ? "border-amber-500 bg-amber-500/10" : "border-[var(--border)]"}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={`w-4 h-4 ${pickMethod === value ? "text-amber-400" : "text-[var(--foreground-muted)]"}`} />
                    <span className="text-sm font-medium text-white">{label}</span>
                  </div>
                  <p className="text-xs text-[var(--foreground-muted)]">{desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Admin pick — movie search */}
          {pickMethod === "admin" && (
            <div>
              <label className="text-xs text-[var(--foreground-muted)] mb-1 block">Select Movie</label>
              <input value={movieSearch} onChange={(e) => setMovieSearch(e.target.value)} placeholder="Search for a movie..."
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400 mb-2" />
              {selectedMovie && (
                <div className="flex items-center gap-2 p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg mb-2">
                  {selectedMovie.posterPath && <Image src={posterUrl(selectedMovie.posterPath, "w92")} alt="" width={24} height={36} className="rounded" />}
                  <span className="text-sm text-white">{selectedMovie.title}</span>
                  <button onClick={() => setSelectedMovie(null)} className="ml-auto text-xs text-[var(--foreground-muted)] hover:text-red-400">Remove</button>
                </div>
              )}
              {movieResults.length > 0 && !selectedMovie && (
                <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg max-h-32 overflow-y-auto">
                  {movieResults.map((m) => (
                    <button key={m.id} onClick={() => { setSelectedMovie({ tmdbId: m.id, title: m.title, posterPath: m.posterPath }); setMovieResults([]); setMovieSearch(""); }}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--surface)] text-left text-sm text-white">
                      {m.posterPath && <Image src={posterUrl(m.posterPath, "w92")} alt="" width={20} height={30} className="rounded" />}
                      {m.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Random filters */}
          {pickMethod === "random" && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <input value={filterGenre} onChange={(e) => setFilterGenre(e.target.value)} placeholder="Genre ID" className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white" />
              <input value={filterMpa} onChange={(e) => setFilterMpa(e.target.value)} placeholder="MPA Rating" className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white" />
              <input value={filterProvider} onChange={(e) => setFilterProvider(e.target.value)} placeholder="Provider ID" className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white" />
              <input value={filterYearFrom} onChange={(e) => setFilterYearFrom(e.target.value)} placeholder="Year from" className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white" />
              <input value={filterYearTo} onChange={(e) => setFilterYearTo(e.target.value)} placeholder="Year to" className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white" />
            </div>
          )}

          <div>
            <label className="text-xs text-[var(--foreground-muted)] mb-1 block">Teaser Text (shown before week starts)</label>
            <input value={pickTeaser} onChange={(e) => setPickTeaser(e.target.value)} placeholder='e.g. "Random Horror Movie on Netflix"'
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400" />
          </div>

          <button onClick={createWeek} disabled={creating || !startDate}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
            {creating ? "Creating..." : "Create Week"}
          </button>
        </div>
      )}

      {/* Weeks list */}
      {loading ? (
        <p className="text-[var(--foreground-muted)]">Loading...</p>
      ) : weeks.length === 0 ? (
        <p className="text-[var(--foreground-muted)]">No weeks scheduled yet.</p>
      ) : (
        <div className="space-y-2">
          {weeks.map((w) => (
            <div key={w.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex items-center gap-3">
              {w.moviePoster && <Image src={posterUrl(w.moviePoster, "w92")} alt="" width={32} height={48} className="rounded w-8 h-12 object-cover shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">Week {w.weekNumber}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${statusColor(w.status)}`}>{w.status}</span>
                </div>
                <p className="text-xs text-[var(--foreground-muted)]">
                  {w.movieTitle ?? w.pickTeaser ?? w.pickMethod} · {w.startDate} — {w.endDate} · {w._count.ratings} rated
                </p>
              </div>
              <select value={w.status} onChange={(e) => updateStatus(w.id, e.target.value)}
                className="bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 text-xs text-white">
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
