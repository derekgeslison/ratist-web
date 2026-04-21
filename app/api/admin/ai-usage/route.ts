import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthedUser } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

const WINDOWS: Record<string, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

export async function GET(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const windowKey = searchParams.get("window") ?? "7d";
  const featureFilter = searchParams.get("feature");
  const windowMs = WINDOWS[windowKey] ?? WINDOWS["7d"];
  const since = new Date(Date.now() - windowMs);

  const where = featureFilter
    ? { createdAt: { gte: since }, feature: featureFilter }
    : { createdAt: { gte: since } };

  const [totalCalls, byFeature, topUserGroups] = await Promise.all([
    prisma.aiUsageLog.count({ where }),
    prisma.aiUsageLog.groupBy({
      by: ["feature"],
      where: { createdAt: { gte: since } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    }),
    prisma.aiUsageLog.groupBy({
      by: ["userId"],
      where,
      _count: { id: true },
      _max: { createdAt: true },
      orderBy: { _count: { id: "desc" } },
      take: 50,
    }),
  ]);

  const userIds = topUserGroups.map((g) => g.userId);
  const users = userIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: {
          id: true, firebaseUid: true, name: true, email: true, avatarUrl: true,
          isAdmin: true, aiDisabled: true,
          subscriptionTier: true, subscriptionStatus: true, subscriptionExpiry: true,
        },
      })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  // Per-user feature breakdown for the top users
  const perUserFeatureBreakdown = userIds.length > 0
    ? await prisma.aiUsageLog.groupBy({
        by: ["userId", "feature"],
        where: { createdAt: { gte: since }, userId: { in: userIds } },
        _count: { id: true },
      })
    : [];
  const featureBreakdownMap = new Map<string, Record<string, number>>();
  for (const row of perUserFeatureBreakdown) {
    const existing = featureBreakdownMap.get(row.userId) ?? {};
    existing[row.feature] = row._count.id;
    featureBreakdownMap.set(row.userId, existing);
  }

  const topUsers = topUserGroups.map((g) => {
    const u = userMap.get(g.userId);
    const hasPass = u?.subscriptionTier === "backstage_pass" &&
      (u?.subscriptionStatus === "active" || u?.subscriptionStatus === "trialing" || u?.subscriptionStatus === "admin_granted");
    return {
      userId: g.userId,
      name: u?.name ?? "(unknown)",
      firebaseUid: u?.firebaseUid ?? null,
      email: u?.email ?? null,
      avatarUrl: u?.avatarUrl ?? null,
      isAdmin: u?.isAdmin ?? false,
      aiDisabled: u?.aiDisabled ?? false,
      hasPass: !!hasPass,
      subscriptionStatus: u?.subscriptionStatus ?? null,
      totalCalls: g._count.id,
      lastCall: g._max.createdAt?.toISOString() ?? null,
      byFeature: featureBreakdownMap.get(g.userId) ?? {},
    };
  });

  return NextResponse.json({
    window: windowKey,
    feature: featureFilter,
    totalCalls,
    uniqueUsers: topUserGroups.length, // actually top-50 users; fine as a signal
    byFeature: byFeature.map((b) => ({ feature: b.feature, count: b._count.id })),
    topUsers,
  });
}

export async function PATCH(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const targetUserId = typeof body?.userId === "string" ? body.userId : "";
  const aiDisabled = typeof body?.aiDisabled === "boolean" ? body.aiDisabled : null;
  if (!targetUserId || aiDisabled === null) {
    return NextResponse.json({ error: "Missing userId or aiDisabled" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: targetUserId },
    data: { aiDisabled },
    select: { id: true, aiDisabled: true },
  });
  return NextResponse.json({ user: updated });
}
