import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { checkBadges } from "@/lib/badges";

interface Props {
  params: Promise<{ id: string }>;
}

async function getUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  if (!decoded) return null;
  return prisma.user.findUnique({ where: { firebaseUid: decoded.uid }, select: { id: true, firebaseUid: true, name: true } });
}

// GET: check if current user follows target, plus counts
export async function GET(req: NextRequest, { params }: Props) {
  const { id: targetFirebaseUid } = await params;
  const target = await prisma.user.findUnique({ where: { firebaseUid: targetFirebaseUid }, select: { id: true } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const [followerCount, followingCount] = await Promise.all([
    prisma.userFollow.count({ where: { followingId: target.id } }),
    prisma.userFollow.count({ where: { followerId: target.id } }),
  ]);

  const user = await getUser(req);
  let isFollowing = false;
  if (user && user.id !== target.id) {
    const existing = await prisma.userFollow.findUnique({
      where: { followerId_followingId: { followerId: user.id, followingId: target.id } },
    });
    isFollowing = !!existing;
  }

  return NextResponse.json({ isFollowing, followerCount, followingCount });
}

// POST: toggle follow/unfollow
export async function POST(req: NextRequest, { params }: Props) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: targetFirebaseUid } = await params;
  const target = await prisma.user.findUnique({ where: { firebaseUid: targetFirebaseUid }, select: { id: true, firebaseUid: true, name: true } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (target.id === user.id) return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 });

  const existing = await prisma.userFollow.findUnique({
    where: { followerId_followingId: { followerId: user.id, followingId: target.id } },
  });

  if (existing) {
    await prisma.userFollow.delete({ where: { id: existing.id } });
    const followerCount = await prisma.userFollow.count({ where: { followingId: target.id } });
    return NextResponse.json({ following: false, followerCount });
  } else {
    await prisma.userFollow.create({
      data: { followerId: user.id, followingId: target.id },
    });

    // Create notification for the followed user (with cooldown logic)
    try {
      await createFollowNotification(user.id, user.name, target.id);
    } catch { /* don't fail the follow */ }

    const followerCount = await prisma.userFollow.count({ where: { followingId: target.id } });
    checkBadges(user.id, "follow").catch(() => {});
    checkBadges(target.id, "got_followed").catch(() => {});
    return NextResponse.json({ following: true, followerCount });
  }
}

async function createFollowNotification(actorId: string, actorName: string, targetUserId: string) {
  // Check target's notification preferences
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { notificationPrefs: true },
  });
  const prefs = (target?.notificationPrefs ?? {}) as Record<string, boolean>;
  if (prefs.follows === false) return;

  // Check follower count for milestone-based notifications
  const totalFollowers = await prisma.userFollow.count({ where: { followingId: targetUserId } });

  // After 1000 followers, stop individual follow notifications
  if (totalFollowers > 1000) return;

  // After 100 followers, only notify on milestones (every 50)
  if (totalFollowers > 100 && totalFollowers % 50 !== 0) return;

  // After 25 followers, only notify on milestones (every 10)
  if (totalFollowers > 25 && totalFollowers % 10 !== 0) return;

  // Cooldown: don't send if a follow notification was sent in the last hour
  if (totalFollowers <= 25) {
    const recentNotif = await prisma.notification.findFirst({
      where: {
        userId: targetUserId,
        type: "follow",
        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });
    if (recentNotif) return;
  }

  // Create the notification
  const isMilestone = totalFollowers > 25;
  const message = isMilestone
    ? `You now have ${totalFollowers} followers!`
    : `${actorName} started following you`;

  await prisma.notification.create({
    data: {
      userId: targetUserId,
      actorId,
      type: "follow",
      message,
    },
  });
}
