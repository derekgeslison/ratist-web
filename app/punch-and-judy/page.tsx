import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
export const metadata: Metadata = { title: "Punch & Judy" };
import Link from "next/link";
import Image from "next/image";
import { Swords, Eye } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PunchAndJudyPage() {
  const posts = await prisma.blogPost.findMany({
    where: { type: "PUNCH_AND_JUDY" as const, published: true },
    select: { id: true, slug: true, title: true, excerpt: true, coverImage: true, createdAt: true, viewCount: true, author: { select: { name: true, avatarUrl: true } } },
    orderBy: { createdAt: "desc" },
  });
  console.log("[P&J] found", posts.length, "posts");

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-2">
        <Swords className="w-6 h-6 text-[var(--ratist-red)]" />
        <h1 className="text-2xl font-bold text-white">Punch & Judy</h1>
      </div>
      <p className="text-[var(--foreground-muted)] mb-8">Head-to-head debates, comparisons, and contrarian takes.</p>

      {posts.length === 0 ? (
        <p className="text-[var(--foreground-muted)] text-center py-20">No posts yet.</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {posts.map((post) => (
            <Link key={post.id} href={`/punch-and-judy/${post.slug}`} className="group bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden hover:border-[var(--ratist-red)] transition-colors">
              {post.coverImage && (
                <div className="relative h-44 bg-[var(--surface-2)]">
                  <Image src={post.coverImage} alt={post.title} fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" />
                </div>
              )}
              <div className="p-5">
                <h2 className="text-base font-semibold text-white group-hover:text-[var(--ratist-red)] transition-colors mb-2 line-clamp-2">{post.title}</h2>
                {post.excerpt && <p className="text-sm text-[var(--foreground-muted)] line-clamp-2 mb-3">{post.excerpt}</p>}
                <div className="flex items-center justify-between text-xs text-[var(--foreground-muted)]">
                  <span>By {post.author.name} · {new Date(post.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span>
                  {post.viewCount > 0 && (
                    <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{post.viewCount.toLocaleString()}</span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
