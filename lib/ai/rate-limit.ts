import { prisma } from "@/lib/prisma";
import { isSubscriptionActive } from "@/lib/subscription";

interface UserForRateLimit {
  id: string;
  isAdmin: boolean;
  subscriptionTier: string | null;
  subscriptionStatus: string | null;
  subscriptionExpiry: Date | null;
}

/**
 * Check if the user has exceeded the free AI usage quota.
 * Admins and Backstage Pass holders bypass entirely.
 * Returns null if allowed, or an error message string if rate limited.
 */
export async function checkAiRateLimit(
  user: UserForRateLimit,
  feature: string,
  maxPerHour = 10,
): Promise<string | null> {
  if (user.isAdmin) return null;
  if (isSubscriptionActive(user)) return null;

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const count = await prisma.aiUsageLog.count({
    where: { userId: user.id, feature, createdAt: { gte: hourAgo } },
  });
  if (count >= maxPerHour) {
    return `You've reached the free AI usage limit (${maxPerHour} per hour). Backstage Pass members get unlimited AI recommendations — or try the manual questionnaire.`;
  }
  return null;
}

export async function logAiUsage(userId: string, feature: string): Promise<void> {
  await prisma.aiUsageLog.create({ data: { userId, feature } }).catch(() => {});
}
