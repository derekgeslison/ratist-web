"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { MonitorPlay, Users, Bookmark, BarChart3, Star, MessageCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import ShareButton from "@/components/ShareButton";
import ScreeningRatingCompare from "@/components/screening/ScreeningRatingCompare";

const TMDB_IMG = "https://image.tmdb.org/t/p/w342";

interface RecapData {
  id: string;
  movieTitle: string | null;
  posterPath: string | null;
  tmdbId: number | null;
  inviteCode: string;
  startedAt: string | null;
  finishedAt: string | null;
  host: { id: string; name: string; avatarUrl: string | null };
  participants: { user: { id: string; name: string; avatarUrl: string | null } }[];
  predictions: { userId: string; plotGuess: string | null; ratingGuess: number | null; user?: { name: string } }[];
  polls: { id: string; question: string; options: string[]; votes: Record<string, number>; creator: { name: string } }[];
  bookmarks: { id: string; timestamp: string; note: string | null; user: { name: string } }[];
  ratings: { id: string; userId: string; reviewType: string; overallRating: number | null; ratistRating: number | null; storyScore: number | null; styleScore: number | null; emotiveScore: number | null; actingScore: number | null; entertainScore: number | null; reviewText: string | null; user: { id: string; name: string; avatarUrl: string | null } }[];
  chatHighlights: { id: string; text: string; emoji: string | null; reactCount: number; windowGroup: number; timestamp: string; user: { name: string } }[];
}

