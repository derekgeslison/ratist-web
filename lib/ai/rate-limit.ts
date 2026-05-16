import { prisma } from "@/lib/prisma";
import { isSubscriptionActive } from "@/lib/subscription";
import type { Prisma } from "@prisma/client";

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

// Sentinel error type that the atomic limiters throw when the cap is
// hit inside a transaction. Callers catch it to translate to a 429.
export class RateLimitError extends Error {
  constructor(public userMessage: string) { super(userMessage); }
}

// ─── Atomic check-AND-log limiters ────────────────────────────────────────
//
// These wrap the count check + the usage log in a single serializable
// transaction. Two parallel requests can't both pass the cap check —
// the second one's count read sees the first one's pending insert.
//
// Logging happens at the START of the request rather than the END so a
// user who closes their tab mid-Anthropic-call still has their quota
// consumed. Previously, end-of-route logging let users cancel a
// $0.50 Watch Companion gen and re-submit indefinitely without ever
// counting against the cap — cost amplification attack.
//
// Hard errors (Anthropic 5xx, timeouts, etc.) can call refundAiUsage()
// to give the quota back. User cancellations / 4xx errors keep the
// log row — that's the intended behavior.

/**
 * Atomic check + log for the shared AI tools pool (recommend, movies_search,
 * collection). Call at the start of the route, before invoking Anthropic.
 *
 * Returns the inserted AiUsageLog row's ID on success — pass it to
 * `refundAiUsage()` if the route subsequently hits a transient Anthropic
 * error. Throws RateLimitError when over cap; caller should map to 429.
 */
export async function checkAndLogAiToolsRateLimit(
  user: UserForRateLimit,
  feature: typeof AI_TOOLS_POOL[number],
): Promise<{ logId: string | null }> {
  if (user.aiDisabled) {
    throw new RateLimitError("AI features have been disabled for your account. Contact support if you believe this is a mistake.");
  }
  if (user.isAdmin) return { logId: null };

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const isPaid = isSubscriptionActive(user);
  const cap = isPaid ? AI_TOOLS_LIMITS.paidDaily : AI_TOOLS_LIMITS.freeDaily;

  return prisma.$transaction(async (tx) => {
    const count = await tx.aiUsageLog.count({
      where: { userId: user.id, feature: { in: [...AI_TOOLS_POOL] }, createdAt: { gte: dayAgo } },
    });
    if (count >= cap) {
      throw new RateLimitError(
        isPaid
          ? `You've reached the daily AI tools limit (${cap} per day, shared across AI movie search, recommendations, and collections). This cap resets every 24 hours.`
          : `You've reached the daily AI tools limit (${cap} per day, shared across AI movie search and recommendations). Upgrade to Backstage Pass for a higher cap, or try the manual filters.`,
      );
    }
    const log = await tx.aiUsageLog.create({ data: { userId: user.id, feature }, select: { id: true } });
    return { logId: log.id };
  }, { isolationLevel: "Serializable" as Prisma.TransactionIsolationLevel });
}

/**
 * Atomic check + log for Watch Companion generation. Weekly cap (2 free,
 * 5 paid). Same start-of-route logging contract as the AI tools pool.
 */
export async function checkAndLogWatchCompanionRateLimit(
  user: UserForRateLimit,
): Promise<{ logId: string | null }> {
  if (user.aiDisabled) {
    throw new RateLimitError("AI features have been disabled for your account. Contact support if you believe this is a mistake.");
  }
  if (user.isAdmin) return { logId: null };

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const isPaid = isSubscriptionActive(user);
  const cap = isPaid ? 5 : 2;

  return prisma.$transaction(async (tx) => {
    const count = await tx.aiUsageLog.count({
      where: { userId: user.id, feature: "watch_companion_generate", createdAt: { gte: weekAgo } },
    });
    if (count >= cap) {
      throw new RateLimitError(
        `You've reached the weekly Watch Companion generation limit (${cap} per week). You can still view any companion that's already been generated. ${isPaid ? "" : "Upgrade to Backstage Pass for a higher cap."}`.trim(),
      );
    }
    const log = await tx.aiUsageLog.create({ data: { userId: user.id, feature: "watch_companion_generate" }, select: { id: true } });
    return { logId: log.id };
  }, { isolationLevel: "Serializable" as Prisma.TransactionIsolationLevel });
}

/**
 * Generic per-feature atomic check + log. Used by features that have
 * their own caps in FEATURE_CAPS (currently movie_map_draft —
 * admin-only, so this path rarely fires).
 */
export async function checkAndLogAiRateLimit(
  user: UserForRateLimit,
  feature: string,
  limits: AiLimits,
): Promise<{ logId: string | null }> {
  if (user.aiDisabled) {
    throw new RateLimitError("AI features have been disabled for your account. Contact support if you believe this is a mistake.");
  }
  if (user.isAdmin) return { logId: null };

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const isPaid = isSubscriptionActive(user);
  const cap = isPaid ? limits.paidDaily : limits.freeDaily;

  return prisma.$transaction(async (tx) => {
    const count = await tx.aiUsageLog.count({
      where: { userId: user.id, feature, createdAt: { gte: dayAgo } },
    });
    if (count >= cap) {
      throw new RateLimitError(
        isPaid
          ? `You've reached the daily AI usage limit (${cap} per day). This cap resets every 24 hours.`
          : `You've reached the daily AI limit (${cap} per day). Upgrade to Backstage Pass for a higher cap, or try the manual filters.`,
      );
    }
    const log = await tx.aiUsageLog.create({ data: { userId: user.id, feature }, select: { id: true } });
    return { logId: log.id };
  }, { isolationLevel: "Serializable" as Prisma.TransactionIsolationLevel });
}

/**
 * Refund a previously-logged usage row when the AI call fails with a
 * transient error (Anthropic 5xx, 429, timeout). The user gets their
 * quota back. NO-op if logId is null (admin call) or the row was
 * already deleted by a parallel refund.
 *
 * Do NOT refund on user cancellation or on `stop_reason: max_tokens`
 * — those represent successful but partial responses where cost was
 * actually incurred.
 */
export async function refundAiUsage(logId: string | null): Promise<void> {
  if (!logId) return;
  try {
    await prisma.aiUsageLog.delete({ where: { id: logId } });
  } catch { /* already gone, or never existed — silent no-op */ }
}

// ─── Deprecated non-atomic limiters (kept for unmigrated callers) ─────────
//
// These do count → check → log non-atomically. Two parallel requests can
// both pass and both proceed. Migrate call sites to the checkAndLog*
// variants above and remove these once nothing imports them.

/**
 * @deprecated Use checkAndLogAiToolsRateLimit (logs atomically at start
 * of route). Returns null if allowed, error message if blocked.
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

/** @deprecated Use checkAndLogWatchCompanionRateLimit. */
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

/** @deprecated Use checkAndLogAiRateLimit. */
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

/** @deprecated Use checkAndLog* — they log atomically. */
export async function logAiUsage(userId: string, feature: string): Promise<void> {
  await prisma.aiUsageLog.create({ data: { userId, feature } }).catch(() => {});
}
