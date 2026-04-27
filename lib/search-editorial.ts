import { prisma } from "@/lib/prisma";

/**
 * Editorial search results for the global /search page. Pulls
 * matches from blog posts, two-thumbs (PUNCH_AND_JUDY), movie maps,
 * news articles, and forum threads. Two match strategies:
 *
 *   1. Title contains the query (case-insensitive).
 *   2. Tagged media or person matches a TMDB id from the entity
 *      results — i.e., a blog about a movie the user just searched
 *      for surfaces alongside that movie.
 *
 * Returns top results per type with sensible caps so a single popular
 * movie can't flood the page; forum threads are intentionally
 * smaller since they'll be the highest-volume long-term.
 */

interface EditorialHit {
  id: string;
  title: string;
  slug: string | null;
  excerpt: string | null;
  coverImage: string | null;
  publishedAt: string | null;
  authorName: string | null;
}

export interface EditorialResults {
  blogPosts: EditorialHit[];
  twoThumbs: EditorialHit[];
  movieMaps: EditorialHit[];
  news: EditorialHit[];
  forumThreads: Array<{
    id: string;
    title: string;
    slug: string;
    threadType: string;
    authorName: string;
    postCount: number;
    createdAt: string;
  }>;
  forumTotalCount: number;
}

/** Minimal editorial query — used when no entity TMDB ids are
 *  available (e.g., text-only query that didn't match a movie). */
export async function searchEditorial(
  query: string,
  taggedMediaTmdbIds: number[] = [],
  taggedPersonTmdbIds: number[] = []
): Promise<EditorialResults> {
  const trimmed = query.trim();
  if (!trimmed && taggedMediaTmdbIds.length === 0 && taggedPersonTmdbIds.length === 0) {
    return { blogPosts: [], twoThumbs: [], movieMaps: [], news: [], forumThreads: [], forumTotalCount: 0 };
  }

  // BlogPost types: BLOG | PUNCH_AND_JUDY | MOVIE_MAP. Filtered by
  // published + publishedAt <= now() so scheduled drafts stay hidden.
  const now = new Date();
  const blogPostWhere = (type: "BLOG" | "PUNCH_AND_JUDY" | "MOVIE_MAP") => {
    const titleClause = trimmed ? [{ title: { contains: trimmed, mode: "insensitive" as const } }] : [];
    const mediaClause = taggedMediaTmdbIds.length > 0
      ? [{ media: { some: { tmdbId: { in: taggedMediaTmdbIds } } } }]
      : [];
    const personClause = taggedPersonTmdbIds.length > 0
      ? [{ people: { some: { tmdbId: { in: taggedPersonTmdbIds } } } }]
      : [];
    return {
      type,
      published: true,
      publishedAt: { lte: now },
      OR: [...titleClause, ...mediaClause, ...personClause],
    };
  };

  const [blogRows, twoThumbsRows, movieMapRows, newsRows, forumRows, forumTotal] = await Promise.all([
    prisma.blogPost.findMany({
      where: blogPostWhere("BLOG"),
      select: {
        id: true, title: true, slug: true, excerpt: true, coverImage: true, publishedAt: true,
        author: { select: { name: true } },
      },
      orderBy: { publishedAt: "desc" },
      take: 5,
    }),
    prisma.blogPost.findMany({
      where: blogPostWhere("PUNCH_AND_JUDY"),
      select: {
        id: true, title: true, slug: true, excerpt: true, coverImage: true, publishedAt: true,
        author: { select: { name: true } },
      },
      orderBy: { publishedAt: "desc" },
      take: 5,
    }),
    prisma.blogPost.findMany({
      where: blogPostWhere("MOVIE_MAP"),
      select: {
        id: true, title: true, slug: true, excerpt: true, coverImage: true, publishedAt: true,
        author: { select: { name: true } },
      },
      orderBy: { publishedAt: "desc" },
      take: 5,
    }),
    prisma.newsItem.findMany({
      where: {
        published: true,
        publishedAt: { lte: now },
        OR: [
          ...(trimmed ? [{ title: { contains: trimmed, mode: "insensitive" as const } }] : []),
          ...(taggedMediaTmdbIds.length > 0 ? [{ media: { some: { tmdbId: { in: taggedMediaTmdbIds } } } }] : []),
          ...(taggedPersonTmdbIds.length > 0 ? [{ people: { some: { tmdbId: { in: taggedPersonTmdbIds } } } }] : []),
        ],
      },
      select: {
        id: true, title: true, slug: true, excerpt: true, coverImage: true, publishedAt: true,
        author: { select: { name: true } },
      },
      orderBy: { publishedAt: "desc" },
      take: 5,
    }),
    prisma.forumThread.findMany({
      where: {
        OR: [
          ...(trimmed ? [{ title: { contains: trimmed, mode: "insensitive" as const } }] : []),
          ...(taggedMediaTmdbIds.length > 0 ? [{ media: { some: { tmdbId: { in: taggedMediaTmdbIds } } } }] : []),
          ...(taggedPersonTmdbIds.length > 0 ? [{ people: { some: { tmdbId: { in: taggedPersonTmdbIds } } } }] : []),
        ],
      },
      select: {
        id: true, title: true, slug: true, threadType: true, createdAt: true,
        author: { select: { name: true } },
        _count: { select: { posts: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.forumThread.count({
      where: {
        OR: [
          ...(trimmed ? [{ title: { contains: trimmed, mode: "insensitive" as const } }] : []),
          ...(taggedMediaTmdbIds.length > 0 ? [{ media: { some: { tmdbId: { in: taggedMediaTmdbIds } } } }] : []),
          ...(taggedPersonTmdbIds.length > 0 ? [{ people: { some: { tmdbId: { in: taggedPersonTmdbIds } } } }] : []),
        ],
      },
    }),
  ]);

  const mapBlog = (row: { id: string; title: string; slug: string; excerpt: string | null; coverImage: string | null; publishedAt: Date | null; author: { name: string } | null }) => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    coverImage: row.coverImage,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    authorName: row.author?.name ?? null,
  });

  return {
    blogPosts: blogRows.map(mapBlog),
    twoThumbs: twoThumbsRows.map(mapBlog),
    movieMaps: movieMapRows.map(mapBlog),
    news: newsRows.map((r) => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      excerpt: r.excerpt,
      coverImage: r.coverImage,
      publishedAt: r.publishedAt?.toISOString() ?? null,
      authorName: r.author?.name ?? null,
    })),
    forumThreads: forumRows.map((r) => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      threadType: r.threadType,
      authorName: r.author.name,
      postCount: r._count.posts,
      createdAt: r.createdAt.toISOString(),
    })),
    forumTotalCount: forumTotal,
  };
}
