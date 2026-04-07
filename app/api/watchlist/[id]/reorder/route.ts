import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** POST — save new sort order for watchlist items */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: watchlistId } = await params;
    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const decoded = await adminAuth.verifyIdToken(auth.slice(7));
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Verify access
    const wl = await prisma.watchlist.findUnique({
      where: { id: watchlistId },
      include: { collaborators: { where: { userId: user.id } } },
    });
    if (!wl) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const isOwner = wl.userId === user.id;
    const isEditor = wl.collaborators.some((c) => c.role === "editor" && c.status === "accepted");
    if (!isOwner && !isEditor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { items } = await req.json();

    // items is an array of { id, mediaType } in the desired order
    // Both movies and shows get a unified sortOrder based on combined position
    if (Array.isArray(items)) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i] as { id: string; mediaType?: string };
        if (item.mediaType === "tv") {
          await prisma.watchlistShow.updateMany({
            where: { id: item.id, watchlistId },
            data: { sortOrder: i },
          });
        } else {
          await prisma.watchlistMovie.updateMany({
            where: { id: item.id, watchlistId },
            data: { sortOrder: i },
          });
        }
      }
    }

    return NextResponse.json({ saved: true });
  } catch (err) {
    console.error("Watchlist reorder error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
