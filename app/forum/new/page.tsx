"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, PenLine } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface Category {
  id: string;
  name: string;
  slug: string;
}

function NewThreadForm() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const categoryPreset = searchParams.get("category");

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/forum/categories")
      .then((r) => r.json())
      .then((data) => {
        const cats = data.categories ?? [];
        setCategories(cats);
        // Pre-select from URL param
        if (categoryPreset) {
          const match = cats.find((c: Category) => c.slug === categoryPreset);
          if (match) setCategoryId(match.id);
        } else if (cats.length > 0) {
          setCategoryId(cats[0].id);
        }
      });
  }, [categoryPreset]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !title.trim() || !content.trim() || !categoryId) return;
    setSubmitting(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/forum/threads", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId, title, content }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create thread");
      } else {
        router.push(`/forum/t/${data.thread.slug}`);
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-[var(--foreground-muted)]">
          <Link href="/auth/signin" className="text-[var(--ratist-red)] hover:underline">Sign in</Link> to start a new thread.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <Link href="/forum" className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Forums
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <PenLine className="w-5 h-5 text-[var(--ratist-red)]" />
        <h1 className="text-xl font-bold text-white">Start a New Thread</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-[var(--foreground-muted)] mb-1.5">Category</label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            required
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--ratist-red)]"
          >
            {categories.length === 0 && <option value="">No categories available</option>}
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--foreground-muted)] mb-1.5">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What's on your mind?"
            required
            maxLength={200}
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--foreground-muted)] mb-1.5">Content</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Share your thoughts, questions, or discussion..."
            required
            rows={8}
            maxLength={10000}
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)] resize-y"
          />
          <p className="text-xs text-[var(--foreground-muted)] mt-1 text-right">{content.length}/10000</p>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex gap-3">
          <Link
            href="/forum"
            className="px-5 py-2.5 text-sm font-semibold text-[var(--foreground-muted)] border border-[var(--border)] rounded-full hover:border-white hover:text-white transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting || !title.trim() || !content.trim() || !categoryId}
            className="px-6 py-2.5 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold rounded-full disabled:opacity-40 transition-colors"
          >
            {submitting ? "Posting..." : "Post Thread"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function NewThreadPage() {
  return (
    <Suspense fallback={<div className="max-w-2xl mx-auto px-4 py-16 text-center text-[var(--foreground-muted)]">Loading...</div>}>
      <NewThreadForm />
    </Suspense>
  );
}
