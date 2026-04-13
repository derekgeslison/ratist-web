import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function requireAdmin(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  if (!decoded) return null;
  const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
  if (!user?.isAdmin) return null;
  return user;
}

/** GET — recent RSS headlines for admin inbox */
export async function GET(req: NextRequest) {
  const user = await requireAdmin(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const source = searchParams.get("source");

  const headlines = await prisma.rssHeadline.findMany({
    where: {
      dismissed: false,
      usedInPost: null,
      ...(source ? { feedSource: source } : {}),
    },
    orderBy: { fetchedAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ headlines });
}

/** POST — dismiss a headline or trigger a manual RSS refresh */
export async function POST(req: NextRequest) {
  const user = await requireAdmin(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { action, id } = await req.json();

  if (action === "dismiss" && id) {
    await prisma.rssHeadline.update({
      where: { id },
      data: { dismissed: true },
    });
    return NextResponse.json({ dismissed: true });
  }

  if (action === "refresh") {
    // Trigger RSS fetch inline (same logic as cron, but on-demand)
    const { fetchAllFeeds } = await import("@/lib/rss");
    const items = await fetchAllFeeds();
    let inserted = 0;
    for (const item of items) {
      try {
        await prisma.rssHeadline.upsert({
          where: { url: item.url },
          create: {
            feedSource: item.feedSource,
            title: item.title,
            url: item.url,
            description: item.description ?? null,
            imageUrl: item.imageUrl ?? null,
          },
          update: {},
        });
        inserted++;
      } catch { /* dedup collision */ }
    }
    return NextResponse.json({ refreshed: true, inserted });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
