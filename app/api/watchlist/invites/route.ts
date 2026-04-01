import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** GET — return all pending watchlist invites for the current user */
export async function GET(req: NextRequest) {
  try {
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ invites: [] });

    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) return NextResponse.json({ invites: [] });

    const pending = await prisma.watchlistCollaborator.findMany({
      where: { userId: user.id, status: "pending" },
      include: {
        watchlist: {
          select: {
            id: true, name: true, description: true,
            user: { select: { name: true, avatarUrl: true, firebaseUid: true } },
            _count: { select: { movies: true } },
          },
        },
      },
      orderBy: { addedAt: "desc" },
    });

    return NextResponse.json({
      invites: pending.map((p) => ({
        watchlistId: p.watchlistId,
        listName: p.watchlist.name,
        listDescription: p.watchlist.description,
        movieCount: p.watchlist._count.movies,
        ownerName: p.watchlist.user.name,
        ownerAvatar: p.watchlist.user.avatarUrl,
        ownerUid: p.watchlist.user.firebaseUid,
        role: p.role,
        invitedAt: p.addedAt,
      })),
    });
  } catch (err) {
    console.error("Pending invites error:", err);
    return NextResponse.json({ invites: [] });
  }
}
