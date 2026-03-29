"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { Send } from "lucide-react";

export default function CommentForm({ slug }: { slug: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!user) {
    return (
      <p className="text-sm text-[var(--foreground-muted)]">
        <Link href="/auth/signin" className="text-[var(--ratist-red)] hover:underline">Sign in</Link> to leave a comment.
      </p>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const token = await user!.getIdToken();
      const res = await fetch(`/api/posts/${slug}/comments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Failed to post comment.");
        setSubmitting(false);
        return;
      }
      setContent("");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    }
    setSubmitting(false);
  }

  return (
    <form onSubmit={submit} className="mt-6">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Write a comment…"
        rows={3}
        maxLength={2000}
        className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] resize-none"
      />
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-[var(--foreground-muted)]">{content.length}/2000</span>
        <button
          type="submit"
          disabled={!content.trim() || submitting}
          className="flex items-center gap-1.5 px-4 py-2 bg-[var(--ratist-red)] text-white rounded-lg text-sm font-semibold hover:bg-[var(--ratist-red)]/80 transition-colors disabled:opacity-50"
        >
          <Send className="w-3.5 h-3.5" />
          {submitting ? "Posting…" : "Post Comment"}
        </button>
      </div>
    </form>
  );
}
