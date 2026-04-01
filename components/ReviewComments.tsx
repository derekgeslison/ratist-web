"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { MessageCircle, Send, ChevronDown, ChevronUp } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface Comment {
  id: string;
  text: string;
  createdAt: string;
  user: { id: string; firebaseUid: string; name: string; avatarUrl: string | null };
  replies?: Comment[];
}

interface Props {
  reviewId: string;
}

export default function ReviewComments({ reviewId }: Props) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [disabled, setDisabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch(`/api/reviews/${reviewId}/comments`)
      .then((r) => r.json())
      .then((data) => {
        setComments(data.comments ?? []);
        setDisabled(data.disabled ?? false);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [reviewId]);

  async function postComment(text: string, parentId: string | null) {
    if (!user || !text.trim()) return;
    setSubmitting(true);
    const token = await user.getIdToken();
    const res = await fetch(`/api/reviews/${reviewId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ text: text.trim(), parentId }),
    });
    if (res.ok) {
      // Refetch all comments to get threaded structure
      const data = await fetch(`/api/reviews/${reviewId}/comments`).then((r) => r.json());
      setComments(data.comments ?? []);
      setNewComment("");
      setReplyText("");
      setReplyingTo(null);
    }
    setSubmitting(false);
  }

  const totalCount = comments.reduce((sum, c) => sum + 1 + (c.replies?.length ?? 0), 0);

  if (loading) return null;
  if (disabled) return null;

  function renderComment(comment: Comment, isReply: boolean) {
    return (
      <div key={comment.id} className={`flex gap-2.5 ${isReply ? "ml-10 mt-2" : "mt-3"}`}>
        <Link href={`/profile/${comment.user.firebaseUid}`} className="shrink-0">
          <div className="relative w-6 h-6 rounded-full overflow-hidden bg-[var(--ratist-red)] flex items-center justify-center">
            {comment.user.avatarUrl ? (
              <Image src={comment.user.avatarUrl} alt="" fill sizes="24px" className="object-cover" unoptimized />
            ) : (
              <span className="text-white text-[10px] font-bold">{comment.user.name[0]?.toUpperCase()}</span>
            )}
          </div>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link href={`/profile/${comment.user.firebaseUid}`} className="text-xs font-semibold text-white hover:text-[var(--ratist-red)] transition-colors">
              {comment.user.name}
            </Link>
            <span className="text-[10px] text-[var(--foreground-muted)]">
              {new Date(comment.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          </div>
          <p className="text-sm text-[var(--foreground-muted)] leading-relaxed mt-0.5">{comment.text}</p>
          {!isReply && user && (
            <button
              onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
              className="text-[10px] text-[var(--foreground-muted)] hover:text-white transition-colors mt-1"
            >
              Reply
            </button>
          )}
          {replyingTo === comment.id && (
            <div className="flex items-center gap-2 mt-2">
              <input
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={`Reply to ${comment.user.name}...`}
                className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); postComment(replyText, comment.id); } }}
              />
              <button
                onClick={() => postComment(replyText, comment.id)}
                disabled={submitting || !replyText.trim()}
                className="text-[var(--ratist-red)] hover:text-white transition-colors disabled:opacity-40"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {comment.replies?.map((reply) => renderComment(reply, true))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pb-3">
      <div className="border-t border-[var(--border)]/30 pt-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-xs text-[var(--foreground-muted)] hover:text-white transition-colors mb-2"
        >
          <MessageCircle className="w-3.5 h-3.5" />
          {totalCount > 0 ? `${totalCount} comment${totalCount !== 1 ? "s" : ""}` : "Comments"}
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        {expanded && (
          <>
            {user ? (
              <div className="flex items-center gap-2 mb-3">
                <input
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add a comment..."
                  className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); postComment(newComment, null); } }}
                />
                <button
                  onClick={() => postComment(newComment, null)}
                  disabled={submitting || !newComment.trim()}
                  className="text-[var(--ratist-red)] hover:text-white transition-colors disabled:opacity-40 p-1"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <p className="text-xs text-[var(--foreground-muted)] mb-3">
                <Link href="/auth/signin" className="text-[var(--ratist-red)] hover:underline">Sign in</Link> to comment.
              </p>
            )}

            {comments.length === 0 ? (
              <p className="text-xs text-[var(--foreground-muted)]">No comments yet. Be the first!</p>
            ) : (
              <div>
                {comments.map((c) => renderComment(c, false))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
