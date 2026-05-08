import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import Image from "next/image";
import Link from "next/link";
import { Library, Calendar, Eye, MessageCircle, Heart, Search, BookOpen, Map } from "lucide-react";
import { Suspense } from "react";
import PostSortBar from "@/components/PostSortBar";
import AdUnit from "@/components/AdUnit";
import NavEntryRegister from "@/components/NavEntryRegister";
import TwoThumbsIcon from "@/components/TwoThumbsIcon";

export const metadata: Metadata = {
  title: "Posts",
  description: "All editorial content from The Ratist — long-form essays, head-to-head debates, and visual plot maps for movies and TV shows.",
  alternates: { canonical: "/posts" },
};

export const dynamic = "force-dynamic";

// PostType column values that the unified /posts page surfaces.
type PostType = "BLOG" | "MOVIE_MAP" | "PUNCH_AND_JUDY";

interface TypeChip {
  key: "" | PostType;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  /** Detail-page URL prefix; we use this when constructing per-card hrefs. */
  detailPrefix?: string;
  /** Tailwind class fragment for the card-corner type badge. */
  badgeBg: string;
}

const TYPE_CHIPS: TypeChip[] = [
  { key: "",                label: "All",        badgeBg: "" }, // unused for "All"
  { key: "BLOG",            label: "Blog",        icon: BookOpen,      detailPrefix: "/blog",        badgeBg: "bg-blue-600/90" },
  { key: "PUNCH_AND_JUDY",  label: "Two Thumbs",  icon: TwoThumbsIcon, detailPrefix: "/two-thumbs",  badgeBg: "bg-[var(--ratist-red)]/90" },
  { key: "MOVIE_MAP",       label: "Movie Maps",  icon: Map,           detailPrefix: "/movie-maps",  badgeBg: "bg-purple-600/90" },
];

function chipForType(t: PostType): TypeChip {
  return TYPE_CHIPS.find((c) => c.key === t) ?? TYPE_CHIPS[0];
}

