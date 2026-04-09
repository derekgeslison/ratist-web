import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import {
  getAllBadgeDefs,
  computeTier,
  CATEGORY_ORDER,
  CATEGORY_LABELS,
} from "@/lib/badges";
import { TOTAL_BADGES } from "@/lib/badge-defs";

interface Props {
  params: Promise<{ id: string }>;
}

async function getAuthedUid(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  return decoded?.uid ?? null;
}

// GET: Return user's badges + tier
export async function GET(req: NextRequest, { params }: Props) {
  const { id: targetFirebaseUid } = await params;

  const target = await prisma.user.findFirst({
    where: {
      OR: [{ firebaseUid: targetFirebaseUid }, { id: targetFirebaseUid }],
    },
    select: { id: true, firebaseUid: true, isPrivate: true },
  });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Check privacy
  const authedUid = await getAuthedUid(req);
  const isOwnProfile = authedUid === target.firebaseUid;
  if (target.isPrivate && !isOwnProfile) {
    return NextResponse.json({
      tier: "none",
      earnedCount: 0,
      totalCount: TOTAL_BADGES,
      badges: [],
    });
  }

  // Get earned badges
  const earned = await prisma.userBadge.findMany({
    where: { userId: target.id },
    select: { slug: true, earnedAt: true },
    orderBy: { earnedAt: "desc" },
  });
  const earnedMap = new Map(earned.map((e) => [e.slug, e.earnedAt]));
  const tier = computeTier(earned.length);

  const { searchParams } = new URL(req.url);
  const summary = searchParams.get("summary") === "1";

  if (summary) {
    // Return tier + 5 most recent badges only
    const recentDefs = getAllBadgeDefs();
    const recentBadges = earned.slice(0, 5).map((e) => {
      const def = recentDefs.find((d) => d.slug === e.slug);
      return {
        slug: e.slug,
        name: def?.name ?? e.slug,
        icon: def?.icon ?? "Award",
        category: def?.category ?? "meta",
        earnedAt: e.earnedAt.toISOString(),
      };
    });

    return NextResponse.json({
      tier,
      earnedCount: earned.length,
      totalCount: TOTAL_BADGES,
      badges: recentBadges,
    });
  }

  // Full badge list
  const allDefs = getAllBadgeDefs();
  const badges = allDefs.map((def) => ({
    ...def,
    earned: earnedMap.has(def.slug),
    earnedAt: earnedMap.get(def.slug)?.toISOString() ?? null,
  }));

  return NextResponse.json({
    tier,
    earnedCount: earned.length,
    totalCount: TOTAL_BADGES,
    badges,
    categories: CATEGORY_ORDER.map((key) => ({ key, label: CATEGORY_LABELS[key] })),
  });
}
