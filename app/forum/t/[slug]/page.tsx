"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { use } from "react";
import { useIsTyping } from "@/context/TypingGuardContext";
import { Lock, Pin, Send, Trash2, ChevronDown, Bell, BellOff, Pencil, LockOpen } from "lucide-react";
import SmartBackLink from "@/components/SmartBackLink";
import NavEntryRegister from "@/components/NavEntryRegister";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import ReportButton from "@/components/ReportButton";
import CommentSection from "@/components/CommentSection";
import TextareaWithEmoji from "@/components/TextareaWithEmoji";
import AdUnit from "@/components/AdUnit";
import TypeBadge from "@/components/forum/TypeBadge";
import AuthorFlair from "@/components/forum/AuthorFlair";
import ReactionBar from "@/components/forum/ReactionBar";
import LinkedMediaRow from "@/components/forum/LinkedMediaRow";
import LinkedPeopleRow from "@/components/forum/LinkedPeopleRow";
import SpoilerGate from "@/components/forum/SpoilerGate";
import PollDisplay from "@/components/forum/PollDisplay";
import DebateView from "@/components/forum/DebateView";
import LinkedText from "@/components/forum/LinkedText";
import PageShare from "@/components/PageShare";

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
  const [following, setFollowing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const prevPostCount = useRef(0);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const isTyping = useIsTyping();

  async function loadThread(force = false) {
    // Skip auto-refresh if user is actively typing (prevents focus loss on mobile)
    if (!force && isTyping()) return;
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

  useEffect(() => { loadThread(true); }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch follow status + admin check
  useEffect(() => {
    if (!user) return;
    user.getIdToken().then((token) => {
      fetch(`/api/forum/threads/${slug}/follow`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((d) => setFollowing(d.following ?? false))
        .catch(() => {});
      fetch("/api/auth/admin-check", { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((d) => setIsAdmin(d.isAdmin ?? false))
        .catch(() => {});
    });
  }, [user, slug]);

  async function toggleAdmin(field: "isLocked" | "isPinned") {
    if (!user || !isAdmin || !thread) return;
    const token = await user.getIdToken();
    const res = await fetch(`/api/forum/threads/${slug}/admin`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: !thread[field] }),
    }).catch(() => null);
    if (res?.ok) loadThread();
  }

  async function saveEdit(postId: string) {
    if (!user || !editContent.trim()) return;
    const token = await user.getIdToken();
    const res = await fetch(`/api/forum/posts/${postId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content: editContent }),
    }).catch(() => null);
    if (res?.ok) {
      setEditingPostId(null);
      setEditContent("");
      loadThread();
    }
  }

  async function toggleFollow() {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch(`/api/forum/threads/${slug}/follow`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setFollowing(data.following);
    }
  }

  // Auto-refresh: 15s for debate/poll, 30s for others (reactions, comments)
  useEffect(() => {
    if (!thread) return;
    const ms = (thread.threadType === "debate" || thread.threadType === "poll") ? 15000 : 30000;
    const interval = setInterval(() => { loadThread(); }, ms);
    return () => clearInterval(interval);
  }, [thread?.threadType, slug]); // eslint-disable-line react-hooks/exhaustive-deps

  // Check if debate chat needs scroll button on load/refresh
  useEffect(() => {
    const el = chatContainerRef.current;
    if (el) {
      const needsScroll = el.scrollHeight - el.scrollTop - el.clientHeight > 60;
      setShowScrollBtn(needsScroll);
    }
  }, [thread?.posts?.length]);

  // Auto-scroll debate chat when new messages arrive and user is near bottom
  useEffect(() => {
    if (!thread || thread.threadType !== "debate") return;
    const postCount = thread.posts?.length ?? 0;
    if (postCount > prevPostCount.current && prevPostCount.current > 0) {
      const container = chatContainerRef.current;
      if (container) {
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
        if (isNearBottom) {
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
        }
      }
    }
    prevPostCount.current = postCount;
  }, [thread?.posts?.length]); // eslint-disable-line react-hooks/exhaustive-deps

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
          {thread.threadType === "debate" && thread.updatedAt && (Date.now() - new Date(thread.updatedAt).getTime()) > 5 * 24 * 60 * 60 * 1000 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-500/20 text-gray-400">Inactive</span>
          )}
        </div>
        <h1 className="text-xl font-bold text-white leading-tight mb-2">{thread.title}</h1>
        <div className="flex items-center justify-between">
          <p className="text-xs text-[var(--foreground-muted)]">
            {thread.posts?.length ?? 0} post{(thread.posts?.length ?? 0) !== 1 ? "s" : ""} · {thread.viewCount} views
            {thread.isLocked && <span className="ml-2 text-yellow-600">· Thread locked</span>}
          </p>
          <div className="flex items-center gap-3">
            <PageShare title={thread.title} />
            {user && (
              <button onClick={toggleFollow} className={`flex items-center gap-1 text-xs transition-colors ${following ? "text-[var(--ratist-red)]" : "text-[var(--foreground-muted)] hover:text-white"}`}>
                {following ? <><BellOff className="w-3 h-3" /> Following</> : <><Bell className="w-3 h-3" /> Follow</>}
              </button>
            )}
            {isAdmin && (
              <>
                <button onClick={() => toggleAdmin("isPinned")} className="flex items-center gap-1 text-xs text-[var(--foreground-muted)] hover:text-yellow-400 transition-colors">
                  <Pin className="w-3 h-3" /> {thread.isPinned ? "Unpin" : "Pin"}
                </button>
                <button onClick={() => toggleAdmin("isLocked")} className="flex items-center gap-1 text-xs text-[var(--foreground-muted)] hover:text-yellow-400 transition-colors">
                  {thread.isLocked ? <><LockOpen className="w-3 h-3" /> Unlock</> : <><Lock className="w-3 h-3" /> Lock</>}
                </button>
              </>
            )}
            {(isAuthor || isAdmin) && (
              <button onClick={deleteThread} className="flex items-center gap-1 text-xs text-[var(--foreground-muted)] hover:text-red-400 transition-colors">
                <Trash2 className="w-3 h-3" /> Delete
              </button>
            )}
          </div>
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
          onBoot={() => loadThread()}
          opponentJoinedAt={thread.opponentJoinedAt}
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
                  {op.isEdited && " (edited)"}
                </span>
                {/* Author-only edit. Admins moderate via delete/pin/lock
                   above — they should not be able to rewrite someone
                   else's post content (matches the API's authorization). */}
                {isAuthor && editingPostId !== op.id && (
                  <button onClick={() => { setEditingPostId(op.id); setEditContent(op.content); }} className="text-[var(--foreground-muted)] hover:text-white transition-colors">
                    <Pencil className="w-3 h-3" />
                  </button>
                )}
                <ReportButton targetType="forumPost" targetId={op.id} />
              </div>
            </div>
            {editingPostId === op.id ? (
              <div>
                <TextareaWithEmoji
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={6}
                  maxLength={10000}
                  className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)] resize-y mb-2"
                />
                <div className="flex items-center gap-2 justify-end">
                  <button onClick={() => { setEditingPostId(null); setEditContent(""); }} className="text-xs text-[var(--foreground-muted)] hover:text-white transition-colors">Cancel</button>
                  <button onClick={() => saveEdit(op.id)} disabled={!editContent.trim()} className="text-xs bg-[var(--ratist-red)] text-white px-3 py-1 rounded-full disabled:opacity-40">Save</button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-[var(--foreground-muted)] leading-relaxed whitespace-pre-wrap"><LinkedText text={op.content} /></p>
            )}
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
        <>
          {/* Debate chat-style exchange */}
          {thread.posts?.length > 1 && (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-4 relative">
              <h3 className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wide mb-3">Debate Exchange</h3>
              <div
                ref={chatContainerRef}
                className="max-h-[500px] overflow-y-auto space-y-3 pr-1 relative"
                onScroll={() => {
                  const el = chatContainerRef.current;
                  if (el) setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 60);
                }}
              >
                {thread.posts.slice(1).map((post: Thread) => {
                  const isOP = post.author.firebaseUid === thread.author.firebaseUid;
                  return (
                    <div key={post.id} className={`flex ${isOP ? "justify-start" : "justify-end"}`}>
                      <div className={`max-w-[85%] flex gap-2 ${isOP ? "flex-row" : "flex-row-reverse"}`}>
                        <div className={`relative w-7 h-7 rounded-full overflow-hidden shrink-0 border ${isOP ? "border-[var(--ratist-red)]/30" : "border-blue-500/30"}`}>
                          {post.author.avatarUrl ? (
                            <Image src={post.author.avatarUrl} alt="" fill sizes="28px" className="object-cover" />
                          ) : (
                            <div className={`w-full h-full flex items-center justify-center text-[9px] font-bold text-white ${isOP ? "bg-[var(--ratist-red)]" : "bg-blue-600"}`}>
                              {post.author.name[0]}
                            </div>
                          )}
                        </div>
                        <div className={`rounded-xl px-3 py-2 ${isOP ? "bg-[var(--ratist-red)]/10 border border-[var(--ratist-red)]/20" : "bg-blue-500/10 border border-blue-500/20"}`}>
                          <p className="text-sm text-white/90 whitespace-pre-wrap"><LinkedText text={post.content} /></p>
                          <p className="text-[10px] text-[var(--foreground-muted)] mt-1">
                            {new Date(post.createdAt).toLocaleTimeString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
                {showScrollBtn && (
                  <button
                    onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })}
                    className="sticky bottom-1 left-1/2 -translate-x-1/2 bg-[var(--surface-2)] border border-[var(--border)] rounded-full p-1.5 shadow-lg z-10"
                  >
                    <ChevronDown className="w-3 h-3 text-white" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Debate reply form — only for debaters */}
          {canReply && user && (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-4">
              <h3 className="text-sm font-semibold text-white mb-2">
                {thread.posts?.length > 0 && thread.posts[thread.posts.length - 1].author.firebaseUid === user.uid
                  ? "Waiting for opponent..."
                  : "Your Turn"}
              </h3>
              <form onSubmit={submitReply}>
                <TextareaWithEmoji
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

          {/* Audience comments below the debate */}
          <h3 className="text-sm font-semibold text-white mb-2">Audience Comments</h3>
          <CommentSection
            targetType="forumThread"
            targetId={thread.id}
            disabled={thread.isLocked}
          />
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
      <NavEntryRegister title={thread.title} />
      <div className="mb-4">
        <SmartBackLink defaultHref="/forum" defaultLabel="Forums" className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] transition-colors" />
      </div>

      {thread.hasSpoilers ? (
        <SpoilerGate>{threadContent}</SpoilerGate>
      ) : (
        threadContent
      )}
    </div>
  );
}
