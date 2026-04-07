"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Clapperboard, Calendar, Lock, Trophy, MessageCircle, Users, HelpCircle, ThumbsUp, ThumbsDown, BarChart3, RefreshCw, Lightbulb } from "lucide-react";
import { posterUrl } from "@/lib/tmdb";
import ScreeningRateForm from "@/components/screening/ScreeningRateForm";
import CommentSection from "@/components/CommentSection";

interface WeekRating {
  id: string; rating: number; reviewText: string | null; reviewType: string;
  isRewatch: boolean; createdAt: string;
  agreeCount: number; disagreeCount: number; userReaction: string | null;
  user: { firebaseUid: string; name: string; avatarUrl: string | null };
}
interface Superlative { label: string; userName: string; userAvatar: string | null; userUid: string; value: string; }
interface Prompt { text: string; commentCount: number; targetId: string; }
interface RatingDist { range: string; count: number; }
interface CategoryBreakdown { category: string; avgScore: number | null; }
interface WeekDetail {
  id: string; weekNumber: number; startDate: string; endDate: string; status: string;
  pickMethod: string; movieTmdbId: number | null; movieTitle: string | null; moviePoster: string | null;
  movieYear?: string; movieRuntime?: string; movieMpaRating?: string; movieStreaming?: string[];
  participantCount: number; rewatchCount: number; avgRating: number | null;
  ratingDistribution?: RatingDist[];
  categoryBreakdown?: CategoryBreakdown[];
  rewatchPoll?: { yes: number; no: number; maybe: number } | null;
  trivia?: string[];
  ratings: WeekRating[]; superlatives: Superlative[]; prompts: Prompt[];
}

