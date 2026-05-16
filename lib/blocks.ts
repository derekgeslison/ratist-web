import { prisma } from "@/lib/prisma";

/**
 * Returns the set of user IDs that are mutually blocked with the
 * given user — anyone the user has blocked OR who has blocked them.
 * Used to filter out content/follows/notifications across the site.
 *
 * Returns an empty set when userId is null/undefined so call sites
 * can use this unconditionally for both signed-in and anon traffic
 * without branching.
 */
export async function getMutualBlockedIds(userId: string | null | undefined): Promise<Set<string>> {
  if (!userId) return new Set();
  const blocks = await prisma.userBlock.findMany({
    where: {
      OR: [{ blockerId: userId }, { blockedId: userId }],
    },
    select: { blockerId: true, blockedId: true },
  });
  const ids = new Set<string>();
  for (const b of blocks) {
    if (b.blockerId !== userId) ids.add(b.blockerId);
    if (b.blockedId !== userId) ids.add(b.blockedId);
  }
  return ids;
}

/** True iff either user has blocked the other. */
export async function isMutuallyBlocked(userIdA: string, userIdB: string): Promise<boolean> {
  if (userIdA === userIdB) return false;
  const block = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: userIdA, blockedId: userIdB },
        { blockerId: userIdB, blockedId: userIdA },
      ],
    },
    select: { id: true },
  });
  return !!block;
}

/**
 * Drop items authored by anyone in `blockedIds`. Pure / non-mutating.
 *
 * `getUserId` selects the owner field on each item — different surfaces
 * use different names (userId, authorId, creatorId, submitterId) so the
 * caller passes a small accessor instead of forcing a convention.
 *
 * Returns the original array reference (no allocation) when the
 * blocked set is empty — that's the anon-traffic and no-blocks-set
 * hot path and the most common case.
 */
export function filterOutBlocked<T>(
  items: T[],
  blockedIds: Set<string>,
  getUserId: (item: T) => string | null | undefined,
): T[] {
  if (blockedIds.size === 0) return items;
  return items.filter((item) => {
    const uid = getUserId(item);
    return uid == null || !blockedIds.has(uid);
  });
}
