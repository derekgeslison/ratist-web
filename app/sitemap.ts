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
    { url: `${base}/blog`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/punch-and-judy`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/movie-maps`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/tools`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/tools/shared-cast`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/tools/actor-lookup`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/tools/rankings`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/tools/recommend`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/tools/matchup`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/tools/analytics`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/tools/collections`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/about`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/terms`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.2 },
  ];

  // Dynamic movie pages
  let moviePages: MetadataRoute.Sitemap = [];
  try {
    const movies = await prisma.movie.findMany({
      select: { tmdbId: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 5000,
    });
    moviePages = movies.map((m) => ({
      url: `${base}/movies/${m.tmdbId}`,
      lastModified: m.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));
  } catch { /* DB not available */ }

  // Dynamic show pages
  let showPages: MetadataRoute.Sitemap = [];
  try {
    const shows = await prisma.tVShow.findMany({
      select: { tmdbId: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 5000,
    });
    showPages = shows.map((s) => ({
      url: `${base}/shows/${s.tmdbId}`,
      lastModified: s.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));
  } catch { /* DB not available */ }

  return [...staticPages, ...moviePages, ...showPages];
}
