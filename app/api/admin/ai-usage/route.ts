import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthedUser } from "@/lib/auth-helpers";
import { isSubscriptionActive } from "@/lib/subscription";
import { FEATURE_CAPS, WEEKLY_FEATURE_CAPS } from "@/lib/ai/rate-limit";
import { estimateCallCost, estimateTotalCost } from "@/lib/ai/cost-estimates";

/** ISO-week key (YYYY-Www) so a daily log entry maps deterministically
 *  to a 7-day bucket. Used by the weekly-cap abuse heuristic for
 *  watch_companion_generate. */
function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // Shift to nearest Thursday so week 1 is the one containing Jan 4.
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

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

  // Compute per-user "days at cap" per feature. A day-at-cap = calendar day
  // (UTC) where the user made >= their daily cap of calls for that feature.
  // Caps vary by plan, so we resolve plan per user before counting.
  const rawLogs = userIds.length > 0
    ? await prisma.aiUsageLog.findMany({
        where: { userId: { in: userIds }, createdAt: { gte: since } },
        select: { userId: true, feature: true, createdAt: true },
      })
    : [];
  // (userId, feature, yyyy-mm-dd) → count
  const dailyCounts = new Map<string, number>();
  for (const row of rawLogs) {
    const day = row.createdAt.toISOString().slice(0, 10);
    const key = `${row.userId}\u0001${row.feature}\u0001${day}`;
    dailyCounts.set(key, (dailyCounts.get(key) ?? 0) + 1);
  }
  const daysAtCapByUser = new Map<string, Record<string, number>>();
  for (const [key, count] of dailyCounts) {
    const [uid, feature, _day] = key.split("\u0001");
    void _day;
    const caps = FEATURE_CAPS[feature];
    if (!caps) continue;
    const u = userMap.get(uid);
    const isPaid = u ? isSubscriptionActive(u) : false;
    const cap = isPaid ? caps.paidDaily : caps.freeDaily;
    if (cap === 0) continue; // feature blocked for this plan; no "at cap" concept
    if (count >= cap) {
      const existing = daysAtCapByUser.get(uid) ?? {};
      existing[feature] = (existing[feature] ?? 0) + 1;
      daysAtCapByUser.set(uid, existing);
    }
  }

  // Weekly cap-hit tracking — mirrors the daily logic above but
  // bucketed into ISO weeks for features whose budget is weekly
  // (currently just watch_companion_generate). Feeds the admin
  // page's "sustained heavy companion use" abuse flag.
  const weeklyCounts = new Map<string, number>();
  for (const row of rawLogs) {
    if (!WEEKLY_FEATURE_CAPS[row.feature]) continue;
    const week = isoWeekKey(row.createdAt);
    const key = `${row.userId}${row.feature}${week}`;
    weeklyCounts.set(key, (weeklyCounts.get(key) ?? 0) + 1);
  }
  const weeksAtCapByUser = new Map<string, Record<string, number>>();
  for (const [key, count] of weeklyCounts) {
    const [uid, feature] = key.split("");
    const caps = WEEKLY_FEATURE_CAPS[feature];
    if (!caps) continue;
    const u = userMap.get(uid);
    const isPaid = u ? isSubscriptionActive(u) : false;
    const cap = isPaid ? caps.paidWeekly : caps.freeWeekly;
    if (cap === 0) continue;
    if (count >= cap) {
      const existing = weeksAtCapByUser.get(uid) ?? {};
      existing[feature] = (existing[feature] ?? 0) + 1;
      weeksAtCapByUser.set(uid, existing);
    }
  }

  const topUsers = topUserGroups.map((g) => {
    const u = userMap.get(g.userId);
    const hasPass = u?.subscriptionTier === "backstage_pass" &&
      (u?.subscriptionStatus === "active" || u?.subscriptionStatus === "trialing" || u?.subscriptionStatus === "admin_granted");
    const byFeature = featureBreakdownMap.get(g.userId) ?? {};
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
      byFeature,
      daysAtCap: daysAtCapByUser.get(g.userId) ?? {},
      weeksAtCap: weeksAtCapByUser.get(g.userId) ?? {},
      // Estimated USD spend for this user across the window. Approximate —
      // per-feature averages, not invoiced amounts. See lib/ai/cost-estimates.ts.
      estimatedCost: estimateTotalCost(byFeature),
    };
  });

  return NextResponse.json({
    window: windowKey,
    feature: featureFilter,
    totalCalls,
    uniqueUsers: topUserGroups.length, // actually top-50 users; fine as a signal
    byFeature: byFeature.map((b) => ({
      feature: b.feature,
      count: b._count.id,
      estimatedCost: estimateCallCost(b.feature) * b._count.id,
    })),
    estimatedTotalCost: byFeature.reduce(
      (sum, b) => sum + estimateCallCost(b.feature) * b._count.id,
      0,
    ),
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
