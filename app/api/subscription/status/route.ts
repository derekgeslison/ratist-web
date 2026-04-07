import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { isSubscriptionActive } from "@/lib/subscription";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ hasBackstagePass: false });

  return NextResponse.json({
    hasBackstagePass: isSubscriptionActive(user),
    tier: user.subscriptionTier,
    status: user.subscriptionStatus,
    expiry: user.subscriptionExpiry?.toISOString() ?? null,
  });
}
