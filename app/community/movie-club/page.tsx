"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Clapperboard, Users, Calendar, MessageCircle, Clock, Lock, Star, HelpCircle } from "lucide-react";
import { posterUrl } from "@/lib/tmdb";

interface Week {
  id: string; weekNumber: number; startDate: string; endDate: string; status: string;
  pickMethod: string; pickTeaser: string | null;
  movieTmdbId: number | null; movieTitle: string | null; moviePoster: string | null;
  movieYear?: string; movieRuntime?: string; movieMpaRating?: string; movieStreaming?: string[];
  avgRating: number | null; participantCount: number; rewatchCount: number;
  userRating: number | null; canSeeDiscussion: boolean;
  ratings: { user: { firebaseUid: string } }[];
}
interface VotingWeek {
  id: string; weekNumber: number; startDate: string; pickTeaser: string | null;
  nominations: { id: string; tmdbId: number; title: string; posterPath: string | null; voteCount: number }[];
}
interface UpcomingWeek { id: string; weekNumber: number; startDate: string; pickMethod: string; pickTeaser: string | null; revealEarly?: boolean; movieTitle?: string | null; moviePoster?: string | null; movieTmdbId?: number | null; movieYear?: string | null; }

export default function MovieClubPage() {
  const { user } = useAuth();
  const { hasPass, loading: subLoading } = useSubscription();
  const router = useRouter();
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [votingWeeks, setVotingWeeks] = useState<VotingWeek[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingWeek[]>([]);
  const [isMember, setIsMember] = useState(false);
  const [memberCount, setMemberCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      if (user) { const token = await user.getIdToken(); headers.Authorization = `Bearer ${token}`; }
      const res = await fetch("/api/movie-club/weeks", { headers });
      if (res.ok) {
        const data = await res.json();
        setWeeks(data.weeks ?? []);
        setVotingWeeks(data.votingWeeks ?? []);
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
    await fetch("/api/movie-club/join", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    setIsMember(false); setMemberCount((c) => c - 1);
  }

  const currentWeek = weeks.find((w) => w.status === "watching" || w.status === "discussion");
  const pastWeeks = weeks.filter((w) => w.status === "archived");
  const totalDiscussionComments = 0; // TODO: fetch from API

  useEffect(() => {
    if (!subLoading && !hasPass) router.replace("/backstage-pass/movie-club");
  }, [subLoading, hasPass, router]);

  if (subLoading || !hasPass) return <div className="py-20 text-center text-[var(--foreground-muted)]">Loading...</div>;

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
      {user ? (
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
      ) : (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-6 text-center">
          <Link href="/auth/signin" className="text-sm text-[var(--ratist-red)] hover:underline">Sign in to join the Movie Club</Link>
        </div>
      )}

      {loading ? (
        <p className="text-[var(--foreground-muted)] text-center py-20">Loading...</p>
      ) : (
        <>
          {/* Voting Week */}
          {votingWeeks.map((vw) => (
            <section key={vw.id} className="mb-10">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Star className="w-5 h-5 text-purple-400" /> Community Vote Open
              </h2>
              <div className="bg-[var(--surface)] border border-purple-400/30 rounded-xl p-5">
                <p className="text-sm text-[var(--foreground-muted)] mb-3">Nominate and vote for next week&apos;s movie! Top pick revealed Wednesday at 2am ET.</p>
                <p className="text-sm text-white mb-3">{vw.nominations.length} nomination{vw.nominations.length !== 1 ? "s" : ""} so far</p>
                <Link href={`/community/movie-club/nominations/${vw.id}`}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-semibold transition-colors">
                  Nominate & Vote →
                </Link>
              </div>
            </section>
          ))}

          {/* Current Week */}
          {currentWeek && (
            <section className="mb-10">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                {currentWeek.status === "watching" ? <><Clock className="w-5 h-5 text-[var(--ratist-red)]" /> This Week&apos;s Movie</> : <><MessageCircle className="w-5 h-5 text-[var(--ratist-red)]" /> Discussion Open</>}
              </h2>
              <div className="bg-[var(--surface)] border border-[var(--ratist-red)]/30 rounded-xl overflow-hidden">
                <div className="p-5 flex gap-5">
                  {currentWeek.moviePoster ? (
                    <Link href={`/movies/${currentWeek.movieTmdbId}`} className="shrink-0">
                      <Image src={posterUrl(currentWeek.moviePoster, "w185")} alt={currentWeek.movieTitle ?? ""} width={120} height={180} className="rounded-lg border border-[var(--border)]" />
                    </Link>
                  ) : (
                    <div className="w-[120px] h-[180px] rounded-lg bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center shrink-0">
                      <HelpCircle className="w-10 h-10 text-[var(--foreground-muted)]" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[var(--foreground-muted)] mb-1">
                      <Calendar className="w-3 h-3 inline mr-1" />{currentWeek.startDate} — {currentWeek.endDate}
                    </p>
                    <h3 className="text-xl font-bold text-white mb-3">
                      {currentWeek.movieTitle ? (
                        <Link href={`/movies/${currentWeek.movieTmdbId}`} className="hover:text-[var(--ratist-red)] transition-colors">
                          {currentWeek.movieTitle}
                        </Link>
                      ) : "???"}
                    </h3>

                    {/* Movie details */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--foreground-muted)] mb-2">
                      {currentWeek.movieYear && <span>{currentWeek.movieYear}</span>}
                      {currentWeek.movieMpaRating && <span className="border border-[var(--border)] px-1.5 py-0.5 text-xs rounded font-semibold text-white">{currentWeek.movieMpaRating}</span>}
                      {currentWeek.movieRuntime && <span>{currentWeek.movieRuntime}</span>}
                    </div>
                    {currentWeek.movieStreaming && currentWeek.movieStreaming.length > 0 && (
                      <p className="text-xs text-[var(--foreground-muted)] mb-2">Streaming on: <span className="text-white">{currentWeek.movieStreaming.join(", ")}</span></p>
                    )}

                    <div className="flex flex-wrap gap-3 text-sm mb-4">
                      <span className="text-[var(--foreground-muted)]">{currentWeek.participantCount} reviewed</span>
                      {currentWeek.canSeeDiscussion && currentWeek.avgRating && (
                        <span className="text-[var(--ratist-red)] font-bold">Avg: {currentWeek.avgRating}/10</span>
                      )}
                    </div>

                    {/* Action buttons */}
                    {isMember && currentWeek.userRating == null && (
                      <Link href={`/community/movie-club/week/${currentWeek.weekNumber}`}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white rounded-lg text-sm font-semibold transition-colors">
                        <Star className="w-4 h-4" /> Submit Your Review
                      </Link>
                    )}

                    {currentWeek.userRating != null && currentWeek.canSeeDiscussion && (
                      <Link href={`/community/movie-club/week/${currentWeek.weekNumber}`}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition-colors">
                        <MessageCircle className="w-4 h-4" /> Join the Discussion
                      </Link>
                    )}

                    {currentWeek.userRating != null && !currentWeek.canSeeDiscussion && (
                      <div className="flex items-center gap-3">
                        <p className="text-sm text-emerald-400">Your rating: <span className="font-bold">{currentWeek.userRating}/10</span></p>
                        {currentWeek.status === "watching" && (
                          <Link href={`/community/movie-club/week/${currentWeek.weekNumber}?edit=1`} className="text-xs text-[var(--foreground-muted)] hover:text-white transition-colors">
                            Edit review
                          </Link>
                        )}
                        <span className="text-xs text-[var(--foreground-muted)]">Discussion opens Friday 8pm ET</span>
                      </div>
                    )}

                    {!isMember && user && (
                      <button onClick={joinClub} disabled={joining}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50">
                        {joining ? "Joining..." : "Join to Participate"}
                      </button>
                    )}

                    {currentWeek.status === "discussion" && !currentWeek.canSeeDiscussion && currentWeek.userRating == null && isMember && (
                      <div className="flex items-center gap-2 mt-2 text-xs text-[var(--foreground-muted)]">
                        <Lock className="w-3.5 h-3.5" /> Submit your review to unlock the discussion
                      </div>
                    )}
                  </div>
                </div>
                {/* Schedule reminder */}
                <div className="border-t border-[var(--border)] px-5 py-2.5 flex items-center justify-between text-[11px] text-[var(--foreground-muted)]">
                  <span>Reviews due by Sunday night</span>
                  <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" /> Discussion opens Friday 8pm ET</span>
                </div>
              </div>
            </section>
          )}

          {/* Coming Up */}
          {upcoming.length > 0 && (
            <section className="mb-10">
              <h2 className="text-sm font-semibold text-white mb-3">Coming Up</h2>
              <div className="space-y-2">
                {upcoming.slice(0, 2).map((w) => (
                  <div key={w.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 flex items-center gap-3">
                    {w.revealEarly && w.moviePoster ? (
                      <Image src={posterUrl(w.moviePoster, "w92")} alt="" width={40} height={56} className="w-10 h-14 rounded object-cover shrink-0" />
                    ) : (
                      <div className="w-10 h-14 rounded bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center shrink-0">
                        <HelpCircle className="w-5 h-5 text-[var(--foreground-muted)]" />
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="text-sm text-white font-medium">
                        {w.revealEarly && w.movieTitle ? `${w.movieTitle}${w.movieYear ? ` (${w.movieYear})` : ""}` : (w.pickTeaser || "???")}
                      </p>
                      <p className="text-xs text-[var(--foreground-muted)]">Starts {w.startDate}</p>
                    </div>
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
                {pastWeeks.slice(0, 3).map((w) => (
                  <Link key={w.id} href={`/community/movie-club/week/${w.weekNumber}`}
                    className="flex items-center gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--ratist-red)]/30 transition-colors">
                    {w.moviePoster ? (
                      <Image src={posterUrl(w.moviePoster, "w92")} alt="" width={36} height={54} className="rounded w-9 h-14 object-cover shrink-0" />
                    ) : (
                      <div className="w-9 h-14 rounded bg-[var(--surface-2)] shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white">{w.movieTitle ?? "Unknown"}</p>
                      <p className="text-xs text-[var(--foreground-muted)]">{w.startDate} · {w.participantCount} rated · Avg: {w.avgRating ?? "–"}/10</p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {!currentWeek && votingWeeks.length === 0 && upcoming.length === 0 && pastWeeks.length === 0 && (
            <p className="text-[var(--foreground-muted)] text-center py-20">No movie club activity yet. Join and check back Monday!</p>
          )}
        </>
      )}
    </div>
  );
}
