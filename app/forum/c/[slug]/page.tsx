"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { use } from "react";
import { MessageSquare, ArrowLeft, Pin, Lock, Clock } from "lucide-react";

interface Thread {
  id: string;
  title: string;
  slug: string;
  isPinned: boolean;
  isLocked: boolean;
  viewCount: number;
  updatedAt: string;
  createdAt: string;
  author: { id: string; name: string; avatarUrl: string | null };
  category: { name: string; slug: string };
  _count: { posts: number };
  posts: { author: { name: string } }[];
}

interface Props {
  params: Promise<{ slug: string }>;
}

export default function CategoryPage({ params }: Props) {
  const { slug } = use(params);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryName, setCategoryName] = useState("");

  useEffect(() => {
    fetch(`/api/forum/threads?categorySlug=${slug}`)
      .then((r) => r.json())
      .then((data) => {
        setThreads(data.threads ?? []);
        if (data.threads?.[0]?.category?.name) setCategoryName(data.threads[0].category.name);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [slug]);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/forum" className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-[var(--ratist-red)] mb-2 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Forums
          </Link>
          <h1 className="text-xl font-bold text-white">{categoryName || slug}</h1>
        </div>
        <Link
          href={`/forum/new?category=${slug}`}
          className="flex items-center gap-2 bg-[var(--ratist-red)] hover:bg-[var(--ratist-red-hover)] text-white text-sm font-semibold px-4 py-2 rounded-full transition-colors"
        >
          + New Thread
        </Link>
      </div>

      {loading ? (
        <p className="text-[var(--foreground-muted)] text-center py-10">Loading...</p>
      ) : threads.length === 0 ? (
        <div className="text-center py-10 text-[var(--foreground-muted)]">
          <p>No threads yet. <Link href={`/forum/new?category=${slug}`} className="text-[var(--ratist-red)] hover:underline">Start the first one.</Link></p>
        </div>
      ) : (
        <div className="space-y-2">
          {threads.map((thread) => (
            <div
              key={thread.id}
              className={`bg-[var(--surface)] border rounded-xl p-4 hover:border-[var(--ratist-red)]/50 transition-colors flex items-start gap-4 ${thread.isPinned ? "border-[var(--ratist-red)]/30" : "border-[var(--border)]"}`}
            >
              <div className="relative w-8 h-8 rounded-full overflow-hidden bg-[var(--surface-2)] border border-[var(--border)] shrink-0 mt-0.5">
                {thread.author.avatarUrl ? (
                  <Image src={thread.author.avatarUrl} alt="" fill sizes="32px" className="object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs font-bold text-white bg-[var(--ratist-red)]">
                    {thread.author.name[0].toUpperCase()}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {thread.isPinned && <Pin className="w-3 h-3 text-yellow-400 shrink-0" />}
                  {thread.isLocked && <Lock className="w-3 h-3 text-[var(--foreground-muted)] shrink-0" />}
                  <Link
                    href={`/forum/t/${thread.slug}`}
                    className="text-sm font-semibold text-white hover:text-[var(--ratist-red)] transition-colors line-clamp-1"
                  >
                    {thread.title}
                  </Link>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-[var(--foreground-muted)]">
                  <span>by {thread.author.name}</span>
                  <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" /> {thread._count.posts}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(thread.updatedAt).toLocaleDateString()}</span>
                  {thread.posts[0] && <span className="hidden sm:inline">Last by {thread.posts[0].author.name}</span>}
                </div>
              </div>
              <div className="shrink-0 text-right hidden sm:block">
                <p className="text-xs text-[var(--foreground-muted)]">{thread.viewCount} views</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
