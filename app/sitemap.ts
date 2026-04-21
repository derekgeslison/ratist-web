import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://www.theratist.com";

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: base, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${base}/movies`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/movies?type=tv`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/celebrities`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/community`, lastModified: new Date(), changeFrequency: "daily", priority: 0.6 },
    { url: `${base}/forum`, lastModified: new Date(), changeFrequency: "daily", priority: 0.6 },
    { url: `${base}/news`, lastModified: new Date(), changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/blog`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/two-thumbs`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/movie-maps`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/tools`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/tools/shared-cast`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/tools/actor-lookup`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/tools/rankings`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/tools/recommend`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/tools/matchup`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/tools/collections`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/about`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/privacy`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/terms`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/backstage-pass`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
  ];

  // Helper for safely running a DB query that might fail during build before
  // the database is provisioned. Each section fails closed.
  async function safe<T>(fn: () => Promise<T[]>): Promise<T[]> {
    try { return await fn(); } catch { return []; }
  }

  const [
    movies, shows, blogPosts, newsArticles, movieMaps, twoThumbs, celebrities, forumThreads,
  ] = await Promise.all([
    safe(() => prisma.movie.findMany({
      select: { tmdbId: true, updatedAt: true },
      orderBy: { updatedAt: "desc" }, take: 5000,
    })),
    safe(() => prisma.tVShow.findMany({
      select: { tmdbId: true, updatedAt: true },
      orderBy: { updatedAt: "desc" }, take: 5000,
    })),
    safe(() => prisma.blogPost.findMany({
      where: { published: true, type: "BLOG" },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    })),
    safe(() => prisma.newsItem.findMany({
      where: { published: true },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" }, take: 2000,
    })),
    safe(() => prisma.blogPost.findMany({
      where: { published: true, type: "MOVIE_MAP" },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    })),
    safe(() => prisma.blogPost.findMany({
      where: { published: true, type: "PUNCH_AND_JUDY" },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    })),
    safe(() => prisma.celebrity.findMany({
      select: { tmdbId: true, cachedAt: true },
      orderBy: { cachedAt: "desc" }, take: 5000,
    })),
    safe(() => prisma.forumThread.findMany({
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" }, take: 2000,
    })),
  ]);

  const dynamicPages: MetadataRoute.Sitemap = [
    ...movies.map((m) => ({
      url: `${base}/movies/${m.tmdbId}`,
      lastModified: m.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...shows.map((s) => ({
      url: `${base}/shows/${s.tmdbId}`,
      lastModified: s.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...celebrities.map((c) => ({
      url: `${base}/celebrities/${c.tmdbId}`,
      lastModified: c.cachedAt ?? new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
    ...blogPosts.map((p) => ({
      url: `${base}/blog/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    ...newsArticles.map((n) => ({
      url: `${base}/news/${n.slug}`,
      lastModified: n.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
    ...movieMaps.map((p) => ({
      url: `${base}/movie-maps/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
    ...twoThumbs.map((p) => ({
      url: `${base}/two-thumbs/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
    ...forumThreads.map((t) => ({
      url: `${base}/forum/t/${t.slug}`,
      lastModified: t.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.4,
    })),
  ];

  return [...staticPages, ...dynamicPages];
}