export default function MovieClubWeekPage() {
  const { weekNumber } = useParams<{ weekNumber: string }>();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [week, setWeek] = useState<WeekDetail | null>(null);
  const [isMember, setIsMember] = useState(false);
  const [userRating, setUserRating] = useState<{ rating: number; reviewText: string | null; reviewType?: string; formData?: Record<string, unknown> } | null>(null);
  const [canSeeDiscussion, setCanSeeDiscussion] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [expandedPrompt, setExpandedPrompt] = useState<string | null>(null);
  const [editing, setEditing] = useState(searchParams.get("edit") === "1");
  const [justMarkedSeen, setJustMarkedSeen] = useState(false);
  const [userRewatchVote, setUserRewatchVote] = useState<string | null>(null);
  const [rewatchPoll, setRewatchPoll] = useState<{ yes: number; no: number; maybe: number } | null>(null);

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
        setUserRewatchVote(data.userRewatchVote ?? null);
        if (data.week?.rewatchPoll) setRewatchPoll(data.week.rewatchPoll);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [user, weekNumber]);

  useEffect(() => { fetchWeek(); }, [fetchWeek]);

  // Auto-refresh discussion data every 30 seconds when in discussion phase
  useEffect(() => {
    if (!canSeeDiscussion) return;
    const interval = setInterval(() => { fetchWeek(); }, 15000);
    return () => clearInterval(interval);
  }, [canSeeDiscussion, fetchWeek]);

  async function handleSubmitRating(data: Record<string, unknown>) {
    if (!user || !week) return;
    setSubmitting(true);
    const token = await user.getIdToken();

    // Submit to movie club
    const res = await fetch("/api/movie-club/rate", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        ...data,
        weekId: week.id,
        rating: data.overallRating,
      }),
    });

    if (res.ok) {
      const result = await res.json();
      if (result.markedAsSeen) setJustMarkedSeen(true);
      setSubmitted(true);
      setEditing(false);
      fetchWeek();
    }
    setSubmitting(false);
  }

  async function voteRewatch(vote: string) {
    if (!user || !week) return;
    // Optimistic update
    setUserRewatchVote(vote);
    const prev = rewatchPoll ?? { yes: 0, no: 0, maybe: 0 };
    const updated = { ...prev, [vote]: (prev[vote as keyof typeof prev] ?? 0) + 1 };
    if (userRewatchVote && userRewatchVote !== vote) updated[userRewatchVote as keyof typeof updated]--;
    setRewatchPoll(updated);

    const token = await user.getIdToken();
    const res = await fetch("/api/movie-club/rewatch-poll", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ weekId: week.id, vote }),
    });
    if (res.ok) {
      const data = await res.json();
      setRewatchPoll({ yes: data.results.yes ?? 0, no: data.results.no ?? 0, maybe: data.results.maybe ?? 0 });
    }
  }

  async function reactToReview(ratingId: string, value: string) {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch("/api/movie-club/reaction", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ratingId, value }),
    });
    if (res.ok) fetchWeek();
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

      {/* Rate section — show if not submitted, or if watching phase (for editing) */}
      {isOpen && isMember && (!submitted || (week.status === "watching" && editing)) && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-4">{submitted ? "Edit Your Review" : "Submit Your Review"}</h2>
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
            <ScreeningRateForm
              key={editing ? "edit" : "new"}
              onSubmit={handleSubmitRating}
              submitting={submitting}
              submitted={editing ? false : submitted}
              initialData={editing && userRating ? ((userRating.formData as Record<string, unknown>) ?? { overallRating: userRating.rating, reviewText: userRating.reviewText ?? "", reviewType: userRating.reviewType ?? "quick" }) : undefined}
            />
          </div>
        </section>
      )}

      {/* Already rated */}
      {submitted && userRating && !editing && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 mb-8">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-emerald-400">You rated this movie <span className="font-bold">{userRating.rating}/10</span></p>
            {week.status === "watching" && (
              <button onClick={() => setEditing(true)} className="text-xs text-[var(--foreground-muted)] hover:text-white transition-colors">
                Edit review
              </button>
            )}
          </div>
          {userRating.reviewText && <p className="text-xs text-[var(--foreground-muted)] mb-2">{userRating.reviewText}</p>}
          {justMarkedSeen && (
            <p className="text-xs text-emerald-400/70 mb-2">This movie has been marked as seen on your profile.</p>
          )}
          {(week.status === "discussion" || week.status === "archived") && week.movieTmdbId && (
            <button
              onClick={() => {
                // Pass the full form data (all rubric scores) for prefilling, matching Screening Room pattern
                const prefillData = userRating.formData
                  ? { ...userRating.formData }
                  : { overallRating: userRating.rating, reviewText: userRating.reviewText ?? "", reviewType: userRating.reviewType ?? "basic" };
                sessionStorage.setItem(`screening-prefill-${week.movieTmdbId}`, JSON.stringify(prefillData));
                window.open(`/movies/${week.movieTmdbId}/rate`, "_blank");
              }}
              className="inline-flex items-center gap-1.5 text-xs text-[var(--ratist-red)] hover:underline mt-1"
            >
              Make this your official Ratist review →
            </button>
          )}
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

          {/* Rating Distribution */}
          {week.ratingDistribution && week.ratingDistribution.some((d) => d.count > 0) && (
            <section>
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-[var(--ratist-red)]" /> Rating Distribution
              </h2>
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
                <div className="flex items-end gap-3" style={{ height: 120 }}>
                  {week.ratingDistribution.map((d) => {
                    const maxCount = Math.max(...week.ratingDistribution!.map((x) => x.count), 1);
                    const barHeight = d.count > 0 ? Math.max((d.count / maxCount) * 90, 8) : 4;
                    return (
                      <div key={d.range} className="flex-1 flex flex-col items-center justify-end h-full">
                        <span className="text-xs text-white font-bold mb-1">{d.count > 0 ? d.count : ""}</span>
                        <div className="w-full rounded-t-md" style={{ height: barHeight, backgroundColor: d.count > 0 ? "var(--ratist-red)" : "var(--surface-2)" }} />
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-3 mt-2">
                  {week.ratingDistribution.map((d) => (
                    <div key={d.range} className="flex-1 text-center">
                      <span className="text-[10px] text-[var(--foreground-muted)]">{d.range}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Category Breakdown */}
          {week.categoryBreakdown && week.categoryBreakdown.length > 0 && week.categoryBreakdown.some((c) => c.avgScore != null) && (
            <section>
              <h2 className="text-lg font-semibold text-white mb-4">Category Breakdown</h2>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {week.categoryBreakdown.map((c) => (
                  <div key={c.category} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 text-center">
                    <p className="text-xs text-[var(--foreground-muted)] mb-1">{c.category}</p>
                    <p className="text-lg font-bold text-white">{c.avgScore?.toFixed(1) ?? "–"}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Would You Rewatch? Poll */}
          <section>
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-[var(--ratist-red)]" /> Would You Rewatch?
            </h2>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
              {(() => {
                const total = (rewatchPoll?.yes ?? 0) + (rewatchPoll?.no ?? 0) + (rewatchPoll?.maybe ?? 0);
                const options = [
                  { key: "yes", label: "Yes", color: "bg-green-600", count: rewatchPoll?.yes ?? 0 },
                  { key: "maybe", label: "Maybe", color: "bg-yellow-600", count: rewatchPoll?.maybe ?? 0 },
                  { key: "no", label: "No", color: "bg-red-600", count: rewatchPoll?.no ?? 0 },
                ];
                return (
                  <div className="space-y-3">
                    {options.map(({ key, label, color, count }) => {
                      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                      const isSelected = userRewatchVote === key;
                      return (
                        <button key={key} onClick={() => voteRewatch(key)} className="w-full text-left">
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-sm font-medium ${isSelected ? "text-white" : "text-[var(--foreground-muted)]"}`}>
                              {label} {isSelected && "✓"}
                            </span>
                            <span className="text-xs text-[var(--foreground-muted)]">{total > 0 ? `${pct}% (${count})` : ""}</span>
                          </div>
                          <div className="h-3 bg-[var(--surface-2)] rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${color} transition-all duration-300`} style={{ width: `${pct}%` }} />
                          </div>
                        </button>
                      );
                    })}
                    {total > 0 && <p className="text-xs text-[var(--foreground-muted)] text-center pt-1">{total} vote{total !== 1 ? "s" : ""}</p>}
                  </div>
                );
              })()}
            </div>
          </section>

          {/* Trivia Corner */}
          {week.trivia && week.trivia.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-yellow-400" /> Trivia Corner
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {week.trivia.map((fact, i) => (
                  <div key={i} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 text-center">
                    <p className="text-sm text-white">{fact}</p>
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
                    {r.reviewText && <p className="text-sm text-[var(--foreground-muted)] leading-relaxed mb-2">{r.reviewText}</p>}
                    <div className="flex items-center gap-3">
                      <button onClick={() => reactToReview(r.id, "agree")}
                        className={`flex items-center gap-1 text-xs transition-colors ${r.userReaction === "agree" ? "text-green-400" : "text-[var(--foreground-muted)] hover:text-green-400"}`}>
                        <ThumbsUp className="w-3 h-3" /> {r.agreeCount > 0 && r.agreeCount}
                      </button>
                      <button onClick={() => reactToReview(r.id, "disagree")}
                        className={`flex items-center gap-1 text-xs transition-colors ${r.userReaction === "disagree" ? "text-red-400" : "text-[var(--foreground-muted)] hover:text-red-400"}`}>
                        <ThumbsDown className="w-3 h-3" /> {r.disagreeCount > 0 && r.disagreeCount}
                      </button>
                    </div>
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
                      <span className="text-xs text-[var(--foreground-muted)]">{prompt.commentCount} comment{prompt.commentCount !== 1 ? "s" : ""}</span>
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
