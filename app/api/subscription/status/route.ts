import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { isSubscriptionActive } from "@/lib/subscription";
import { getFullRatistCount } from "@/lib/profile";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ hasBackstagePass: false });

  // Single source of truth shared with rebuildUserProfile's blend
  // threshold. Includes both movies and TV, only counts ratings with
  // user-supplied subfield data (so a partially-filled "standard"
  // doesn't falsely escape the < 10 gate). Settings uses this to
  // decide when to hide the genre + component editor; the rebuild
  // uses the same number to decide when to stop blending statedPrefs.
  const standardReviewCount = await getFullRatistCount(user.id);

  return NextResponse.json({
    hasBackstagePass: isSubscriptionActive(user),
    tier: user.subscriptionTier,
    status: user.subscriptionStatus,
    expiry: user.subscriptionExpiry?.toISOString() ?? null,
    standardReviewCount,
  });
}
