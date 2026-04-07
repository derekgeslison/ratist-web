"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Clapperboard, Users, Star, Calendar, ChevronRight, MessageCircle, Clock, Lock, Trophy } from "lucide-react";
import { posterUrl } from "@/lib/tmdb";

interface WeekRating {
  rating: number; reviewText: string | null; reviewType: string; isRewatch: boolean; createdAt: string;
  user: { firebaseUid: string; name: string; avatarUrl: string | null };
}
interface Superlative { label: string; userName: string; userAvatar: string | null; userUid: string; value: string; }
interface Week {
  id: string; weekNumber: number; startDate: string; endDate: string; status: string;
  pickMethod: string; pickTeaser: string | null;
  movieTmdbId: number | null; movieTitle: string | null; moviePoster: string | null;
  avgRating: number | null; participantCount: number; rewatchCount: number;
  userRating: number | null; ratings: WeekRating[]; superlatives: Superlative[];
  canSeeDiscussion: boolean;
}
interface UpcomingWeek { id: string; weekNumber: number; startDate: string; pickMethod: string; pickTeaser: string | null; }

export default function MovieClubPage() {
  const { user } = useAuth();
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingWeek[]>([]);
  const [isMember, setIsMember] = useState(false);
  const [memberCount, setMemberCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  // Review form
  const [ratingInput, setRatingInput] = useState("");
  const [reviewText, setReviewText] = useState("");
  const [submittingRating, setSubmittingRating] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      if (user) { const token = await user.getIdToken(); headers.Authorization = `Bearer ${token}`; }
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
      body: JSON.stringify({ weekId, rating, reviewText: reviewText.trim() || null, reviewType: "quick" }),
    });
    if (res.ok) { setRatingInput(""); setReviewText(""); fetchData(); }
    setSubmittingRating(false);
  }

  const currentWeek = weeks.find((w) => w.status === "watching" || w.status === "discussion");
  const pastWeeks = weeks.filter((w) => w.status === "archived");

  const pickLabel = (method: string) => method === "admin" ? "Admin Pick" : method === "community_vote" ? "Community Vote" : "Random Selection";

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <Link href="/community" className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Community Hub
      </Link>

      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-3">
          <Clapperboard className="w-6 h-6 text-[var(--ratist-red)]" />
          <h1 className="text-2xl font-bold text-white">Movie Club</h1>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Users className="w-4 h-4 text-[var(--foreground-muted)]" />
          <span className="text-[var(--foreground-muted)]">{memberCount} member{memberCount !== 1 ? "s" : ""}</span>
        </div>
      </div>
      <p className="text-[var(--foreground-muted)] mb-6">A new movie every week. Watch it, rate it, discuss it. Discussions open Fridays at 8pm ET.</p>

      {/* Join/Leave */}
      {user && (
        <div className="mb-6">
          {isMember ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-emerald-400 font-medium">You&apos;re a member</span>
              <button onClick={leaveClub} className="text-xs text-[var(--foreground-muted)] hover:text-red-400 transition-colors">Leave</button>
            </div>
          ) : (
            <button onClick={joinClub} disabled={joining}
              className="px-5 py-2.5 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white font-semibold rounded-xl text-sm transition-colors disabled:opacity-50">
              {joining ? "Joining..." : "Join the Movie Club"}
            </button>
          )}
        </div>
      )}

      {!user && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-6 text-center">
          <p className="text-sm text-[var(--foreground-muted)]">
            <Link href="/auth/signin" className="text-[var(--ratist-red)] hover:underline">Sign in</Link> to join the Movie Club.
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
                {currentWeek.status === "watching" ? <><Clock className="w-5 h-5 text-[var(--ratist-red)]" /> This Week&apos;s Movie</> : <><MessageCircle className="w-5 h-5 text-[var(--ratist-red)]" /> Discussion Open</>}
              </h2>
              <div className="bg-[var(--surface)] border border-[var(--ratist-red)]/30 rounded-xl overflow-hidden">
                <div className="p-5 flex gap-5">
                  {currentWeek.moviePoster && (
                    <Link href={`/movies/${currentWeek.movieTmdbId}`} className="shrink-0">
                      <Image src={posterUrl(currentWeek.moviePoster, "w185")} alt={currentWeek.movieTitle ?? ""} width={120} height={180} className="rounded-lg border border-[var(--border)]" />
                    </Link>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[var(--ratist-red)] mb-1">Week {currentWeek.weekNumber} · {pickLabel(currentWeek.pickMethod)}</p>
                    <h3 className="text-xl font-bold text-white mb-1">
                      <Link href={`/movies/${currentWeek.movieTmdbId}`} className="hover:text-[var(--ratist-red)] transition-colors">
                        {currentWeek.movieTitle ?? "TBA"}
                      </Link>
                    </h3>
                    <p className="text-xs text-[var(--foreground-muted)] mb-4">
                      <Calendar className="w-3 h-3 inline mr-1" />{currentWeek.startDate} — {currentWeek.endDate}
                    </p>

                    <div className="flex gap-4 text-sm mb-4">
                      <span className="text-[var(--foreground-muted)]">{currentWeek.participantCount} rated</span>
                      {currentWeek.rewatchCount > 0 && <span className="text-[var(--foreground-muted)]">{currentWeek.rewatchCount} rewatch{currentWeek.rewatchCount !== 1 ? "es" : ""}</span>}
                      {currentWeek.canSeeDiscussion && currentWeek.avgRating && (
                        <span className="text-[var(--ratist-red)] font-bold">Avg: {currentWeek.avgRating}/10</span>
                      )}
                    </div>

                    {/* Submit rating */}
                    {isMember && currentWeek.userRating == null && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <input type="number" min="1" max="10" step="0.5" value={ratingInput} onChange={(e) => setRatingInput(e.target.value)}
                            placeholder="1-10" className="w-16 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-sm text-white text-center focus:outline-none focus:border-[var(--ratist-red)]" />
                          <button onClick={() => submitRating(currentWeek.id)} disabled={submittingRating || !ratingInput}
                            className="px-4 py-1.5 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white rounded-lg text-sm font-semibold disabled:opacity-50">
                            {submittingRating ? "..." : "Submit Rating"}
                          </button>
                        </div>
                        <textarea value={reviewText} onChange={(e) => setReviewText(e.target.value)} placeholder="Your thoughts (optional)..." rows={2}
                          className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] resize-none focus:outline-none focus:border-[var(--ratist-red)]" />
                      </div>
                    )}
                    {currentWeek.userRating != null && (
                      <p className="text-sm text-emerald-400">Your rating: <span className="font-bold">{currentWeek.userRating}/10</span></p>
                    )}

                    {/* Must submit to see discussion */}
                    {currentWeek.status === "discussion" && !currentWeek.canSeeDiscussion && currentWeek.userRating == null && (
                      <div className="mt-4 p-3 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg flex items-center gap-2">
                        <Lock className="w-4 h-4 text-[var(--foreground-muted)]" />
                        <p className="text-xs text-[var(--foreground-muted)]">Submit your rating to unlock the discussion room and see everyone&apos;s reviews.</p>
                      </div>
                    )}

                    {/* Link to full week page */}
                    <Link href={`/community/movie-club/week/${currentWeek.weekNumber}`}
                      className="inline-flex items-center gap-1 text-xs text-[var(--ratist-red)] hover:underline mt-3">
                      View full week page →
                    </Link>

                    {/* Discussion info for watching phase */}
                    {currentWeek.status === "watching" && (
                      <p className="text-xs text-[var(--foreground-muted)] mt-2">Discussions open Friday at 8:00 PM Eastern</p>
                    )}
                  </div>
                </div>

                {/* Discussion section — only visible after submitting */}
                {currentWeek.canSeeDiscussion && (
                  <div className="border-t border-[var(--border)] p-5">
                    {/* Superlatives */}
                    {currentWeek.superlatives.length > 0 && (
                      <div className="mb-6">
                        <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                          <Trophy className="w-4 h-4 text-yellow-400" /> Superlatives
                        </h4>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {currentWeek.superlatives.map((s, i) => (
                            <div key={i} className="bg-[var(--surface-2)] rounded-lg p-3 text-center">
                              <p className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wider mb-1">{s.label}</p>
                              {s.userUid ? (
                                <Link href={`/profile/${s.userUid}`} className="text-sm font-medium text-white hover:text-[var(--ratist-red)]">{s.userName}</Link>
                              ) : (
                                <p className="text-sm font-medium text-white">{s.userName}</p>
                              )}
                              <p className="text-xs text-[var(--foreground-muted)]">{s.value}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Ratings */}
                    <h4 className="text-sm font-semibold text-white mb-3">Community Ratings</h4>
                    <div className="space-y-2 mb-6">
                      {currentWeek.ratings.map((r) => (
                        <div key={r.user.firebaseUid} className="flex items-start gap-3 p-2 rounded-lg">
                          {r.user.avatarUrl && <Image src={r.user.avatarUrl} alt="" width={28} height={28} className="w-7 h-7 rounded-full object-cover mt-0.5" />}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Link href={`/profile/${r.user.firebaseUid}`} className="text-sm font-medium text-white hover:text-[var(--ratist-red)]">{r.user.name}</Link>
                              <span className="text-sm font-bold text-[var(--ratist-red)]">{r.rating}/10</span>
                              {r.isRewatch && <span className="text-[9px] text-[var(--foreground-muted)] bg-[var(--surface-2)] px-1.5 py-0.5 rounded">Rewatch</span>}
                            </div>
                            {r.reviewText && <p className="text-xs text-[var(--foreground-muted)] mt-1">{r.reviewText}</p>}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Discussion prompts */}
                    <h4 className="text-sm font-semibold text-white mb-3">Discussion</h4>
                    <div className="space-y-4">
                      {["What surprised you about this movie?", "Best scene or moment?", "Would you recommend this to a friend?", "How does this compare to the director's other work?"].map((prompt) => (
                        <div key={prompt} className="bg-[var(--surface-2)] rounded-lg p-3">
                          <p className="text-sm text-white font-medium mb-2">{prompt}</p>
                          <p className="text-xs text-[var(--foreground-muted)]">Discussion threads coming soon</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Coming Up */}
          {upcoming.length > 0 && (
            <section className="mb-10">
              <h2 className="text-sm font-semibold text-white mb-3">Coming Up</h2>
              <div className="space-y-2">
                {upcoming.map((w) => (
                  <div key={w.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm text-white font-medium">Week {w.weekNumber}</p>
                      <p className="text-xs text-[var(--foreground-muted)]">{w.pickTeaser ?? pickLabel(w.pickMethod)} · Starts {w.startDate}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[var(--foreground-muted)]" />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Past Weeks */}
          {pastWeeks.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-white mb-3">Past Weeks</h2>
              <div className="space-y-2">
                {pastWeeks.map((w) => (
                  <Link key={w.id} href={`/movies/${w.movieTmdbId}`}
                    className="flex items-center gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--ratist-red)]/30 transition-colors">
                    {w.moviePoster && <Image src={posterUrl(w.moviePoster, "w92")} alt="" width={36} height={54} className="rounded w-9 h-14 object-cover shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white">{w.movieTitle ?? "Unknown"}</p>
                      <p className="text-xs text-[var(--foreground-muted)]">Week {w.weekNumber} · {w.participantCount} rated · Avg: {w.avgRating ?? "–"}/10</p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {!currentWeek && upcoming.length === 0 && pastWeeks.length === 0 && (
            <p className="text-[var(--foreground-muted)] text-center py-20">No movie club activity yet. Join and check back soon!</p>
          )}
        </>
      )}
    </div>
  );
}
