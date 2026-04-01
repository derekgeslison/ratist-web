"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { use } from "react";
import { ArrowLeft, Lock, Pin, Send } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface ForumPost {
  id: string;
  content: string;
  isEdited: boolean;
  createdAt: string;
  author: { id: string; firebaseUid: string; name: string; avatarUrl: string | null };
}

interface Thread {
  id: string;
  title: string;
  slug: string;
  isPinned: boolean;
  isLocked: boolean;
  viewCount: number;
  createdAt: string;
  category: { id: string; name: string; slug: string };
  author: { id: string; firebaseUid: string; name: string; avatarUrl: string | null };
  posts: ForumPost[];
}

interface Props {
  params: Promise<{ slug: string }>;
}

export default function ThreadPage({ params }: Props) {
  const { slug } = use(params);
  const { user } = useAuth();
  const [thread, setThread] = useState<Thread | null>(null);
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
    fetch(`/api/forum/threads/${slug}`, { headers })
      .then((r) => r.json())
      .then((data) => { setThread(data.thread ?? null); setLoading(false); })
      .catch(() => setLoading(false));
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

  if (loading) return <p className="text-[var(--foreground-muted)] text-center py-16">Loading thread...</p>;
  if (!thread) return <p className="text-[var(--foreground-muted)] text-center py-16">Thread not found.</p>;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <Link
        href={`/forum/c/${thread.category.slug}`}
        className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] mb-4 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> {thread.category.name}
      </Link>

      <div className="mb-6">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          {thread.isPinned && <Pin className="w-4 h-4 text-yellow-400 shrink-0" />}
          {thread.isLocked && <Lock className="w-4 h-4 text-[var(--foreground-muted)] shrink-0" />}
          <h1 className="text-xl font-bold text-white leading-tight">{thread.title}</h1>
        </div>
        <p className="text-xs text-[var(--foreground-muted)]">
          {thread.posts.length} post{thread.posts.length !== 1 ? "s" : ""} · {thread.viewCount} views
          {thread.isLocked && <span className="ml-2 text-yellow-600">· Thread locked</span>}
        </p>
      </div>

      {/* Posts */}
      <div className="space-y-4 mb-8">
        {thread.posts.map((post, idx) => (
          <div key={post.id} className={`flex gap-4 ${idx === 0 ? "bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5" : "bg-[var(--surface)]/50 border border-[var(--border)]/50 rounded-xl p-4"}`}>
            <div className="shrink-0 flex flex-col items-center gap-2">
              <div className="relative w-9 h-9 rounded-full overflow-hidden bg-[var(--surface-2)] border border-[var(--border)]">
                {post.author.avatarUrl ? (
                  <Image src={post.author.avatarUrl} alt="" fill sizes="36px" className="object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs font-bold text-white bg-[var(--ratist-red)]">
                    {post.author.name[0].toUpperCase()}
                  </div>
                )}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <Link href={`/profile/${post.author.firebaseUid}`} className="text-sm font-semibold text-white hover:text-[var(--ratist-red)] transition-colors">
                  {post.author.name}
                </Link>
                {idx === 0 && <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--ratist-red)]/20 text-[var(--ratist-red)] font-medium">OP</span>}
                <span className="text-xs text-[var(--foreground-muted)]">
                  {new Date(post.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                  {post.isEdited && " (edited)"}
                </span>
              </div>
              <p className="text-sm text-[var(--foreground-muted)] leading-relaxed whitespace-pre-wrap">{post.content}</p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Reply form */}
      {!thread.isLocked && (
        user ? (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-3">Post a Reply</h3>
            <form onSubmit={submitReply}>
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Write your reply..."
                rows={4}
                maxLength={5000}
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] resize-none mb-2"
              />
              {error && <p className="text-sm text-red-400 mb-2">{error}</p>}
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--foreground-muted)]">{reply.length}/5000</span>
                <button
                  type="submit"
                  disabled={submitting || !reply.trim()}
                  className="flex items-center gap-2 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold px-5 py-2 rounded-full disabled:opacity-40 transition-colors"
                >
                  <Send className="w-4 h-4" /> Reply
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="text-center py-6 text-sm text-[var(--foreground-muted)]">
            <Link href="/auth/signin" className="text-[var(--ratist-red)] hover:underline">Sign in</Link> to reply to this thread.
          </div>
        )
      )}
    </div>
  );
}
