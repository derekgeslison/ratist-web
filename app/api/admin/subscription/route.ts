import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { grantBackstagePass, revokeBackstagePass, getPromoEligibleUsers } from "@/lib/subscription";
import { prisma } from "@/lib/prisma";
import { sendPromoGranted, sendAdminGranted } from "@/lib/email";

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

  // Get all active subscribers for management
  const subscribers = await prisma.user.findMany({
    where: { subscriptionTier: "backstage_pass" },
    select: { id: true, name: true, email: true, subscriptionStatus: true, subscriptionExpiry: true, grantedPromo: true, stripeSubscriptionId: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ eligible, alreadyGranted, totalSubscribers, subscribers });
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

    // Send email notification
    const grantedUser = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
    if (grantedUser?.email) {
      sendAdminGranted(grantedUser.email, grantedUser.name, expiry, userId).catch(() => {});
    }

    return NextResponse.json({ granted: true });
  }

  if (action === "revoke") {
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
    await revokeBackstagePass(userId);
    return NextResponse.json({ revoked: true });
  }

  if (action === "bulk_promo") {
    // Grant 6-month Backstage Pass to eligible users who haven't already been promo'd
    const maxGrants = limit ?? 1000;
    const { eligible } = await getPromoEligibleUsers();
    const toGrant = eligible.slice(0, maxGrants);
    const sixMonths = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);

    let granted = 0;
    for (const u of toGrant) {
      // Double-check they haven't been granted already
      const current = await prisma.user.findUnique({ where: { id: u.id }, select: { grantedPromo: true, email: true, name: true } });
      if (current?.grantedPromo === "first_1000_reviews") continue;

      await grantBackstagePass(u.id, admin.id, sixMonths, "first_1000_reviews");
      granted++;

      // Send email + in-app notification
      if (current?.email) sendPromoGranted(current.email, current.name, 6, u.id).catch(() => {});
      await prisma.notification.create({
        data: {
          userId: u.id,
          type: "admin",
          message: "🎉 You earned 6 months of the Backstage Pass! As one of our dedicated reviewers, enjoy Movie Club, ad-free browsing, and more — free.",
          link: "/backstage-pass",
        },
      }).catch(() => {});
    }

    return NextResponse.json({ granted, total: toGrant.length });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
