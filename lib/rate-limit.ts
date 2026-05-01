import { prisma } from "@/lib/prisma";

// Default limits: 2 submissions per 3 days for each community feature
const DEFAULT_LIMITS: Record<string, { max: number; windowDays: number }> = {
  recast: { max: 2, windowDays: 3 },
  hotTake: { max: 2, windowDays: 3 },
  looksLike: { max: 2, windowDays: 3 },
  moviePitch: { max: 1, windowDays: 5 },
  forumThread: { max: 5, windowDays: 1 },
  postIdea: { max: 3, windowDays: 7 },
  collection: { max: 3, windowDays: 1 },
};

/**
 * Check if a user has exceeded the rate limit for a community feature.
 * Returns null if allowed, or an error message string if rate limited.
 * Admins bypass all rate limits.
 */
export async function checkCommunityRateLimit(
  userId: string,
  isAdmin: boolean,
  featureType: "recast" | "hotTake" | "looksLike" | "moviePitch" | "forumThread" | "postIdea" | "collection"
): Promise<string | null> {
  if (isAdmin) return null;

  const limits = DEFAULT_LIMITS[featureType];
  if (!limits) return null;

  // Try to load admin-configured limits from SiteConfig
  try {
    const config = await prisma.siteConfig.findUnique({ where: { key: `rateLimit_${featureType}` } });
    if (config?.value) {
      const parsed = JSON.parse(config.value);
      if (parsed.max != null) limits.max = parsed.max;
      if (parsed.windowDays != null) limits.windowDays = parsed.windowDays;
    }
  } catch { /* use defaults */ }

  const windowStart = new Date(Date.now() - limits.windowDays * 24 * 60 * 60 * 1000);

  let recentCount = 0;
  if (featureType === "recast") {
    recentCount = await prisma.recast.count({
      where: { creatorId: userId, createdAt: { gte: windowStart } },
    });
  } else if (featureType === "hotTake") {
    recentCount = await prisma.hotTake.count({
      where: { authorId: userId, createdAt: { gte: windowStart } },
    });
  } else if (featureType === "looksLike") {
    recentCount = await prisma.looksLike.count({
      where: { creatorId: userId, createdAt: { gte: windowStart } },
    });
  } else if (featureType === "moviePitch") {
    recentCount = await prisma.moviePitch.count({
      where: { authorId: userId, createdAt: { gte: windowStart } },
    });
  } else if (featureType === "forumThread") {
    recentCount = await prisma.forumThread.count({
      where: { authorId: userId, createdAt: { gte: windowStart } },
    });
  } else if (featureType === "postIdea") {
    recentCount = await prisma.postIdea.count({
      where: { submitterId: userId, createdAt: { gte: windowStart } },
    });
  } else if (featureType === "collection") {
    // Only count collections published into the public feed; drafts and
    // private/AI-only collections don't tax the limit.
    recentCount = await prisma.customCollection.count({
      where: {
        userId,
        visibility: "public",
        publishedAt: { gte: windowStart, not: null },
      },
    });
  }

  if (recentCount >= limits.max) {
    const featureNames: Record<string, string> = {
      recast: "Recasts",
      hotTake: "Hot Takes",
      looksLike: "Looks Like pairs",
      moviePitch: "Pitches",
      forumThread: "forum threads",
      postIdea: "idea submissions",
      collection: "public collections",
    };
    if (featureType === "forumThread") {
      return `You can create up to ${limits.max} forum threads per day.`;
    }
    if (featureType === "moviePitch") {
      return "You can only submit 1 pitch every 5 days. This is to prevent spam, and it ensures your submission is more likely to be read and interacted with.";
    }
    if (featureType === "collection") {
      return `You can publish up to ${limits.max} public collections per day. Private collections don't count — keep iterating and publish when you're ready.`;
    }
    return `To prevent spam, we limit users to ${limits.max} ${featureNames[featureType]} every ${limits.windowDays} days. Your submissions are also more likely to get engagement if you spread them out.`;
  }

  return null;
}
