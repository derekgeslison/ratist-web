import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://www.theratist.com";
  return [
    { url: base, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${base}/movies`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/celebrities`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/community`, lastModified: new Date(), changeFrequency: "daily", priority: 0.6 },
    { url: `${base}/blog`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/tools/shared-cast`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/tools/actor-lookup`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/tools/rankings`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
  ];
}
