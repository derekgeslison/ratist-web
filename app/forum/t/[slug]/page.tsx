"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { use } from "react";
import { ArrowLeft, Lock, Pin, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import ReportButton from "@/components/ReportButton";
import CommentSection from "@/components/CommentSection";
import AdUnit from "@/components/AdUnit";
import TypeBadge from "@/components/forum/TypeBadge";
import AuthorFlair from "@/components/forum/AuthorFlair";
import ReactionBar from "@/components/forum/ReactionBar";
import LinkedMediaRow from "@/components/forum/LinkedMediaRow";
import LinkedPeopleRow from "@/components/forum/LinkedPeopleRow";
import SpoilerGate from "@/components/forum/SpoilerGate";
import PollDisplay from "@/components/forum/PollDisplay";
import DebateView from "@/components/forum/DebateView";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Thread = any;

interface Props {
  params: Promise<{ slug: string }>;
}

export default function ThreadPage({ params }: Props) {
  const { slug } = use(params);
  const { user } = useAuth();
  const router = useRouter();
  const [thread, setThread] = useState<Thread | null>(null);
  const [userPollVote, setUserPollVote] = useState<string | null>(null);
  const [userDebateVote, setUserDebateVote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  async function loadThread() {
    const headers: Record<string, string> = {};
    if (user) {
      const token = await user.getIdToken();
      headers["Authorization"] = `Bearer ${token}`;
    }
    const res = await fetch(`/api/forum/threads/${slug}`, { headers }).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setThread(data.thread ?? null);
      setUserPollVote(data.userPollVote ?? null);
      setUserDebateVote(data.userDebateVote ?? null);
    }
    setLoading(false);
  }

  useEffect(() => { loadThread(); }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submitReply(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !reply.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/forum/threads/${slug}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content: reply }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to post reply");
      } else {
        setReply("");
        await loadThread();
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      }
    } catch {
      setError("Failed to post reply");
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteThread() {
    if (!user || !thread || !confirm("Are you sure you want to delete this thread? This cannot be undone.")) return;
    const token = await user.getIdToken();
    const res = await fetch(`/api/forum/threads/${slug}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => null);
    if (res?.ok) router.push("/forum");
  }

  if (loading) return <p className="text-[var(--foreground-muted)] text-center py-16">Loading thread...</p>;
  if (!thread) return <p className="text-[var(--foreground-muted)] text-center py-16">Thread not found.</p>;

  const isDebate = thread.threadType === "debate";
  const isAuthor = user?.uid === thread.author.firebaseUid;
  const canReply = !thread.isLocked && (!isDebate || !thread.opponentId ||
    (user && (user.uid === thread.author.firebaseUid || user.uid === thread.opponent?.firebaseUid)));

  const threadContent = (
    <>
      {/* Thread header */}
      <div className="mb-4">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <TypeBadge type={thread.threadType} />
          {thread.isPinned && <Pin className="w-4 h-4 text-yellow-400 shrink-0" />}
          {thread.isLocked && <Lock className="w-4 h-4 text-[var(--foreground-muted)] shrink-0" />}
        </div>
        <h1 className="text-xl font-bold text-white leading-tight mb-2">{thread.title}</h1>
        <div className="flex items-center justify-between">
          <p className="text-xs text-[var(--foreground-muted)]">
            {thread.posts?.length ?? 0} post{(thread.posts?.length ?? 0) !== 1 ? "s" : ""} · {thread.viewCount} views
            {thread.isLocked && <span className="ml-2 text-yellow-600">· Thread locked</span>}
          </p>
          {isAuthor && (
            <button onClick={deleteThread} className="flex items-center gap-1 text-xs text-[var(--foreground-muted)] hover:text-red-400 transition-colors">
              <Trash2 className="w-3 h-3" /> Delete
            </button>
          )}
        </div>
      </div>

      {/* Linked media */}
      <LinkedMediaRow media={thread.media ?? []} />

      {/* Linked people */}
      <LinkedPeopleRow people={thread.people ?? []} />

      {/* Tags */}
      {thread.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {thread.tags.map((t: { tag: string }) => (
            <Link key={t.tag} href={`/forum?tag=${t.tag}`} className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--surface-2)] text-[var(--foreground-muted)] hover:text-white transition-colors">
              {t.tag}
            </Link>
          ))}
        </div>
      )}

      <AdUnit slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_COMMUNITY ?? ""} format="auto" className="mb-4" />

      {/* Debate header */}
      {isDebate && (
        <DebateView
          threadSlug={slug}
          op={thread.author}
          opponent={thread.opponent}
          voteCounts={thread.debateVoteCounts}
          userVote={userDebateVote}
          onJoin={() => loadThread()}
        />
      )}

      {/* Poll */}
      {thread.threadType === "poll" && thread.poll && (
        <PollDisplay
          threadSlug={slug}
          options={thread.poll.options}
          userVote={userPollVote}
        />
      )}

      {/* OP Post */}
      {thread.posts?.[0] && (() => {
        const op = thread.posts[0];
        return (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <AuthorFlair
                firebaseUid={op.author.firebaseUid}
                name={op.author.name}
                avatarUrl={op.author.avatarUrl}
                badgeCount={op.author._count?.userBadges ?? 0}
                ratingCount={op.author._count?.ratings ?? 0}
                isOP
              />
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-[var(--foreground-muted)]">
                  {new Date(op.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                </span>
                <ReportButton targetType="forumPost" targetId={op.id} />
              </div>
            </div>
            <p className="text-sm text-[var(--foreground-muted)] leading-relaxed whitespace-pre-wrap">{op.content}</p>
            <ReactionBar
              postId={op.id}
              threadSlug={slug}
              counts={op.reactionCounts ?? {}}
              userReactions={op.userReactions ?? []}
            />
          </div>
        );
      })()}

      {/* Discussion — threaded comment section */}
      {isDebate ? (
        /* Debate: keep custom alternating reply form */
        <>
          {/* Show debate replies (posts after OP) as flat list since debates alternate */}
          {thread.posts?.slice(1).map((post: Thread) => (
            <div key={post.id} className={`flex gap-3 mb-3 rounded-xl p-3 ${post.author.firebaseUid === thread.author.firebaseUid ? "bg-[var(--ratist-red)]/5 border border-[var(--ratist-red)]/20" : "bg-blue-500/5 border border-blue-500/20"}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <AuthorFlair
                    firebaseUid={post.author.firebaseUid}
                    name={post.author.name}
                    avatarUrl={post.author.avatarUrl}
                    badgeCount={post.author._count?.userBadges ?? 0}
                    ratingCount={post.author._count?.ratings ?? 0}
                  />
                  <span className="text-xs text-[var(--foreground-muted)]">
                    {new Date(post.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </div>
                <p className="text-sm text-[var(--foreground-muted)] leading-relaxed whitespace-pre-wrap">{post.content}</p>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
          {/* Debate reply form */}
          {canReply && user && (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mt-4">
              <h3 className="text-sm font-semibold text-white mb-2">
                {thread.posts?.length > 0 && thread.posts[thread.posts.length - 1].author.firebaseUid === user.uid
                  ? "Waiting for opponent..."
                  : "Your Turn"}
              </h3>
              <form onSubmit={submitReply}>
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Write your argument..."
                  rows={3}
                  maxLength={5000}
                  className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] resize-none mb-2"
                />
                {error && <p className="text-sm text-red-400 mb-2">{error}</p>}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--foreground-muted)]">{reply.length}/5000</span>
                  <button type="submit" disabled={submitting || !reply.trim()} className="flex items-center gap-2 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold px-5 py-2 rounded-full disabled:opacity-40 transition-colors">
                    <Send className="w-4 h-4" /> Reply
                  </button>
                </div>
              </form>
            </div>
          )}
        </>
      ) : (
        /* All other thread types: use threaded CommentSection */
        <CommentSection
          targetType="forumThread"
          targetId={thread.id}
          disabled={thread.isLocked}
        />
      )}
    </>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <Link
        href="/forum"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] mb-4 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Forums
      </Link>

      {thread.hasSpoilers ? (
        <SpoilerGate>{threadContent}</SpoilerGate>
      ) : (
        threadContent
      )}
    </div>
  );
}
