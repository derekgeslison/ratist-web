import { prisma } from "@/lib/prisma";
import { isSubscriptionActive } from "@/lib/subscription";

interface UserForRateLimit {
  id: string;
  isAdmin: boolean;
  aiDisabled: boolean;
  subscriptionTier: string | null;
  subscriptionStatus: string | null;
  subscriptionExpiry: Date | null;
}

// Safety net even for paid users — prevents a Backstage Pass holder from
// running thousands of AI calls a day and costing more than their subscription.
const PAID_DAILY_CAP = 50;

/**
 * Check AI usage caps. Order of checks:
 *   1. Admin-set aiDisabled flag → always blocked.
 *   2. Admin user → unlimited.
 *   3. Backstage Pass holder → daily cap of PAID_DAILY_CAP per feature.
 *   4. Free user → `maxPerHour` per feature (default 10).
 *
 * Returns null if allowed, or a user-friendly error message string.
 */
export async function checkAiRateLimit(
  user: UserForRateLimit,
  feature: string,
  maxPerHour = 10,
): Promise<string | null> {
  if (user.aiDisabled) {
    return "AI features have been disabled for your account. Contact support if you believe this is a mistake.";
  }
  if (user.isAdmin) return null;

  if (isSubscriptionActive(user)) {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const count = await prisma.aiUsageLog.count({
      where: { userId: user.id, feature, createdAt: { gte: dayAgo } },
    });
    if (count >= PAID_DAILY_CAP) {
      return `You've reached the daily AI usage limit (${PAID_DAILY_CAP} per day). This cap resets every 24 hours.`;
    }
    return null;
  }

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
