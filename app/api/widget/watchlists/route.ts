import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/widget/watchlists
//
// Native widget config screens call this when the user adds the
// Watchlist widget to their home screen. We return a flat list of
// the user's watchlists (owned + accepted collaborator invites) so
// the config UI can render a picker.
//
// Auth: Firebase ID token. The Android widget reads the token from
// the native Firebase SDK and forwards it as a Bearer header — same
// auth shape every other authed route uses.
//
// Shape: { watchlists: [{ id, name, itemCount, isDefault }] }
// Order: default first, then alpha by name (stable for picker UX).
export async function GET(req: NextRequest) {
  try {
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({
      where: { firebaseUid: decoded.uid },
      select: { id: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const rows = await prisma.watchlist.findMany({
      where: {
        OR: [
          { userId: user.id },
          { collaborators: { some: { userId: user.id, status: "accepted" } } },
        ],
      },
      select: {
        id: true,
        name: true,
        isDefault: true,
        _count: { select: { movies: true, shows: true } },
      },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });

    const watchlists = rows.map((w) => ({
      id: w.id,
      name: w.name,
      isDefault: w.isDefault,
      itemCount: w._count.movies + w._count.shows,
    }));

    return NextResponse.json({ watchlists });
  } catch (err) {
    console.error("[widget/watchlists] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
