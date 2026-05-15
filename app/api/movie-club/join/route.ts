import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthedUser } from "@/lib/auth-helpers";
import { isSubscriptionActive } from "@/lib/subscription";

export const dynamic = "force-dynamic";

/** POST — join the movie club (Backstage Pass required) */
export async function POST(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Movie Club is a Backstage Pass feature. The UI hides it for
  // non-subscribers but the API surface needs its own enforcement
  // — without this, a free user could curl-POST here and become a
  // member, then participate in rating/voting via the other routes.
  if (!user.isAdmin && !isSubscriptionActive(user)) {
    return NextResponse.json(
      { error: "Movie Club requires Backstage Pass" },
      { status: 403 },
    );
  }

  await prisma.movieClubMember.upsert({
    where: { userId: user.id },
    create: { userId: user.id },
    update: {},
  });

  return NextResponse.json({ joined: true });
}

/** DELETE — leave the movie club */
export async function DELETE(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Leaving is allowed for everyone — a lapsed subscriber should be
  // able to clean up their membership row. The corollary write paths
  // (rate / vote) still gate on subscription status separately.
  await prisma.movieClubMember.deleteMany({ where: { userId: user.id } });
  return NextResponse.json({ left: true });
}