export default function ScreeningRecapPage() {
  const { user } = useAuth();
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<RecapData | null>(null);
  const [loading, setLoading] = useState(true);

  const getToken = useCallback(async () => (user ? user.getIdToken() : null), [user]);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    (async () => {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/screening/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setData(await res.json());
      setLoading(false);
    })();
  }, [user, id, getToken]);

  if (!user) return <div className="max-w-4xl mx-auto px-4 py-20 text-center text-[var(--foreground-muted)]">Sign in to view this recap.</div>;
  if (loading) return <div className="max-w-4xl mx-auto px-4 py-20 text-center text-[var(--foreground-muted)]">Loading...</div>;
  if (!data) return <div className="max-w-4xl mx-auto px-4 py-20 text-center text-red-400">Session not found.</div>;

  const watchDate = data.startedAt ? new Date(data.startedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : null;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 mb-6">
        <div className="flex items-start gap-5">
          {data.posterPath && (
            <div className="w-24 h-36 rounded-xl overflow-hidden flex-shrink-0 shadow-lg">
              <Image src={`${TMDB_IMG}${data.posterPath}`} alt={data.movieTitle ?? ""} width={96} height={144} className="object-cover w-full h-full" />
            </div>
          )}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <MonitorPlay className="w-5 h-5 text-[var(--ratist-red)]" />
              <span className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider">Screening Room Recap</span>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">{data.movieTitle ?? "Untitled Session"}</h1>
            <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--foreground-muted)]">
              {watchDate && <span>{watchDate}</span>}
              <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {data.participants.length} watchers</span>
              <span>Hosted by {data.host.name}</span>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {data.participants.map((p) => (
                <div key={p.user.id} className="flex items-center gap-1.5 bg-[var(--surface-2)] rounded-full px-2 py-1">
                  <div className="w-5 h-5 rounded-full bg-[var(--surface)] overflow-hidden">
                    {p.user.avatarUrl ? <Image src={p.user.avatarUrl} alt="" width={20} height={20} className="object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[8px] text-[var(--foreground-muted)]">{p.user.name[0]}</div>}
                  </div>
                  <span className="text-[10px] text-white">{p.user.name}</span>
                </div>
              ))}
            </div>
          </div>
          <ShareButton
            text={`Check out our Screening Room recap for ${data.movieTitle ?? "a movie"}!`}
            url={typeof window !== "undefined" ? window.location.href : ""}
            cardImageUrl={`/api/og/screening?id=${data.id}`}
          />
        </div>
      </div>

      <div className="space-y-6">
        {/* Rating Comparison */}
        {data.ratings && data.ratings.length > 0 && (
          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[var(--ratist-red)]" /> Rating Comparison
            </h2>
            <ScreeningRatingCompare ratings={data.ratings} tmdbId={data.tmdbId} myUserId="" />
          </section>
        )}

        {/* Predictions */}
        {data.predictions.length > 0 && (
          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Star className="w-4 h-4 text-[var(--ratist-red)]" /> Predictions
            </h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {data.predictions.map((pred) => {
                const pUser = data.participants.find((p) => p.user.id === pred.userId)?.user;
                return (
                  <div key={pred.userId} className="bg-[var(--surface-2)] rounded-lg p-4">
                    <p className="text-sm font-semibold text-white mb-1">{pUser?.name ?? "Unknown"}</p>
                    {pred.ratingGuess != null && (
                      <p className="text-xs text-[var(--foreground-muted)]">
                        Predicted: <span className="text-[var(--ratist-red)] font-bold text-sm">{pred.ratingGuess}/10</span>
                      </p>
                    )}
                    {pred.plotGuess && (
                      <p className="text-xs text-[var(--foreground-muted)] mt-2 italic leading-relaxed">&ldquo;{pred.plotGuess}&rdquo;</p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Polls */}
        {data.polls.length > 0 && (
          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[var(--ratist-red)]" /> Poll Results
            </h2>
            <div className="space-y-4">
              {data.polls.map((poll) => {
                const totalVotes = Object.keys(poll.votes).length;
                return (
                  <div key={poll.id} className="bg-[var(--surface-2)] rounded-lg p-4">
                    <p className="text-xs font-medium text-white mb-2">{poll.question}</p>
                    {(poll.options as string[]).map((opt: string, i: number) => {
                      const voteCount = Object.values(poll.votes).filter((v) => v === i).length;
                      const pct = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
                      const isWinner = voteCount === Math.max(...(poll.options as string[]).map((_, j) => Object.values(poll.votes).filter((v) => v === j).length));
                      return (
                        <div key={i} className="mb-1 rounded-lg px-3 py-2 text-xs relative overflow-hidden bg-[var(--surface)]">
                          <div className="absolute inset-0 bg-[var(--ratist-red)]/10 rounded-lg" style={{ width: `${pct}%` }} />
                          <span className={`relative ${isWinner ? "text-white font-semibold" : "text-[var(--foreground-muted)]"}`}>{opt}</span>
                          <span className="relative float-right text-[var(--foreground-muted)]">{voteCount} ({pct}%)</span>
                        </div>
                      );
                    })}
                    <p className="text-[10px] text-[var(--foreground-muted)] mt-1">Asked by {poll.creator.name} · {totalVotes} votes</p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Bookmarks */}
        {data.bookmarks.length > 0 && (
          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-[var(--ratist-red)]" /> Bookmarked Moments
            </h2>
            <div className="space-y-2">
              {data.bookmarks.map((b) => (
                <div key={b.id} className="flex items-center gap-3 bg-[var(--surface-2)] rounded-lg px-4 py-3">
                  <span className="text-sm font-mono text-[var(--ratist-red)] font-bold">{b.timestamp}</span>
                  <span className="text-sm text-white flex-1">{b.note ?? "Bookmarked moment"}</span>
                  <span className="text-xs text-[var(--foreground-muted)]">{b.user.name}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Chat Highlights */}
        {data.chatHighlights && data.chatHighlights.length > 0 && (() => {
          const groups = new Map<number, typeof data.chatHighlights>();
          for (const h of data.chatHighlights) {
            const list = groups.get(h.windowGroup) ?? [];
            list.push(h);
            groups.set(h.windowGroup, list);
          }
          const sortedGroups = [...groups.entries()].sort(([a], [b]) => a - b);
          return (
            <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-[var(--ratist-red)]" /> Chat Highlights
              </h2>
              <p className="text-xs text-[var(--foreground-muted)] mb-4">The most active moments from your watch session.</p>
              <div className="space-y-4">
                {sortedGroups.map(([groupIdx, msgs]) => {
                  const sessionStart = data.startedAt ? new Date(data.startedAt).getTime() : 0;
                  const startElapsed = Math.max(0, Math.floor((new Date(msgs[0].timestamp).getTime() - sessionStart) / 1000));
                  const endElapsed = Math.max(0, Math.floor((new Date(msgs[msgs.length - 1].timestamp).getTime() - sessionStart) / 1000));
                  const fmtElapsed = (s: number) => { const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, "0")}`; };
                  return (
                    <div key={groupIdx} className="bg-[var(--surface-2)] rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)]">
                        <span className="text-[10px] text-[var(--ratist-red)] font-medium">Peak Moment #{groupIdx + 1} · {msgs[0].reactCount} messages</span>
                        <span className="text-[10px] text-[var(--foreground-muted)]">{fmtElapsed(startElapsed)} — {fmtElapsed(endElapsed)}</span>
                      </div>
                      <div className="max-h-48 overflow-y-auto p-3 space-y-1.5 resize-y" style={{ minHeight: "80px" }}>
                        {msgs.map((h) => {
                          const isPoll = h.text?.startsWith("[Poll]");
                          return (
                            <div key={h.id} className={`flex items-start gap-2 ${isPoll ? "bg-[var(--surface)]/50 rounded-lg px-2 py-1.5 -mx-1" : ""}`}>
                              <span className="text-[10px] text-[var(--foreground-muted)] w-16 flex-shrink-0 pt-0.5">{isPoll ? "Poll" : h.user.name}</span>
                              {h.emoji ? (
                                <span className="text-lg">{h.emoji}</span>
                              ) : isPoll ? (
                                <p className="text-xs text-[var(--ratist-red)]">{h.text.replace("[Poll] ", "")}</p>
                              ) : (
                                <p className="text-xs text-white">{h.text}</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })()}

        {/* Link back */}
        <div className="text-center pt-4">
          <Link href="/screening-room" className="text-sm text-[var(--ratist-red)] hover:underline">
            ← Back to Screening Rooms
          </Link>
        </div>
      </div>
    </div>
  );
}
