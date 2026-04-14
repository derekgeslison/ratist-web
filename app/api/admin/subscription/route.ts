import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { grantBackstagePass, revokeBackstagePass, getPromoEligibleUsers } from "@/lib/subscription";
import { prisma } from "@/lib/prisma";
import { sendPromoGranted, sendAdminGranted, sendEmail } from "@/lib/email";

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

  // Raffle stats — exclude admin-granted users from all counts
  const adminGrantedIds = (await prisma.user.findMany({
    where: { subscriptionStatus: "admin_granted" },
    select: { id: true },
  })).map((u) => u.id);
  const excludeAdmin = adminGrantedIds.length > 0 ? { userId: { notIn: adminGrantedIds } } : {};

  // Condition 1: how many users have 10+ reviews (excluding admin-granted)
  const tenPlusReviewers = await prisma.movieRating.groupBy({
    by: ["userId"],
    where: { ratistRating: { not: null }, plot: { not: null }, ...excludeAdmin },
    _count: { id: true },
    having: { id: { _count: { gte: 10 } } },
  });
  const usersWithTenPlus = tenPlusReviewers.length;

  // Condition 2: users with 100+ Ratist ratings (excluding admin-granted)
  const raffleCounts = await prisma.movieRating.groupBy({
    by: ["userId"],
    where: { ratistRating: { not: null }, plot: { not: null }, ...excludeAdmin },
    _count: { id: true },
    having: { id: { _count: { gte: 100 } } },
  });
  const raffleUserIds = raffleCounts.map((r) => r.userId);
  const raffleEligible = raffleUserIds.length > 0 ? await prisma.user.findMany({
    where: { id: { in: raffleUserIds }, grantedPromo: { not: "100_reviews_raffle" } },
    select: { id: true, name: true, email: true },
  }) : [];
  const raffleEligibleWithCounts = raffleEligible.map((u) => ({
    ...u,
    reviewCount: raffleCounts.find((r) => r.userId === u.id)?._count.id ?? 0,
  }));
  const raffleWinners = await prisma.user.count({ where: { grantedPromo: "100_reviews_raffle" } });

  const raffleConditionsMet = usersWithTenPlus >= 1000 && raffleCounts.length >= 10;
  return NextResponse.json({ eligible, alreadyGranted, totalSubscribers, subscribers, raffleEligible: raffleEligibleWithCounts, raffleWinners, usersWithTenPlus, usersWithHundredPlus: raffleCounts.length, raffleConditionsMet });
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

  if (action === "raffle_draw") {
    // Draw random winners from users with 100+ Ratist ratings who haven't won yet
    const drawCount = Math.min(limit ?? 10, 10);

    // Condition 1: at least 1,000 users must have 10+ Ratist reviews
    const tenPlusCounts = await prisma.movieRating.groupBy({
      by: ["userId"],
      where: { ratistRating: { not: null }, plot: { not: null } },
      _count: { id: true },
      having: { id: { _count: { gte: 10 } } },
    });
    if (tenPlusCounts.length < 1000) {
      return NextResponse.json({
        error: `Raffle requires 1,000 users with 10+ reviews. Currently ${tenPlusCounts.length}/1,000.`,
      }, { status: 400 });
    }

    // Condition 2: at least 10 users must have 100+ Ratist reviews
    const counts = await prisma.movieRating.groupBy({
      by: ["userId"],
      where: { ratistRating: { not: null }, plot: { not: null } },
      _count: { id: true },
      having: { id: { _count: { gte: 100 } } },
    });
    if (counts.length < 10) {
      return NextResponse.json({
        error: `Raffle requires 10+ users with 100+ reviews. Currently ${counts.length}/10.`,
      }, { status: 400 });
    }

    const qualifiedIds = counts.map((r) => r.userId);

    const eligible = await prisma.user.findMany({
      where: { id: { in: qualifiedIds }, grantedPromo: { not: "100_reviews_raffle" }, NOT: { subscriptionStatus: "admin_granted" } },
      select: { id: true, name: true, email: true },
    });
    if (eligible.length === 0) return NextResponse.json({ error: "All eligible users have already won" }, { status: 400 });

    // Shuffle and pick winners
    const shuffled = eligible.sort(() => Math.random() - 0.5);
    const winners = shuffled.slice(0, drawCount);

    let granted = 0;
    const winnerNames: string[] = [];
    for (const w of winners) {
      await grantBackstagePass(w.id, admin.id, null, "100_reviews_raffle"); // null expiry = lifetime
      granted++;
      winnerNames.push(w.name);

      // Send email
      if (w.email) {
        sendEmail({
          to: w.email,
          subject: "You won a lifetime Backstage Pass!",
          html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
            <div style="max-width:600px;margin:0 auto;padding:32px 16px;">
              <div style="text-align:center;margin-bottom:24px;"><a href="https://www.theratist.com" style="color:#e63946;text-decoration:none;font-weight:800;font-size:18px;">THE RATIST</a></div>
              <div style="background:#111;border-radius:12px;border:1px solid #222;padding:32px 28px;">
                <h2 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#fff;">Congratulations, ${w.name}!</h2>
                <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#ccc;">You've been randomly selected as one of our <strong style="color:#fff;">100 Reviews Raffle</strong> winners!</p>
                <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#ccc;">As a thank you for your dedication to writing 100+ Ratist reviews, you've earned a <strong style="color:#fff;">lifetime Backstage Pass</strong> — completely free, forever.</p>
                <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#ccc;">This includes Movie Club, Screening Room hosting, My Analytics, custom themes, ad-free experience, and every premium feature — for life.</p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;"><tr><td><a href="https://www.theratist.com/backstage-pass" style="display:inline-block;padding:12px 28px;background:#CC0033;color:#fff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">Explore Your Premium Features</a></td></tr></table>
                <p style="margin:0;font-size:13px;color:#666;">Terms apply: lifetime access is contingent on maintaining your reviews and account in good standing.</p>
              </div>
            </div>
          </body></html>`,
        }).catch(() => {});
      }

      // In-app notification
      await prisma.notification.create({
        data: {
          userId: w.id,
          type: "admin",
          message: "🎉 You won a lifetime Backstage Pass! As one of our 100 Reviews Raffle winners, enjoy all premium features — forever.",
          link: "/backstage-pass",
        },
      }).catch(() => {});
    }

    return NextResponse.json({ granted, winners: winnerNames });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
