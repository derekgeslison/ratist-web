"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquare, Users, Clock } from "lucide-react";

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  _count: { threads: number };
  threads: {
    id: string;
    title: string;
    slug: string;
    updatedAt: string;
    author: { name: string };
    _count: { posts: number };
  }[];
}

export default function ForumPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/forum/categories")
      .then((r) => r.json())
      .then((data) => { setCategories(data.categories ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <MessageSquare className="w-6 h-6 text-[var(--ratist-red)]" />
          <h1 className="text-2xl font-bold text-white">Forums</h1>
        </div>
        <Link
          href="/forum/new"
          className="flex items-center gap-2 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold px-4 py-2 rounded-full transition-colors"
        >
          + New Thread
        </Link>
      </div>

      {loading ? (
        <p className="text-[var(--foreground-muted)] text-center py-10">Loading...</p>
      ) : categories.length === 0 ? (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-8 text-center">
          <MessageSquare className="w-10 h-10 text-[var(--foreground-muted)] mx-auto mb-3 opacity-40" />
          <p className="text-[var(--foreground-muted)] mb-1">No forum categories yet.</p>
          <p className="text-xs text-[var(--foreground-muted)] opacity-70">Categories will appear here once the database is set up.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {categories.map((cat) => (
            <div key={cat.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
              <div className="p-5 border-b border-[var(--border)]">
                <Link href={`/forum/c/${cat.slug}`} className="text-base font-semibold text-white hover:text-[var(--ratist-red)] transition-colors">
                  {cat.name}
                </Link>
                {cat.description && (
                  <p className="text-xs text-[var(--foreground-muted)] mt-1">{cat.description}</p>
                )}
                <div className="flex items-center gap-4 mt-2 text-xs text-[var(--foreground-muted)]">
                  <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" /> {cat._count.threads} thread{cat._count.threads !== 1 ? "s" : ""}</span>
                </div>
              </div>
              {cat.threads[0] && (
                <div className="px-5 py-3 text-xs text-[var(--foreground-muted)] flex items-center justify-between gap-4">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Clock className="w-3 h-3 shrink-0" />
                    <span className="truncate">Latest: <Link href={`/forum/t/${cat.threads[0].slug}`} className="text-white hover:text-[var(--ratist-red)] transition-colors">{cat.threads[0].title}</Link></span>
                  </div>
                  <span className="shrink-0">by {cat.threads[0].author.name}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
