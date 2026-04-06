"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Clapperboard, Users, Star, Calendar, ChevronRight, MessageCircle, Clock } from "lucide-react";
import { posterUrl } from "@/lib/tmdb";
import CommentSection from "@/components/CommentSection";

interface WeekRating {
  rating: number;
  comment: string | null;
  createdAt: string;
  user: { firebaseUid: string; name: string; avatarUrl: string | null };
}

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
  voteCandidates: { tmdbId: number; title: string; posterPath: string | null }[] | null;
  ratings: WeekRating[];
  avgRating: number | null;
  participantCount: number;
  userRating: number | null;
  userVote: number | null;
}

interface UpcomingWeek {
  id: string;
  weekNumber: number;
  startDate: string;
  pickMethod: string;
  pickTeaser: string | null;
}

export default function MovieClubPage() {
  const { user } = useAuth();
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingWeek[]>([]);
  const [isMember, setIsMember] = useState(false);
  const [memberCount, setMemberCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [expandedWeek, setExpandedWeek] = useState<string | null>(null);
  const [ratingInput, setRatingInput] = useState("");
  const [commentInput, setCommentInput] = useState("");
  const [submittingRating, setSubmittingRating] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      if (user) {
        const token = await user.getIdToken();
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch("/api/movie-club/weeks", { headers });
      if (res.ok) {
        const data = await res.json();
        setWeeks(data.weeks ?? []);
        setUpcoming(data.upcoming ?? []);
        setIsMember(data.isMember ?? false);
        setMemberCount(data.memberCount ?? 0);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function joinClub() {
    if (!user || joining) return;
    setJoining(true);
    const token = await user.getIdToken();
    const res = await fetch("/api/movie-club/join", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) { setIsMember(true); setMemberCount((c) => c + 1); }
    setJoining(false);
  }

  async function leaveClub() {
    if (!user || !window.confirm("Leave the Movie Club?")) return;
    const token = await user.getIdToken();
    const res = await fetch("/api/movie-club/join", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) { setIsMember(false); setMemberCount((c) => c - 1); }
  }

  async function submitRating(weekId: string) {
    if (!user || !ratingInput) return;
    const rating = parseFloat(ratingInput);
    if (isNaN(rating) || rating < 1 || rating > 10) return;
    setSubmittingRating(true);
    const token = await user.getIdToken();
    const res = await fetch("/api/movie-club/rate", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ weekId, rating, comment: commentInput.trim() || null }),
    });
    if (res.ok) { setRatingInput(""); setCommentInput(""); fetchData(); }
    setSubmittingRating(false);
  }

  async function voteForCandidate(weekId: string, tmdbId: number) {
    if (!user) return;
    const token = await user.getIdToken();
    await fetch("/api/movie-club/vote", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ weekId, tmdbId }),
    });
    fetchData();
  }

  const currentWeek = weeks.find((w) => w.status === "watching" || w.status === "discussion");
  const pastWeeks = weeks.filter((w) => w.status === "archived" || (w.status === "discussion" && w.id !== currentWeek?.id));

  const pickMethodLabel = (method: string) => {
    if (method === "admin") return "Admin Pick";
    if (method === "community_vote") return "Community Vote";
    return "Random Selection";
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <Link href="/community" className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Community Hub
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-3">
          <Clapperboard className="w-6 h-6 text-amber-400" />
          <h1 className="text-2xl font-bold text-white">Movie Club</h1>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Users className="w-4 h-4 text-[var(--foreground-muted)]" />
          <span className="text-[var(--foreground-muted)]">{memberCount} member{memberCount !== 1 ? "s" : ""}</span>
        </div>
      </div>
      <p className="text-[var(--foreground-muted)] mb-6">Watch a new movie each week with the community. Rate it, discuss it, compare your takes.</p>

      {/* Join / Leave */}
      {user && (
        <div className="mb-6">
          {isMember ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-emerald-400 font-medium">You&apos;re a member</span>
              <button onClick={leaveClub} className="text-xs text-[var(--foreground-muted)] hover:text-red-400 transition-colors">Leave</button>
            </div>
          ) : (
            <button
              onClick={joinClub}
              disabled={joining}
              className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-xl text-sm transition-colors disabled:opacity-50"
            >
              {joining ? "Joining..." : "Join the Movie Club"}
            </button>
          )}
        </div>
      )}

      {!user && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-6 text-center">
          <p className="text-sm text-[var(--foreground-muted)]">
            <Link href="/auth/signin" className="text-amber-400 hover:underline">Sign in</Link> to join the Movie Club.
          </p>
        </div>
      )}

      {loading ? (
        <p className="text-[var(--foreground-muted)] text-center py-20">Loading...</p>
      ) : (
        <>
          {/* Current Week */}
          {currentWeek && (
            <section className="mb-10">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                {currentWeek.status === "watching" ? <><Clock className="w-5 h-5 text-amber-400" /> This Week</> : <><MessageCircle className="w-5 h-5 text-amber-400" /> Discussion Open</>}
              </h2>
              <div className="bg-[var(--surface)] border border-amber-500/30 rounded-xl p-5">
                <div className="flex gap-4">
                  {currentWeek.moviePoster && (
                    <Link href={`/movies/${currentWeek.movieTmdbId}`} className="shrink-0">
                      <Image src={posterUrl(currentWeek.moviePoster, "w185")} alt={currentWeek.movieTitle ?? ""} width={100} height={150} className="rounded-lg" />
                    </Link>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-amber-400 mb-1">Week {currentWeek.weekNumber} · {pickMethodLabel(currentWeek.pickMethod)}</p>
                    <h3 className="text-xl font-bold text-white mb-1">
                      <Link href={`/movies/${currentWeek.movieTmdbId}`} className="hover:text-amber-400 transition-colors">
                        {currentWeek.movieTitle ?? "TBA"}
                      </Link>
                    </h3>
                    <p className="text-xs text-[var(--foreground-muted)] mb-3">
                      <Calendar className="w-3 h-3 inline" /> {currentWeek.startDate} — {currentWeek.endDate}
                    </p>

                    {/* Stats */}
                    <div className="flex gap-4 text-sm mb-4">
                      <span className="text-[var(--foreground-muted)]">{currentWeek.participantCount} rated</span>
                      {currentWeek.status === "discussion" && currentWeek.avgRating && (
                        <span className="text-amber-400 font-bold">Avg: {currentWeek.avgRating}/10</span>
                      )}
                    </div>

                    {/* Rate (watching phase) or view ratings (discussion phase) */}
                    {isMember && currentWeek.userRating == null && (currentWeek.status === "watching" || currentWeek.status === "discussion") && (
                      <div className="flex items-center gap-2 mb-3">
                        <input
                          type="number" min="1" max="10" step="0.5"
                          value={ratingInput}
                          onChange={(e) => setRatingInput(e.target.value)}
                          placeholder="1-10"
                          className="w-16 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm text-white text-center focus:outline-none focus:border-amber-400"
                        />
                        <input
                          value={commentInput}
                          onChange={(e) => setCommentInput(e.target.value)}
                          placeholder="Quick thoughts (optional)"
                          className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-amber-400"
                        />
                        <button
                          onClick={() => submitRating(currentWeek.id)}
                          disabled={submittingRating || !ratingInput}
                          className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
                        >
                          {submittingRating ? "..." : "Rate"}
                        </button>
                      </div>
                    )}
                    {currentWeek.userRating != null && (
                      <p className="text-sm text-emerald-400 mb-3">Your rating: <span className="font-bold">{currentWeek.userRating}/10</span></p>
                    )}
                  </div>
                </div>

                {/* Ratings reveal (discussion phase) */}
                {currentWeek.status === "discussion" && currentWeek.ratings.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-[var(--border)]">
                    <h4 className="text-sm font-semibold text-white mb-3">Community Ratings</h4>
                    <div className="space-y-2">
                      {currentWeek.ratings.map((r) => (
                        <div key={r.user.firebaseUid} className="flex items-center gap-3">
                          {r.user.avatarUrl && <Image src={r.user.avatarUrl} alt="" width={24} height={24} className="w-6 h-6 rounded-full object-cover" />}
                          <Link href={`/profile/${r.user.firebaseUid}`} className="text-sm text-white hover:text-amber-400 flex-1">{r.user.name}</Link>
                          <span className="text-sm font-bold text-amber-400">{r.rating}/10</span>
                          {r.comment && <span className="text-xs text-[var(--foreground-muted)] truncate max-w-[200px]">&ldquo;{r.comment}&rdquo;</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Discussion thread */}
                {currentWeek.status === "discussion" && (
                  <div className="mt-4 pt-4 border-t border-[var(--border)]">
                    <CommentSection targetType="movieclub" targetId={currentWeek.id} isAdmin={false} />
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Upcoming weeks */}
          {upcoming.length > 0 && (
            <section className="mb-10">
              <h2 className="text-sm font-semibold text-white mb-3">Coming Up</h2>
              <div className="space-y-2">
                {upcoming.map((w) => (
                  <div key={w.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm text-white font-medium">Week {w.weekNumber}</p>
                      <p className="text-xs text-[var(--foreground-muted)]">{w.pickTeaser ?? pickMethodLabel(w.pickMethod)} · Starts {w.startDate}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[var(--foreground-muted)]" />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* No current week */}
          {!currentWeek && upcoming.length === 0 && weeks.length === 0 && (
            <p className="text-[var(--foreground-muted)] text-center py-20">No movie club weeks scheduled yet. Check back soon!</p>
          )}

          {/* Past weeks */}
          {pastWeeks.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-white mb-3">Past Weeks</h2>
              <div className="space-y-2">
                {pastWeeks.map((w) => (
                  <div key={w.id}>
                    <button
                      onClick={() => setExpandedWeek(expandedWeek === w.id ? null : w.id)}
                      className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex items-center gap-3 hover:border-amber-400/30 transition-colors text-left"
                    >
                      {w.moviePoster && (
                        <Image src={posterUrl(w.moviePoster, "w92")} alt="" width={36} height={54} className="rounded w-9 h-14 object-cover shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white">{w.movieTitle ?? "Unknown"}</p>
                        <p className="text-xs text-[var(--foreground-muted)]">Week {w.weekNumber} · {w.participantCount} rated · Avg: {w.avgRating ?? "–"}/10</p>
                      </div>
                      <ChevronRight className={`w-4 h-4 text-[var(--foreground-muted)] transition-transform ${expandedWeek === w.id ? "rotate-90" : ""}`} />
                    </button>
                    {expandedWeek === w.id && (
                      <div className="bg-[var(--surface-2)] border border-[var(--border)] border-t-0 rounded-b-xl p-4 space-y-2">
                        {w.ratings.map((r) => (
                          <div key={r.user.firebaseUid} className="flex items-center gap-3">
                            <Link href={`/profile/${r.user.firebaseUid}`} className="text-sm text-white hover:text-amber-400">{r.user.name}</Link>
                            <span className="text-sm font-bold text-amber-400">{r.rating}/10</span>
                            {r.comment && <span className="text-xs text-[var(--foreground-muted)] truncate">&ldquo;{r.comment}&rdquo;</span>}
                          </div>
                        ))}
                        {w.ratings.length === 0 && <p className="text-xs text-[var(--foreground-muted)]">No ratings submitted</p>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
