import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { grantBackstagePass, revokeBackstagePass, getPromoEligibleUsers } from "@/lib/subscription";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function requireAdmin(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user?.isAdmin) return null;
  return user;
}

/** GET — get promo-eligible users and subscription stats */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { eligible, alreadyGranted } = await getPromoEligibleUsers();
  const totalSubscribers = await prisma.user.count({
    where: { subscriptionTier: "backstage_pass", subscriptionStatus: { in: ["active", "admin_granted"] } },
  });

  return NextResponse.json({ eligible, alreadyGranted, totalSubscribers });
}

/** POST — admin actions: grant, revoke, bulk promo */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { action, userId, expiryDate, limit } = await req.json();

  if (action === "grant") {
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
    const expiry = expiryDate ? new Date(expiryDate) : null;
    await grantBackstagePass(userId, admin.id, expiry);
    return NextResponse.json({ granted: true });
  }

  if (action === "revoke") {
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
    await revokeBackstagePass(userId);
    return NextResponse.json({ revoked: true });
  }

  if (action === "bulk_promo") {
    // Grant 6-month Backstage Pass to eligible users
    const maxGrants = limit ?? 1000;
    const { eligible } = await getPromoEligibleUsers();
    const toGrant = eligible.slice(0, maxGrants);
    const sixMonths = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);

    let granted = 0;
    for (const user of toGrant) {
      await grantBackstagePass(user.id, admin.id, sixMonths, "first_1000_reviews");
      granted++;
    }

    return NextResponse.json({ granted, total: toGrant.length });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