export default async function PostsPage({ searchParams }: { searchParams: Promise<{ sort?: string; q?: string; type?: string }> }) {
  const { sort = "newest", q, type: rawType } = await searchParams;
  const type: PostType | "" =
    rawType === "BLOG" || rawType === "MOVIE_MAP" || rawType === "PUNCH_AND_JUDY" ? rawType : "";

  const orderBy =
    sort === "popular" ? { viewCount: "desc" as const } :
    sort === "oldest" ? { publishedAt: "asc" as const } :
    { publishedAt: "desc" as const };

  const searchFilter = q?.trim()
    ? { OR: [
        { title: { contains: q.trim(), mode: "insensitive" as const } },
        { excerpt: { contains: q.trim(), mode: "insensitive" as const } },
      ] }
    : {};

  const typeFilter = type ? { type } : {};

  const posts = await prisma.blogPost.findMany({
    where: {
      ...typeFilter,
      published: true,
      publishedAt: { lte: new Date() },
      ...searchFilter,
    },
    select: { id: true, slug: true, title: true, excerpt: true, coverImage: true, publishedAt: true, createdAt: true, viewCount: true, showAuthor: true, type: true, author: { select: { name: true, avatarUrl: true } } },
    orderBy,
  });

  const postIds = posts.map((p) => p.id);
  // Like + comment counts come from separate tables (PostLike +
  // Comment), both keyed by targetType:"blog" + targetId. Two grouped
  // counts run in parallel — way cheaper than per-row queries on the
  // listing page.
  const [commentCounts, likeCounts] = postIds.length > 0
    ? await Promise.all([
        prisma.comment.groupBy({
          by: ["targetId"],
          where: { targetType: "blog", targetId: { in: postIds } },
          _count: { id: true },
        }),
        prisma.postLike.groupBy({
          by: ["targetId"],
          where: { targetType: "blog", targetId: { in: postIds } },
          _count: { userId: true },
        }),
      ])
    : [[], []];
  const commentMap = Object.fromEntries(commentCounts.map((c) => [c.targetId, c._count.id]));
  const likeMap = Object.fromEntries(likeCounts.map((l) => [l.targetId, l._count.userId]));
  const postsWithComments = posts.map((p) => ({
    ...p,
    commentCount: commentMap[p.id] ?? 0,
    likeCount: likeMap[p.id] ?? 0,
  }));

  // Helper: build a URL preserving current filter state, swapping a single param.
  function buildHref(overrides: { type?: string; q?: string; sort?: string }): string {
    const params = new URLSearchParams();
    const finalType = "type" in overrides ? overrides.type : type;
    const finalQ = "q" in overrides ? overrides.q : q;
    const finalSort = "sort" in overrides ? overrides.sort : sort;
    if (finalType) params.set("type", finalType);
    if (finalQ) params.set("q", finalQ);
    if (finalSort && finalSort !== "newest") params.set("sort", finalSort);
    const qs = params.toString();
    return qs ? `/posts?${qs}` : "/posts";
  }

  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: postsWithComments.slice(0, 30).map((p, i) => {
      const c = chipForType(p.type as PostType);
      return {
        "@type": "ListItem",
        position: i + 1,
        url: `https://www.theratist.com${c.detailPrefix}/${p.slug}`,
        name: p.title,
      };
    }),
  };

  const heading =
    type === "" ? "Posts" :
    type === "BLOG" ? "Blog" :
    type === "PUNCH_AND_JUDY" ? "Two Thumbs" :
    "Movie Maps";
  const tagline =
    type === "" ? "Editorial content from The Ratist — long-form essays, head-to-head debates, and visual plot maps." :
    type === "BLOG" ? "In-depth essays, reviews, and think-pieces about movies and TV shows." :
    type === "PUNCH_AND_JUDY" ? "Head-to-head debates and contrarian takes — both sides of the argument, on the page." :
    "Visual plot maps for complex, hard-to-follow films, plus curated viewing guides.";

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }} />
      <NavEntryRegister title="Posts" />

      <div className="flex items-center gap-3 mb-2">
        <Library className="w-6 h-6 text-[var(--ratist-red)]" />
        <h1 className="text-2xl font-bold text-white">{heading}</h1>
      </div>
      <p className="text-[var(--foreground-muted)] mb-5">{tagline}</p>

      {/* Type filter chips. Clicking sets ?type= while preserving q + sort. */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {TYPE_CHIPS.map((chip) => {
          const Icon = chip.icon;
          const isActive = chip.key === type;
          return (
            <Link
              key={chip.key || "all"}
              href={buildHref({ type: chip.key })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
                isActive
                  ? "border-[var(--ratist-red)] bg-[var(--ratist-red)]/10 text-white"
                  : "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground-muted)] hover:text-white hover:border-[var(--ratist-red)]/50"
              }`}
            >
              {Icon && <Icon className="w-3.5 h-3.5" />}
              {chip.label}
            </Link>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
        <form action="/posts" method="get" className="relative flex-1 w-full sm:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground-muted)]" />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search posts..."
            className="w-full pl-9 pr-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-sm text-white placeholder:text-[var(--foreground-muted)] focus:outline-none focus:border-[var(--ratist-red)]"
          />
          {/* Preserve type + sort across search submissions */}
          {type && <input type="hidden" name="type" value={type} />}
          {sort !== "newest" && <input type="hidden" name="sort" value={sort} />}
        </form>
        {q && (
          <Link href={buildHref({ q: undefined })} className="text-sm text-[var(--foreground-muted)] hover:text-white transition-colors">
            Clear search
          </Link>
        )}
        <Suspense>
          <PostSortBar />
        </Suspense>
      </div>

      {posts.length === 0 ? (
        <div className="text-center py-20 text-[var(--foreground-muted)]">
          <p>{q ? `No posts match "${q}"` : "No posts yet. Check back soon."}</p>
        </div>
      ) : (
        <>
        <AdUnit slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_BLOG ?? ""} format="auto" className="mb-6" />

        <div className="grid md:grid-cols-2 gap-6">
          {postsWithComments.map((post) => {
            const chip = chipForType(post.type as PostType);
            const detailHref = `${chip.detailPrefix}/${post.slug}`;
            return (
              <Link
                key={post.id}
                href={detailHref}
                className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden hover:border-[var(--ratist-red)] transition-colors group"
              >
                {post.coverImage ? (
                  <div className="relative h-48 bg-[var(--surface-2)]">
                    <Image src={post.coverImage} alt={post.title} fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" />
                    <span className={`absolute top-2 left-2 ${chip.badgeBg} text-white text-[10px] font-bold uppercase px-1.5 py-0.5 rounded`}>
                      {chip.label}
                    </span>
                  </div>
                ) : (
                  <div className="relative h-2 bg-[var(--surface-2)]">
                    <span className={`absolute -top-1 left-3 ${chip.badgeBg} text-white text-[10px] font-bold uppercase px-1.5 py-0.5 rounded`}>
                      {chip.label}
                    </span>
                  </div>
                )}
                <div className="p-5">
                  <h2 className="text-base font-semibold text-white group-hover:text-[var(--ratist-red)] transition-colors mb-2 line-clamp-2">
                    {post.title}
                  </h2>
                  {post.excerpt && <p className="text-sm text-[var(--foreground-muted)] line-clamp-3 mb-3">{post.excerpt}</p>}
                  <div className="flex items-center justify-between text-xs text-[var(--foreground-muted)]">
                    {post.showAuthor !== false && post.author?.name ? (
                      <span className="flex items-center gap-1.5">
                        {post.author.avatarUrl && (
                          <Image src={post.author.avatarUrl} alt="" width={16} height={16} className="rounded-full w-4 h-4 object-cover" />
                        )}
                        {post.author.name}
                      </span>
                    ) : <span />}
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(post.publishedAt ?? post.createdAt).toLocaleDateString()}
                      </span>
                      {post.viewCount > 0 && (
                        <span className="flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          {post.viewCount.toLocaleString()}
                        </span>
                      )}
                      {post.likeCount > 0 && (
                        <span className="flex items-center gap-1">
                          <Heart className="w-3 h-3" />
                          {post.likeCount.toLocaleString()}
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
            );
          })}
        </div>
        </>
      )}
    </div>
  );
}
