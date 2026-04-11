import { prisma } from "./prisma";

/**
 * Check if a user has an active Backstage Pass subscription.
 * Returns true for:
 * - Active Stripe subscriptions
 * - Admin-granted subscriptions (with optional expiry)
 * - Promo grants within their validity period
 */
export async function hasBackstagePass(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionTier: true, subscriptionStatus: true, subscriptionExpiry: true },
  });
  if (!user) return false;
  return isSubscriptionActive(user);
}

export function isSubscriptionActive(user: {
  subscriptionTier: string | null;
  subscriptionStatus: string | null;
  subscriptionExpiry: Date | null;
}): boolean {
  if (user.subscriptionTier !== "backstage_pass") return false;

  // Check status
  const status = user.subscriptionStatus;
  if (status === "active" || status === "admin_granted") {
    // Check expiry if set
    if (user.subscriptionExpiry) {
      return new Date(user.subscriptionExpiry) > new Date();
    }
    return true; // No expiry = forever (or until Stripe cancels)
  }

  return false;
}

/**
 * Admin grant a Backstage Pass subscription to a user.
 */
export async function grantBackstagePass(
  userId: string,
  adminId: string,
  expiryDate?: Date | null,
  promo?: string
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionTier: "backstage_pass",
      subscriptionStatus: "admin_granted",
      subscriptionExpiry: expiryDate ?? null,
      grantedBy: adminId,
      grantedPromo: promo ?? null,
    },
  });
}

/**
 * Revoke an admin-granted subscription.
 */
export async function revokeBackstagePass(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      subscriptionTier: null,
      subscriptionStatus: null,
      subscriptionExpiry: null,
      grantedBy: null,
      grantedPromo: null,
    },
  });
}

/**
 * Get count of users eligible for the "first 1000 reviewers" promo.
 * Users must have 10+ standard (non-basic) reviews and NOT already have a subscription.
 */
export async function getPromoEligibleUsers(): Promise<{
  eligible: { id: string; name: string; email: string; reviewCount: number }[];
  alreadyGranted: number;
}> {
  // Count actual Ratist reviews per user (plot not null proves form was filled, not imported)
  const reviewCounts = await prisma.movieRating.groupBy({
    by: ["userId"],
    where: { ratistRating: { not: null }, plot: { not: null } },
    _count: { id: true },
    having: { id: { _count: { gte: 10 } } },
  });

  const qualifiedUserIds = reviewCounts.map((r) => r.userId);

  // Get user details, exclude those already subscribed or promo'd
  const users = await prisma.user.findMany({
    where: {
      id: { in: qualifiedUserIds },
      OR: [
        { subscriptionTier: null },
        { grantedPromo: null },
      ],
    },
    select: { id: true, name: true, email: true },
  });

  const alreadyGranted = await prisma.user.count({
    where: { grantedPromo: "first_1000_reviews" },
  });

  // Merge review counts
  const countMap = new Map(reviewCounts.map((r) => [r.userId, r._count.id]));
  const eligible = users.map((u) => ({
    ...u,
    reviewCount: countMap.get(u.id) ?? 0,
  })).sort((a, b) => b.reviewCount - a.reviewCount);

  return { eligible, alreadyGranted };
}
