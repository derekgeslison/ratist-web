import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { isSubscriptionActive } from "@/lib/subscription";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ hasBackstagePass: false });

  // Count standard (non-basic) reviews for critic mode eligibility
  const standardReviewCount = await prisma.movieRating.count({
    where: { userId: user.id, reviewType: { in: ["standard", "critic"] }, ratistRating: { not: null } },
  });

  return NextResponse.json({
    hasBackstagePass: isSubscriptionActive(user),
    tier: user.subscriptionTier,
    status: user.subscriptionStatus,
    expiry: user.subscriptionExpiry?.toISOString() ?? null,
    standardReviewCount,
  });
}
