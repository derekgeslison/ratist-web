import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
export const metadata: Metadata = { title: "Blog", description: "Articles, insights, and discussions about movies, TV shows, and the world of cinema from The Ratist community." };

export const dynamic = "force-dynamic";
import Image from "next/image";
import Link from "next/link";
import { BookOpen, Calendar, Eye, MessageCircle, Search } from "lucide-react";
import { Suspense } from "react";
import PostSortBar from "@/components/PostSortBar";
import AdUnit from "@/components/AdUnit";

export default async function BlogPage({ searchParams }: { searchParams: Promise<{ sort?: string; q?: string }> }) {
  const { sort = "newest", q } = await searchParams;
  const orderBy =
    sort === "popular" ? { viewCount: "desc" as const } :
    sort === "oldest" ? { createdAt: "asc" as const } :
    { createdAt: "desc" as const };

  const searchFilter = q?.trim()
    ? { OR: [
        { title: { contains: q.trim(), mode: "insensitive" as const } },
        { excerpt: { contains: q.trim(), mode: "insensitive" as const } },
      ] }
    : {};

  const posts = await prisma.blogPost.findMany({
    where: { type: "BLOG", published: true, ...searchFilter },
    select: { id: true, slug: true, title: true, excerpt: true, coverImage: true, createdAt: true, viewCount: true, author: { select: { name: true, avatarUrl: true } } },
    orderBy,
  });

  const postIds = posts.map((p) => p.id);
  const commentCounts = postIds.length > 0
    ? await prisma.comment.groupBy({
        by: ["targetId"],
        where: { targetType: "blog", targetId: { in: postIds } },
        _count: { id: true },
      })
    : [];
  const commentMap = Object.fromEntries(commentCounts.map((c) => [c.targetId, c._count.id]));
  const postsWithComments = posts.map((p) => ({ ...p, commentCount: commentMap[p.id] ?? 0 }));

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-8">
        <BookOpen className="w-6 h-6 text-[var(--ratist-red)]" />
        <h1 className="text-2xl font-bold text-white">Blog</h1>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
        <form action="/blog" method="get" className="relative flex-1 w-full sm:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)]" />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search posts..."
            className="w-full pl-9 pr-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
          />
          {sort !== "newest" && <input type="hidden" name="sort" value={sort} />}
        </form>
        {q && (
          <Link href={`/blog${sort !== "newest" ? `?sort=${sort}` : ""}`} className="text-sm text-[var(--foreground-muted)] hover:text-white transition-colors">
            Clear search
          </Link>
        )}
        <Suspense>
          <PostSortBar />
        </Suspense>
      </div>

      {posts.length === 0 ? (
        <div className="text-center py-20 text-[var(--foreground-muted)]">
          <p>No posts yet. Check back soon.</p>
        </div>
      ) : (
        <>
        <AdUnit slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_BLOG ?? ""} format="auto" className="mb-6" />

        <div className="grid md:grid-cols-2 gap-6">
          {postsWithComments.map((post) => (
            <Link
              key={post.id}
              href={`/blog/${post.slug}`}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden hover:border-[var(--ratist-red)] transition-colors group"
            >
              {post.coverImage && (
                <div className="relative h-48 bg-[var(--surface-2)]">
                  <Image src={post.coverImage} alt={post.title} fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" />
                </div>
              )}
              <div className="p-5">
                <h2 className="text-base font-semibold text-white group-hover:text-[var(--ratist-red)] transition-colors mb-2 line-clamp-2">
                  {post.title}
                </h2>
                {post.excerpt && <p className="text-sm text-[var(--foreground-muted)] line-clamp-3 mb-3">{post.excerpt}</p>}
                <div className="flex items-center justify-between text-xs text-[var(--foreground-muted)]">
                  <span className="flex items-center gap-1.5">
                    {post.author.avatarUrl && (
                      <Image src={post.author.avatarUrl} alt="" width={16} height={16} className="rounded-full w-4 h-4 object-cover" />
                    )}
                    {post.author.name}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(post.createdAt).toLocaleDateString()}
                    </span>
                    {post.viewCount > 0 && (
                      <span className="flex items-center gap-1">
                        <Eye className="w-3 h-3" />
                        {post.viewCount.toLocaleString()}
                      </span>
                    )}
                    {post.commentCount > 0 && (
                      <span className="flex items-center gap-1">
                        <MessageCircle className="w-3 h-3" />
                        {post.commentCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
        </>
      )}
    </div>
  );
}
