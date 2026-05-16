import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { checkBadges, recheckBadges } from "@/lib/badges";
import { isMutuallyBlocked } from "@/lib/blocks";
import { checkCommunityRateLimit } from "@/lib/rate-limit";

interface Props {
  params: Promise<{ id: string }>;
}

async function getUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  if (!decoded) return null;
  return prisma.user.findUnique({ where: { firebaseUid: decoded.uid }, select: { id: true, firebaseUid: true, name: true, isAdmin: true } });
}

// GET: check current user's follow state with target, plus counts.
// Counts only include accepted follows so a private user with five
// pending requests still reads as "0 followers" until they approve.
export async function GET(req: NextRequest, { params }: Props) {
  const { id: targetFirebaseUid } = await params;
  const target = await prisma.user.findUnique({ where: { firebaseUid: targetFirebaseUid }, select: { id: true } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const [followerCount, followingCount] = await Promise.all([
    prisma.userFollow.count({ where: { followingId: target.id, status: "accepted" } }),
    prisma.userFollow.count({ where: { followerId: target.id, status: "accepted" } }),
  ]);

  const user = await getUser(req);
  let followStatus: "none" | "pending" | "accepted" | "blocked" = "none";
  let blockedByMe = false;
  // isFollowingMe describes the REVERSE direction: does the target
  // currently follow the viewer (status accepted)? Drives whether
  // the profile-page menu offers a Remove follower option, since
  // that only makes sense if they're actually a follower.
  let isFollowingMe = false;
  if (user && user.id !== target.id) {
    if (await isMutuallyBlocked(user.id, target.id)) {
      followStatus = "blocked";
      // Only flag blockedByMe so the UI can offer Unblock — we don't
      // expose whether the OTHER party blocked us.
      const myBlock = await prisma.userBlock.findUnique({
        where: { blockerId_blockedId: { blockerId: user.id, blockedId: target.id } },
        select: { id: true },
      });
      blockedByMe = !!myBlock;
    } else {
      const [existing, reverse] = await Promise.all([
        prisma.userFollow.findUnique({
          where: { followerId_followingId: { followerId: user.id, followingId: target.id } },
        }),
        prisma.userFollow.findUnique({
          where: { followerId_followingId: { followerId: target.id, followingId: user.id } },
        }),
      ]);
      if (existing) followStatus = existing.status === "pending" ? "pending" : "accepted";
      isFollowingMe = !!reverse && reverse.status === "accepted";
    }
  }

  return NextResponse.json({
    followStatus,
    blockedByMe,
    isFollowingMe,
    // Legacy field for any client still reading isFollowing.
    isFollowing: followStatus === "accepted",
    followerCount,
    followingCount,
  });
}

// POST: toggle follow / cancel-request / unfollow.
//
// New behavior:
//   - Public target → create row with status "accepted" (immediate).
//   - Private target → create with status "pending"; the target sees
//     it in their requests inbox and accepts/declines from there.
//   - Existing row → delete (covers both unfollow AND cancel-pending).
export async function POST(req: NextRequest, { params }: Props) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: targetFirebaseUid } = await params;
  const target = await prisma.user.findUnique({
    where: { firebaseUid: targetFirebaseUid },
    select: { id: true, firebaseUid: true, name: true, isPrivate: true },
  });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (target.id === user.id) return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 });

  // Block enforcement: a block in either direction prevents new
  // follows from being created. The follow row itself was already
  // deleted at block-time, so this is just the "don't let them
  // re-follow" guard.
  if (await isMutuallyBlocked(user.id, target.id)) {
    return NextResponse.json({ error: "Blocked" }, { status: 403 });
  }

  const existing = await prisma.userFollow.findUnique({
    where: { followerId_followingId: { followerId: user.id, followingId: target.id } },
  });

  if (existing) {
    await prisma.userFollow.delete({ where: { id: existing.id } });
    recheckBadges(target.id, "got_followed").catch(() => {});
    const followerCount = await prisma.userFollow.count({ where: { followingId: target.id, status: "accepted" } });
    return NextResponse.json({ followStatus: "none", following: false, followerCount });
  } else {
    // Anti-abuse: cap follow creations/day. Mass-follow campaigns
    // (and the subsequent flood of notification emails to followed
    // users) are the single biggest spam vector this endpoint has.
    // Unfollowing isn't capped — the delete branch above runs first.
    const rateLimitError = await checkCommunityRateLimit(user.id, user.isAdmin, "follow");
    if (rateLimitError) return NextResponse.json({ error: rateLimitError }, { status: 429 });

    const status = target.isPrivate ? "pending" : "accepted";
    await prisma.userFollow.create({
      data: { followerId: user.id, followingId: target.id, status },
    });

    try {
      if (status === "accepted") {
        await createFollowNotification(user.id, user.name, target.id);
      } else {
        await createFollowRequestNotification(user.id, user.name, target.id);
      }
    } catch { /* don't fail the follow */ }

    const followerCount = await prisma.userFollow.count({ where: { followingId: target.id, status: "accepted" } });
    if (status === "accepted") {
      checkBadges(user.id, "follow").catch(() => {});
      checkBadges(target.id, "got_followed").catch(() => {});
    }
    return NextResponse.json({ followStatus: status, following: status === "accepted", followerCount });
  }
}

async function createFollowRequestNotification(actorId: string, actorName: string, targetUserId: string) {
  // Light cooldown (5 min) — prevents notification spam if a user
  // taps follow/unfollow repeatedly, but doesn't suppress legitimate
  // re-requests after a previous one was declined or accepted.
  // Block remains the escape hatch for genuine abuse.
  const recent = await prisma.notification.findFirst({
    where: {
      userId: targetUserId,
      actorId,
      type: "follow_request",
      createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
    },
  });
  if (recent) return;
  await prisma.notification.create({
    data: {
      userId: targetUserId,
      actorId,
      type: "follow_request",
      message: `${actorName} requested to follow you`,
      link: "/connections?tab=requests",
    },
  });
}

async function createFollowNotification(actorId: string, actorName: string, targetUserId: string) {
  // Resolve actor's firebaseUid so the notification can deep-link
  // to their profile when tapped. Milestone notifications skip the
  // link — there's no single profile to navigate to.
  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: { firebaseUid: true },
  });
  // Check target's notification preferences
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { notificationPrefs: true },
  });
  const prefs = (target?.notificationPrefs ?? {}) as Record<string, boolean>;
  if (prefs.follows === false) return;

  // Check follower count for milestone-based notifications
  const totalFollowers = await prisma.userFollow.count({ where: { followingId: targetUserId, status: "accepted" } });

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
      // Milestone notifications ("you have 50 followers") have no
      // single destination — tapping them just clears them. Single-
      // follower notifications link to that follower's profile.
      link: isMilestone ? null : (actor ? `/profile/${actor.firebaseUid}` : null),
    },
  });
}
