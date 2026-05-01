import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { isSubscriptionActive } from "@/lib/subscription";
import { checkMilestone } from "@/lib/notifications";
import { checkBadges, recheckBadges } from "@/lib/badges";

export const dynamic = "force-dynamic";

// POST: save / bookmark a public collection. Idempotent — re-saving
// returns the current state without double-counting.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin && !isSubscriptionActive(user)) {
    return NextResponse.json({ error: "Saving collections is a Backstage Pass feature." }, { status: 403 });
  }

  const { id } = await params;

  // Validate the collection exists and is public before bookmarking.
  // Drafts/private collections aren't reachable, so saving one is a bug.
  const target = await prisma.customCollection.findUnique({
    where: { id },
    select: {
      visibility: true,
      userId: true,
      name: true,
      slug: true,
      user: { select: { firebaseUid: true } },
    },
  });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (target.visibility !== "public") {
    return NextResponse.json({ error: "Only public collections can be saved." }, { status: 400 });
  }

  // skipDuplicates makes the insert idempotent at the DB level. The returned
  // count tells us whether the saveCount needs to bump.
  const inserted = await prisma.collectionSave.createMany({
    data: [{ userId: user.id, collectionId: id }],
    skipDuplicates: true,
  });

  let newCount: number | null = null;
  if (inserted.count > 0) {
    const updated = await prisma.customCollection.update({
      where: { id },
      data: { saveCount: { increment: 1 } },
      select: { saveCount: true },
    });
    newCount = updated.saveCount;
  }

  // Milestone fires once per threshold crossing (10/25/50/...). The helper
  // is idempotent on its own via the notification cooldown, but only call
  // it when we actually incremented to avoid recomputing the same count.
  if (newCount != null && target.userId !== user.id && target.slug) {
    await checkMilestone({
      contentOwnerId: target.userId,
      actorId: user.id,
      targetType: "collection",
      targetId: id,
      currentCount: newCount,
      countLabel: "saves",
      contentLabel: `Your collection "${target.name}"`,
      link: `/collections/${target.user.firebaseUid}/${target.slug}`,
    });
    // Save thresholds for Curator / Master Curator can be crossed by
    // other users adding to the collection's saveCount.
    checkBadges(target.userId, "collection_save").catch(() => { /* non-critical */ });
  }

  return NextResponse.json({ ok: true, saved: true });
}

// DELETE: unsave. Decrements saveCount only when a row was actually removed.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const removed = await prisma.collectionSave.deleteMany({
    where: { userId: user.id, collectionId: id },
  });
  if (removed.count > 0) {
    const updated = await prisma.customCollection.update({
      where: { id },
      data: { saveCount: { decrement: 1 } },
      select: { userId: true },
    });
    // Total-save thresholds may have just dropped below the cutoff for
    // the curator's non-permanent badges.
    recheckBadges(updated.userId, "collection_save").catch(() => { /* non-critical */ });
  }

  return NextResponse.json({ ok: true, saved: false });
}
