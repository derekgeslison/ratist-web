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

export interface AiLimits {
  // Free (logged-in) daily cap. Not-logged-in users are rejected upstream.
  freeDaily: number;
  // Backstage Pass daily cap. Prevents runaway cost for a paid holder.
  paidDaily: number;
}

/**
 * Check AI usage caps. Order of checks:
 *   1. Admin-set aiDisabled flag → always blocked.
 *   2. Admin user → unlimited.
 *   3. Backstage Pass holder → paidDaily per feature.
 *   4. Free user → freeDaily per feature.
 *
 * Returns null if allowed, or a user-friendly error message.
 */
export async function checkAiRateLimit(
  user: UserForRateLimit,
  feature: string,
  limits: AiLimits,
): Promise<string | null> {
  if (user.aiDisabled) {
    return "AI features have been disabled for your account. Contact support if you believe this is a mistake.";
  }
  if (user.isAdmin) return null;

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const count = await prisma.aiUsageLog.count({
    where: { userId: user.id, feature, createdAt: { gte: dayAgo } },
  });

  if (isSubscriptionActive(user)) {
    if (count >= limits.paidDaily) {
      return `You've reached the daily AI usage limit (${limits.paidDaily} per day). This cap resets every 24 hours.`;
    }
    return null;
  }

  if (count >= limits.freeDaily) {
    return `You've reached the daily AI limit (${limits.freeDaily} per day). Upgrade to Backstage Pass for a higher cap, or try the manual filters.`;
  }
  return null;
}

export async function logAiUsage(userId: string, feature: string): Promise<void> {
  await prisma.aiUsageLog.create({ data: { userId, feature } }).catch(() => {});
}
