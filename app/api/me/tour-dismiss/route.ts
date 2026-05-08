import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Sets `tourDismissedAt` for the authenticated user. Idempotent — if
// already dismissed, returns the existing timestamp without resetting
// it (so we don't keep moving the marker forward on every dismiss-write
// from a returning device that's syncing localStorage to server).
export async function POST(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (user.tourDismissedAt) {
    return NextResponse.json({ tourDismissedAt: user.tourDismissedAt });
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { tourDismissedAt: new Date() },
    select: { tourDismissedAt: true },
  });
  return NextResponse.json({ tourDismissedAt: updated.tourDismissedAt });
}
