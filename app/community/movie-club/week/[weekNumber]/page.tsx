"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Clapperboard, Calendar, Lock, Trophy, MessageCircle, Users, HelpCircle } from "lucide-react";
import { posterUrl } from "@/lib/tmdb";
import ScreeningRateForm from "@/components/screening/ScreeningRateForm";
import CommentSection from "@/components/CommentSection";

interface WeekRating {
  id: string; rating: number; reviewText: string | null; reviewType: string;
  isRewatch: boolean; createdAt: string;
  user: { firebaseUid: string; name: string; avatarUrl: string | null };
}
interface Superlative { label: string; userName: string; userAvatar: string | null; userUid: string; value: string; }
interface Prompt { text: string; commentCount: number; targetId: string; }
interface WeekDetail {
  id: string; weekNumber: number; startDate: string; endDate: string; status: string;
  pickMethod: string; movieTmdbId: number | null; movieTitle: string | null; moviePoster: string | null;
  movieYear?: string; movieRuntime?: string; movieMpaRating?: string; movieStreaming?: string[];
  participantCount: number; rewatchCount: number; avgRating: number | null;
  ratings: WeekRating[]; superlatives: Superlative[]; prompts: Prompt[];
}

export default function MovieClubWeekPage() {
  const { weekNumber } = useParams<{ weekNumber: string }>();
  const { user } = useAuth();
  const [week, setWeek] = useState<WeekDetail | null>(null);
  const [isMember, setIsMember] = useState(false);
  const [userRating, setUserRating] = useState<{ rating: number; reviewText: string | null } | null>(null);
  const [canSeeDiscussion, setCanSeeDiscussion] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [expandedPrompt, setExpandedPrompt] = useState<string | null>(null);

  const fetchWeek = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      if (user) { const token = await user.getIdToken(); headers.Authorization = `Bearer ${token}`; }
      const res = await fetch(`/api/movie-club/week/${weekNumber}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setWeek(data.week);
        setIsMember(data.isMember);
        setUserRating(data.userRating);
        setCanSeeDiscussion(data.canSeeDiscussion);
        setSubmitted(!!data.userRating);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [user, weekNumber]);

  useEffect(() => { fetchWeek(); }, [fetchWeek]);

  async function handleSubmitRating(data: Record<string, unknown>) {
    if (!user || !week) return;
    setSubmitting(true);
    const token = await user.getIdToken();

    // Submit to movie club
    const res = await fetch("/api/movie-club/rate", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        weekId: week.id,
        rating: data.overallRating,
        reviewText: data.reviewText ?? null,
        reviewType: data.reviewType ?? "quick",
      }),
    });

    if (res.ok) {
      // If they chose to make it official (standard review), also save to the movie's rating
      if (data.reviewType === "standard" && week.movieTmdbId) {
        await fetch(`/api/movies/${week.movieTmdbId}/rate`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }).catch(() => {});
      }

      setSubmitted(true);
      fetchWeek();
    }
    setSubmitting(false);
  }

  if (loading) return <div className="max-w-3xl mx-auto px-4 py-12 text-center text-[var(--foreground-muted)]">Loading...</div>;
  if (!week) return <div className="max-w-3xl mx-auto px-4 py-12 text-center text-red-400">Week not found</div>;

  const isOpen = week.status === "watching" || week.status === "discussion";

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <Link href="/community/movie-club" className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Movie Club
      </Link>

      {/* Movie header */}
      <div className="flex gap-5 mb-8">
        {week.moviePoster ? (
          <Link href={`/movies/${week.movieTmdbId}`} className="shrink-0">
            <Image src={posterUrl(week.moviePoster, "w185")} alt={week.movieTitle ?? ""} width={140} height={210} className="rounded-xl border border-[var(--border)]" />
          </Link>
        ) : (
          <div className="w-[140px] h-[210px] rounded-xl bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center shrink-0">
            <HelpCircle className="w-12 h-12 text-[var(--foreground-muted)]" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Clapperboard className="w-4 h-4 text-[var(--ratist-red)]" />
            <span className="text-xs text-[var(--foreground-muted)]">Movie Club</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${
              week.status === "watching" ? "text-green-400 bg-green-500/10" :
              week.status === "discussion" ? "text-blue-400 bg-blue-500/10" :
              "text-[var(--foreground-muted)] bg-[var(--surface-2)]"
            }`}>{week.status === "watching" ? "Now Watching" : week.status === "discussion" ? "Discussion Open" : week.status}</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            <Link href={`/movies/${week.movieTmdbId}`} className="hover:text-[var(--ratist-red)] transition-colors">
              {week.movieTitle ?? "TBA"}
            </Link>
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--foreground-muted)] mb-3">
            {week.movieYear && <span>{week.movieYear}</span>}
            {week.movieMpaRating && <span className="border border-[var(--border)] px-1.5 py-0.5 text-xs rounded font-semibold text-white">{week.movieMpaRating}</span>}
            {week.movieRuntime && <span>{week.movieRuntime}</span>}
            <span><Calendar className="w-3 h-3 inline mr-0.5" />{week.startDate} — {week.endDate}</span>
          </div>
          {week.movieStreaming && week.movieStreaming.length > 0 && (
            <p className="text-xs text-[var(--foreground-muted)] mb-3">
              Streaming on: <span className="text-white">{week.movieStreaming.join(", ")}</span>
            </p>
          )}
          <div className="flex gap-4 text-sm">
            <span className="flex items-center gap-1 text-[var(--foreground-muted)]"><Users className="w-3.5 h-3.5" /> {week.participantCount} rated</span>
            {week.rewatchCount > 0 && <span className="text-[var(--foreground-muted)]">{week.rewatchCount} rewatch{week.rewatchCount !== 1 ? "es" : ""}</span>}
            {canSeeDiscussion && week.avgRating && (
              <span className="text-[var(--ratist-red)] font-bold">Avg: {week.avgRating}/10</span>
            )}
          </div>
        </div>
      </div>

      {/* Rate section */}
      {isOpen && isMember && !submitted && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-4">Submit Your Review</h2>
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
            <ScreeningRateForm
              onSubmit={handleSubmitRating}
              submitting={submitting}
              submitted={submitted}
            />
          </div>
        </section>
      )}

      {/* Already rated */}
      {submitted && userRating && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 mb-8">
          <p className="text-sm text-emerald-400">You rated this movie <span className="font-bold">{userRating.rating}/10</span></p>
          {userRating.reviewText && <p className="text-xs text-[var(--foreground-muted)] mt-1">{userRating.reviewText}</p>}
        </div>
      )}

      {/* Not a member — join from here */}
      {isOpen && !isMember && user && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 mb-8 text-center">
          <p className="text-sm text-[var(--foreground-muted)] mb-3">Join the Movie Club to submit your review and participate in discussions.</p>
          <button
            onClick={async () => {
              const token = await user.getIdToken();
              const res = await fetch("/api/movie-club/join", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
              if (res.ok) { setIsMember(true); fetchWeek(); }
            }}
            className="px-5 py-2.5 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white font-semibold rounded-xl text-sm transition-colors"
          >
            Join the Movie Club
          </button>
        </div>
      )}

      {/* Discussion locked */}
      {week.status === "discussion" && !canSeeDiscussion && !submitted && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 mb-8 text-center">
          <Lock className="w-6 h-6 text-[var(--foreground-muted)] mx-auto mb-2" />
          <p className="text-sm text-[var(--foreground-muted)]">Submit your rating above to unlock the discussion room and see everyone&apos;s reviews.</p>
        </div>
      )}

      {/* Watching phase info */}
      {week.status === "watching" && (
        <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-4 mb-8 text-center">
          <p className="text-sm text-[var(--foreground-muted)]">Discussions open <strong className="text-white">Friday at 8:00 PM Eastern</strong></p>
        </div>
      )}

      {/* ─── Discussion Room ─── */}
      {canSeeDiscussion && (
        <div className="space-y-8">
          {/* Superlatives */}
          {week.superlatives.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-400" /> Superlatives
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {week.superlatives.map((s, i) => (
                  <div key={i} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 text-center">
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
            </section>
          )}

          {/* Community Ratings */}
          <section>
            <h2 className="text-lg font-semibold text-white mb-4">Community Ratings</h2>
            <div className="space-y-2">
              {week.ratings.map((r) => (
                <div key={r.id} className="flex items-start gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3">
                  {r.user.avatarUrl && <Image src={r.user.avatarUrl} alt="" width={32} height={32} className="w-8 h-8 rounded-full object-cover mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Link href={`/profile/${r.user.firebaseUid}`} className="text-sm font-medium text-white hover:text-[var(--ratist-red)]">{r.user.name}</Link>
                      <span className="text-sm font-bold text-[var(--ratist-red)]">{r.rating}/10</span>
                      {r.isRewatch && <span className="text-[9px] text-[var(--foreground-muted)] bg-[var(--surface-2)] px-1.5 py-0.5 rounded">Rewatch</span>}
                      {r.reviewType === "standard" && <span className="text-[9px] text-[var(--ratist-red)] bg-[var(--ratist-red)]/10 px-1.5 py-0.5 rounded">Full Review</span>}
                    </div>
                    {r.reviewText && <p className="text-sm text-[var(--foreground-muted)] leading-relaxed">{r.reviewText}</p>}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Discussion Prompts */}
          <section>
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-[var(--ratist-red)]" /> Discussion
            </h2>
            <div className="space-y-3">
              {week.prompts.map((prompt) => (
                <div key={prompt.targetId} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpandedPrompt(expandedPrompt === prompt.targetId ? null : prompt.targetId)}
                    className="w-full p-4 flex items-center justify-between text-left hover:bg-[var(--surface-2)]/30 transition-colors"
                  >
                    <p className="text-sm font-medium text-white">{prompt.text}</p>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-[var(--foreground-muted)]">{prompt.commentCount} {prompt.commentCount === 1 ? "reply" : "replies"}</span>
                      <MessageCircle className="w-4 h-4 text-[var(--foreground-muted)]" />
                    </div>
                  </button>
                  {expandedPrompt === prompt.targetId && (
                    <div className="border-t border-[var(--border)] p-4">
                      <CommentSection targetType="movieclub_prompt" targetId={prompt.targetId} isAdmin={false} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
