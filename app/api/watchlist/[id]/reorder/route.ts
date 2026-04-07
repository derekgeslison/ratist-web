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

    const { movieIds, showIds } = await req.json();

    // Update movie sort orders
    if (Array.isArray(movieIds)) {
      for (let i = 0; i < movieIds.length; i++) {
        await prisma.watchlistMovie.updateMany({
          where: { id: movieIds[i], watchlistId },
          data: { sortOrder: i },
        });
      }
    }

    // Update show sort orders
    if (Array.isArray(showIds)) {
      for (let i = 0; i < showIds.length; i++) {
        await prisma.watchlistShow.updateMany({
          where: { id: showIds[i], watchlistId },
          data: { sortOrder: i },
        });
      }
    }

    return NextResponse.json({ saved: true });
  } catch (err) {
    console.error("Watchlist reorder error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
