// Batch critic-status helper for filtering community-feature lists.
//
// "Critic" = active Backstage Pass holder with 250+ full Ratist reviews
// (movie + TV combined, where the rubric was actually filled out — we
// gate on `plot` being set since quick ratings and imports leave it null).
// Single-user version lives in `lib/watch-companion-trust.ts` for the
// suggestion-voting weight system; this batched version is for list pages.

import { prisma } from "@/lib/prisma";
import { isSubscriptionActive } from "@/lib/subscription";
import { CRITIC_RATING_THRESHOLD } from "@/lib/watch-companion-trust";

export async function getCriticUserIds(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();

  const unique = Array.from(new Set(userIds));

  const subscribers = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, subscriptionTier: true, subscriptionStatus: true, subscriptionExpiry: true },
  });
  const eligible = subscribers.filter(isSubscriptionActive).map((u) => u.id);
  if (eligible.length === 0) return new Set();

  const [movieGroups, tvGroups] = await Promise.all([
    prisma.movieRating.groupBy({
      by: ["userId"],
      where: { userId: { in: eligible }, plot: { not: null } },
      _count: { _all: true },
    }),
    prisma.tVShowRating.groupBy({
      by: ["userId"],
      where: { userId: { in: eligible }, plot: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const totals = new Map<string, number>();
  for (const g of movieGroups) totals.set(g.userId, (totals.get(g.userId) ?? 0) + g._count._all);
  for (const g of tvGroups) totals.set(g.userId, (totals.get(g.userId) ?? 0) + g._count._all);

  const result = new Set<string>();
  for (const [uid, count] of totals.entries()) {
    if (count >= CRITIC_RATING_THRESHOLD) result.add(uid);
  }
  return result;
}
