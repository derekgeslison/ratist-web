import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
export const metadata: Metadata = { title: "Movie Maps" };
import Link from "next/link";
import Image from "next/image";
import { Map } from "lucide-react";
import { Suspense } from "react";
import PostSortBar from "@/components/PostSortBar";

export const dynamic = "force-dynamic";

export default async function MovieMapsPage({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  const { sort = "newest" } = await searchParams;
  const orderBy =
    sort === "popular" ? { viewCount: "desc" as const } :
    sort === "oldest" ? { createdAt: "asc" as const } :
    { createdAt: "desc" as const };

  const posts = await prisma.blogPost.findMany({
    where: { type: "MOVIE_MAP", published: true },
    select: { id: true, slug: true, title: true, excerpt: true, coverImage: true, createdAt: true, viewCount: true, author: { select: { name: true, avatarUrl: true } } },
    orderBy,
  });

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-2">
        <Map className="w-6 h-6 text-[var(--ratist-red)]" />
        <h1 className="text-2xl font-bold text-white">Movie Maps</h1>
      </div>
      <p className="text-[var(--foreground-muted)] mb-6">Curated journeys through cinema — themed lists, chronological watches, and essential viewing guides.</p>

      {posts.length > 0 && (
        <Suspense>
          <PostSortBar />
        </Suspense>
      )}

      {posts.length === 0 ? (
        <p className="text-[var(--foreground-muted)] text-center py-20">No maps yet.</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {posts.map((post) => (
            <Link key={post.id} href={`/movie-maps/${post.slug}`} className="group bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden hover:border-[var(--ratist-red)] transition-colors">
              {post.coverImage && (
                <div className="relative h-44 bg-[var(--surface-2)]">
                  <Image src={post.coverImage} alt={post.title} fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" />
                </div>
              )}
              <div className="p-5">
                <h2 className="text-base font-semibold text-white group-hover:text-[var(--ratist-red)] transition-colors mb-2 line-clamp-2">{post.title}</h2>
                {post.excerpt && <p className="text-sm text-[var(--foreground-muted)] line-clamp-2 mb-3">{post.excerpt}</p>}
                <p className="text-xs text-[var(--foreground-muted)]">By {post.author.name} · {new Date(post.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
