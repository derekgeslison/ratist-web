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

// Per-feature daily caps for features that are NOT in the shared AI tools
// pool. Keep in sync with the checkAiRateLimit call sites that still pass
// in their own caps. The recommend/movies_search/collection features have
// been pulled out of this map and now share a single pooled budget; see
// AI_TOOLS_POOL + AI_TOOLS_LIMITS below.
export const FEATURE_CAPS: Record<string, AiLimits> = {
  // Admin-only endpoint — admins bypass the limiter before caps are checked,
  // so both caps stay at 0 as defense-in-depth: if requireAdmin is ever
  // removed, non-admins still get hard-blocked at the rate-limit layer.
  movie_map_draft: { freeDaily: 0, paidDaily: 0 },
  // Watch Companion generation is gated weekly (not daily) — see
  // checkWatchCompanionRateLimit. The daily caps here stay at 0 so the
  // shared checker doesn't accidentally let non-admins through.
  watch_companion_generate: { freeDaily: 0, paidDaily: 0 },
};

// Per-feature WEEKLY caps for features whose budget is weekly rather
// than daily. Powers the abuse-monitor "weeks at cap" signal on the
// admin AI-usage page. Keep these in sync with the live limiter
// (checkWatchCompanionRateLimit in app/api/watch-companion/generate).
export interface AiWeeklyLimits {
  freeWeekly: number;
  paidWeekly: number;
}
export const WEEKLY_FEATURE_CAPS: Record<string, AiWeeklyLimits> = {
  watch_companion_generate: { freeWeekly: 2, paidWeekly: 5 },
};

// === Shared AI tools pool ===
// The three user-facing AI tools (movies search, recommendations, AI
// collections) share a single daily budget rather than having per-feature
// caps. Free users only ever reach two of them — collection is gated to
// Backstage Pass — but counting it here is harmless because the subscription
// gate runs before the rate limiter.
export const AI_TOOLS_POOL = ["recommend", "movies_search", "collection"] as const;
export const AI_TOOLS_LIMITS: AiLimits = { freeDaily: 10, paidDaily: 30 };
export type AiToolsFeature = (typeof AI_TOOLS_POOL)[number];

/**
 * Check the shared AI tools daily quota. Used by /api/tools/recommend/ai,
 * /api/movies/ai, and /api/tools/collections/ai — they all consume from
 * the same pool. Returns null if allowed, or a user-friendly error message.
 */
export async function checkAiToolsRateLimit(user: UserForRateLimit): Promise<string | null> {
  if (user.aiDisabled) {
    return "AI features have been disabled for your account. Contact support if you believe this is a mistake.";
  }
  if (user.isAdmin) return null;

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const count = await prisma.aiUsageLog.count({
    where: {
      userId: user.id,
      feature: { in: [...AI_TOOLS_POOL] },
      createdAt: { gte: dayAgo },
    },
  });

  const isPaid = isSubscriptionActive(user);
  const cap = isPaid ? AI_TOOLS_LIMITS.paidDaily : AI_TOOLS_LIMITS.freeDaily;
  if (count >= cap) {
    return isPaid
      ? `You've reached the daily AI tools limit (${cap} per day, shared across AI movie search, recommendations, and collections). This cap resets every 24 hours.`
      : `You've reached the daily AI tools limit (${cap} per day, shared across AI movie search and recommendations). Upgrade to Backstage Pass for a higher cap, or try the manual filters.`;
  }
  return null;
}

/**
 * Weekly rate limit for Watch Companion generation. Admins bypass. Free users
 * get 2/week, Backstage Pass users get 5/week. Cost is only incurred the
 * first time someone generates a companion for a given (tmdbId, mediaType,
 * season) — cached views are free for everyone.
 */
export async function checkWatchCompanionRateLimit(user: UserForRateLimit): Promise<string | null> {
  if (user.aiDisabled) {
    return "AI features have been disabled for your account. Contact support if you believe this is a mistake.";
  }
  if (user.isAdmin) return null;

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const count = await prisma.aiUsageLog.count({
    where: { userId: user.id, feature: "watch_companion_generate", createdAt: { gte: weekAgo } },
  });

  const cap = isSubscriptionActive(user) ? 5 : 2;
  if (count >= cap) {
    return `You've reached the weekly Watch Companion generation limit (${cap} per week). You can still view any companion that's already been generated. ${isSubscriptionActive(user) ? "" : "Upgrade to Backstage Pass for a higher cap."}`.trim();
  }
  return null;
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
