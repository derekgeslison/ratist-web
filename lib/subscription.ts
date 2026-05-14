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

/**
 * Prisma where clause matching users with a currently-active Backstage
 * Pass. Use this when filtering counts / lists that should reflect
 * present-tense subscribers (e.g., the Movie Club member count) — we
 * keep MovieClubMember rows past expiry so re-subscribers don't have
 * to rejoin, but the surfaces that publish "X members" or render a
 * "member" badge should hide lapsed users.
 */
export function activeBackstageUserWhere(now: Date = new Date()) {
  return {
    subscriptionTier: "backstage_pass",
    subscriptionStatus: { in: ["active", "trialing", "admin_granted"] },
    OR: [{ subscriptionExpiry: null }, { subscriptionExpiry: { gte: now } }],
  };
}

export function isSubscriptionActive(user: {
  subscriptionTier: string | null;
  subscriptionStatus: string | null;
  subscriptionExpiry: Date | null;
}): boolean {
  if (user.subscriptionTier !== "backstage_pass") return false;

  // Check status
  const status = user.subscriptionStatus;
  if (status === "active" || status === "trialing" || status === "admin_granted") {
    // Check expiry if set (admin_granted uses this; Stripe manages its own trial/period end)
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
 *
 * Eligibility criteria:
 *   1. 10+ Ratist reviews across MOVIES + TV SERIES (series scope only,
 *      not per-season). "Ratist review" = the user actually filled out
 *      the rubric — proven by `plot != null`, the long-form summary field
 *      that's only available in the full form (not basic/quick/import).
 *      Previously this only counted movie reviews and silently excluded
 *      users who spent their effort on TV.
 *   2. No admin-granted Backstage Pass already.
 *   3. No open fraud flag — the admin's scan_thin / scan_duplicates /
 *      scan_bombing flags catch users gaming the promo with all-extreme
 *      ratings or sock-puppet clusters. Anyone with an open flag waits
 *      until the admin reviews it (dismisses for false-positive → they
 *      become eligible again; excludes → they stay disqualified).
 */
export async function getPromoEligibleUsers(): Promise<{
  eligible: { id: string; name: string; email: string; reviewCount: number }[];
  alreadyGranted: number;
}> {
  // Count Ratist reviews per user across BOTH transports. plot != null
  // is the rubric-filled signal; excluded != true keeps ratings that
  // admin has already invalidated from inflating the count.
  const [movieCounts, tvCounts] = await Promise.all([
    prisma.movieRating.groupBy({
      by: ["userId"],
      where: { ratistRating: { not: null }, plot: { not: null }, excluded: false },
      _count: { id: true },
    }),
    prisma.tVShowRating.groupBy({
      by: ["userId"],
      where: { ratingScope: "series", ratistRating: { not: null }, plot: { not: null }, excluded: false },
      _count: { id: true },
    }),
  ]);

  // Combine per-user counts.
  const combined = new Map<string, number>();
  for (const r of movieCounts) combined.set(r.userId, r._count.id);
  for (const r of tvCounts) combined.set(r.userId, (combined.get(r.userId) ?? 0) + r._count.id);
  const qualifiedUserIds = [...combined.entries()]
    .filter(([, n]) => n >= 10)
    .map(([id]) => id);

  if (qualifiedUserIds.length === 0) {
    const alreadyGranted = await prisma.user.count({
      where: { grantedPromo: "first_1000_reviews" },
    });
    return { eligible: [], alreadyGranted };
  }

  // Filter out users with an open fraud flag. We check any open flag
  // type — thin_account (all-extreme ratings), duplicate_cluster
  // (sock puppets), review_bomb (coordinated attacks). Any of those
  // gates the user out of the promo until the admin reviews.
  const flaggedUserIds = new Set<string>();
  const openFlags = await prisma.fraudFlag.findMany({
    where: { status: "open" },
    select: { userIds: true },
  });
  for (const f of openFlags) {
    for (const uid of f.userIds as string[]) flaggedUserIds.add(uid);
  }

  // Get user details, exclude anyone with an admin-granted backstage pass
  // OR an open fraud flag.
  const users = await prisma.user.findMany({
    where: {
      id: { in: qualifiedUserIds.filter((id) => !flaggedUserIds.has(id)) },
      NOT: { subscriptionStatus: "admin_granted" },
    },
    select: { id: true, name: true, email: true },
  });

  const alreadyGranted = await prisma.user.count({
    where: { grantedPromo: "first_1000_reviews" },
  });

  const eligible = users.map((u) => ({
    ...u,
    reviewCount: combined.get(u.id) ?? 0,
  })).sort((a, b) => b.reviewCount - a.reviewCount);

  return { eligible, alreadyGranted };
}
