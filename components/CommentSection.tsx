"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { Heart, Reply, Trash2, ChevronDown, ChevronUp, Send } from "lucide-react";
import ReportButton from "./ReportButton";
import { useAuth } from "@/context/AuthContext";

interface CommentUser {
  id: string;
  firebaseUid: string;
  name: string;
  avatarUrl: string | null;
}

interface CommentData {
  id: string;
  text: string;
  parentId: string | null;
  createdAt: string;
  user: CommentUser;
  likeCount: number;
  likedByMe: boolean;
  replies: CommentData[];
}

interface Props {
  targetType: string;
  targetId: string;
  disabled?: boolean;
  isAdmin?: boolean;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d`;
  return `${Math.floor(days / 30)}mo`;
}

export default function CommentSection({ targetType, targetId, disabled, isAdmin: isAdminProp }: Props) {
  const { user } = useAuth();
  const [comments, setComments] = useState<CommentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminStatus, setAdminStatus] = useState(false);
  const [newText, setNewText] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [togglingLike, setTogglingLike] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const isAdmin = isAdminProp ?? adminStatus;

  const getToken = useCallback(async () => {
    if (!user) return null;
    return user.getIdToken();
  }, [user]);

  useEffect(() => {
    (async () => {
      const headers: Record<string, string> = {};
      if (user) {
        const token = await user.getIdToken();
        headers.Authorization = `Bearer ${token}`;
        // Check admin status if not provided via prop
        if (isAdminProp === undefined) {
          fetch("/api/auth/admin-check", { headers }).then((r) => r.json()).then((d) => {
            if (d.isAdmin) setAdminStatus(true);
          }).catch(() => {});
        }
      }
      const res = await fetch(`/api/comments?targetType=${targetType}&targetId=${targetId}`, { headers });
      const data = await res.json();
      setComments(data.comments ?? []);
      setLoading(false);
    })();
  }, [user, targetType, targetId, isAdminProp]);

  async function submitComment(parentId: string | null = null) {
    const text = parentId ? replyText : newText;
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    const token = await getToken();
    if (!token) { setSubmitting(false); return; }
    const res = await fetch("/api/comments", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ targetType, targetId, parentId, text: text.trim() }),
    });
    if (res.ok) {
      const data = await res.json();
      if (parentId) {
        // Insert reply into the tree and auto-expand the thread
        setComments((prev) => insertReply(prev, parentId, data.comment));
        setExpandedThreads((prev) => new Set(prev).add(parentId));
        setReplyText("");
        setReplyingTo(null);
      } else {
        setComments((prev) => [...prev, data.comment]);
        setNewText("");
      }
    }
    setSubmitting(false);
  }

  function insertReply(comments: CommentData[], parentId: string, reply: CommentData): CommentData[] {
    return comments.map((c) => {
      if (c.id === parentId) {
        return { ...c, replies: [...c.replies, reply] };
      }
      if (c.replies.length > 0) {
        return { ...c, replies: insertReply(c.replies, parentId, reply) };
      }
      return c;
    });
  }

  async function toggleLike(commentId: string) {
    if (!user || togglingLike.has(commentId)) return;
    setTogglingLike((prev) => new Set(prev).add(commentId));
    const token = await getToken();
    if (!token) return;
    const res = await fetch(`/api/comments/${commentId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setComments((prev) => updateComment(prev, commentId, (c) => ({
        ...c,
        likedByMe: data.liked,
        likeCount: c.likeCount + (data.liked ? 1 : -1),
      })));
    }
    setTogglingLike((prev) => { const s = new Set(prev); s.delete(commentId); return s; });
  }

  async function deleteComment(commentId: string) {
    if (!user || deleting.has(commentId)) return;
    setDeleting((prev) => new Set(prev).add(commentId));
    const token = await getToken();
    if (!token) return;
    const res = await fetch(`/api/comments/${commentId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setComments((prev) => removeComment(prev, commentId));
    }
    setDeleting((prev) => { const s = new Set(prev); s.delete(commentId); return s; });
  }

  function updateComment(comments: CommentData[], id: string, fn: (c: CommentData) => CommentData): CommentData[] {
    return comments.map((c) => {
      if (c.id === id) return fn(c);
      if (c.replies.length > 0) return { ...c, replies: updateComment(c.replies, id, fn) };
      return c;
    });
  }

  function removeComment(comments: CommentData[], id: string): CommentData[] {
    return comments.filter((c) => c.id !== id).map((c) => ({
      ...c,
      replies: removeComment(c.replies, id),
    }));
  }

  function toggleExpand(id: string) {
    setExpandedThreads((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }

  function countAllReplies(c: CommentData): number {
    let count = c.replies.length;
    for (const r of c.replies) count += countAllReplies(r);
    return count;
  }

  function renderComment(comment: CommentData, depth: number = 0, depth1ParentId?: string) {
    const isOwn = user?.uid === comment.user.firebaseUid;
    const canDeleteComment = isOwn || isAdmin;
    const isExpanded = expandedThreads.has(comment.id);
    const maxIndent = Math.min(depth, 2);
    // depth 0: reply creates thread 1 (attached to this comment)
    // depth 1: reply creates thread 2 (attached to this comment)
    // depth 2+: reply stays in thread 2 (attached to the depth-1 parent)
    const replyTo = depth >= 2 && depth1ParentId ? depth1ParentId : comment.id;

    return (
      <div key={comment.id} className={depth > 0 ? `pl-3 border-l border-[var(--border)]/30` : ""} style={depth > 0 ? { marginLeft: `${maxIndent * 16}px` } : undefined}>
        <div className="flex gap-2.5 py-2.5 group/comment">
          {/* Avatar */}
          <Link href={`/profile/${comment.user.firebaseUid}`} className="shrink-0">
            {comment.user.avatarUrl ? (
              <Image src={comment.user.avatarUrl} alt={comment.user.name} width={28} height={28} className="rounded-full" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-[var(--surface-2)] flex items-center justify-center text-[10px] text-[var(--foreground-muted)]">
                {comment.user.name.charAt(0).toUpperCase()}
              </div>
            )}
          </Link>

          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-center gap-2 text-xs">
              <Link href={`/profile/${comment.user.firebaseUid}`} className="font-semibold text-white hover:text-[var(--ratist-red)] transition-colors">
                {comment.user.name}
              </Link>
              <span className="text-[var(--foreground-muted)]">{timeAgo(comment.createdAt)}</span>
            </div>

            {/* Text with @mention highlighting */}
            <p className="text-sm text-white/90 mt-0.5 whitespace-pre-wrap break-words">
              {comment.text.split(/(@\[[^\]]+\])/g).map((part, i) =>
                part.match(/^@\[.+\]$/) ? (
                  <span key={i} className="text-[var(--ratist-red)] font-medium">@{part.slice(2, -1)}</span>
                ) : part
              )}
            </p>

            {/* Actions */}
            <div className="flex items-center gap-3 mt-1">
              {user && !disabled && (
                <>
                  <button
                    onClick={() => toggleLike(comment.id)}
                    disabled={togglingLike.has(comment.id)}
                    className={`flex items-center gap-1 text-xs transition-colors ${
                      comment.likedByMe ? "text-[var(--ratist-red)]" : "text-[var(--foreground-muted)] hover:text-[var(--ratist-red)]"
                    }`}
                  >
                    <Heart className={`w-3 h-3 ${comment.likedByMe ? "fill-current" : ""}`} />
                    {comment.likeCount > 0 && comment.likeCount}
                  </button>
                  <button
                    onClick={() => {
                      if (replyingTo === replyTo) { setReplyingTo(null); setReplyText(""); }
                      else {
                        setReplyingTo(replyTo);
                        const isSelf = user?.uid === comment.user.firebaseUid;
                        setReplyText(isSelf ? "" : `@[${comment.user.name}] `);
                      }
                    }}
                    className="flex items-center gap-1 text-xs text-[var(--foreground-muted)] hover:text-white transition-colors"
                  >
                    <Reply className="w-3 h-3" /> Reply
                  </button>
                  {canDeleteComment && (
                    confirmingDelete === comment.id ? (
                      <span className="flex items-center gap-1.5 text-xs">
                        <button onClick={() => { deleteComment(comment.id); setConfirmingDelete(null); }} className="text-red-400 hover:text-red-300 font-medium">Delete</button>
                        <button onClick={() => setConfirmingDelete(null)} className="text-[var(--foreground-muted)] hover:text-white">Cancel</button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmingDelete(comment.id)}
                        disabled={deleting.has(comment.id)}
                        className="flex items-center gap-1 text-xs text-[var(--foreground-muted)] hover:text-red-400 transition-colors opacity-0 group-hover/comment:opacity-100"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )
                  )}
                </>
              )}
              {!user && comment.likeCount > 0 && (
                <span className="flex items-center gap-1 text-xs text-[var(--foreground-muted)]">
                  <Heart className="w-3 h-3" /> {comment.likeCount}
                </span>
              )}
              {user && <ReportButton targetType="comment" targetId={comment.id} />}
            </div>

            {/* Reply input — shows on the comment that replyTo points to */}
            {replyingTo === comment.id && (
              <div className="flex gap-2 mt-2">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={`Reply to ${comment.user.name}...`}
                  rows={1}
                  className="flex-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] resize-none max-h-[7.5rem] overflow-y-auto"
                  onInput={(e) => { const t = e.target as HTMLTextAreaElement; t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 120) + "px"; }}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitComment(comment.id); } }}
                  onFocus={(e) => { const len = e.target.value.length; e.target.setSelectionRange(len, len); }}
                  autoFocus
                />
                <button
                  onClick={() => submitComment(comment.id)}
                  disabled={!replyText.trim() || submitting}
                  className="p-1.5 text-[var(--ratist-red)] hover:text-white disabled:opacity-30 transition-colors self-end"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Replies */}
        {comment.replies.length > 0 && (
          <>
            <button onClick={() => toggleExpand(comment.id)} className="flex items-center gap-1 text-[10px] text-[var(--foreground-muted)] hover:text-white ml-10 -mt-1 mb-1 transition-colors">
              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {(() => { const total = countAllReplies(comment); return isExpanded ? "Hide replies" : `Show ${total} repl${total === 1 ? "y" : "ies"}`; })()}
            </button>
            {isExpanded && comment.replies.map((reply) => renderComment(reply, depth + 1, depth >= 1 ? (depth1ParentId ?? comment.id) : undefined))}
          </>
        )}
      </div>
    );
  }

  if (disabled && comments.length === 0) return null;

  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold text-white mb-2">
        Comments{comments.length > 0 ? ` (${countAll(comments)})` : ""}
      </h3>

      {loading ? (
        <p className="text-xs text-[var(--foreground-muted)] py-4">Loading comments...</p>
      ) : (
        <>
          {comments.length > 0 && (
            <div className="divide-y divide-[var(--border)]/10">
              {comments.map((c) => renderComment(c))}
            </div>
          )}

          {user && !disabled ? (
            <div className="flex gap-2 mt-3 items-end">
              <textarea
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                placeholder="Add a comment..."
                rows={1}
                className="flex-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] resize-none max-h-[7.5rem] overflow-y-auto"
                onInput={(e) => { const t = e.target as HTMLTextAreaElement; t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 120) + "px"; }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitComment(); } }}
              />
              <button
                onClick={() => submitComment()}
                disabled={!newText.trim() || submitting}
                className="px-3 py-2 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                {submitting ? "..." : "Post"}
              </button>
            </div>
          ) : !user ? (
            <p className="text-xs text-[var(--foreground-muted)] mt-2">
              <Link href="/auth/signin" className="text-[var(--ratist-red)] hover:underline">Sign in</Link> to comment.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function countAll(comments: CommentData[]): number {
  return comments.reduce((sum, c) => sum + 1 + countAll(c.replies), 0);
}
