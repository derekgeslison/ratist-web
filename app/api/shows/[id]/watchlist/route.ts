import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

interface Props {
  params: Promise<{ id: string }>;
}

/** GET — return all user's watchlists with membership status for this show */
export async function GET(req: NextRequest, { params }: Props) {
  try {
    const { id: tmdbId } = await params;
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const tvShow = await prisma.tVShow.findUnique({ where: { tmdbId: Number(tmdbId) } });

    const lists = await prisma.watchlist.findMany({
      where: {
        OR: [
          { userId: user.id },
          { collaborators: { some: { userId: user.id, role: "editor", status: "accepted" } } },
        ],
      },
      select: {
        id: true, name: true, isDefault: true, userId: true,
        user: { select: { name: true } },
        shows: tvShow ? { where: { tvShowId: tvShow.id }, select: { id: true }, take: 1 } : undefined,
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });

    return NextResponse.json({
      lists: lists.map((l) => ({
        id: l.id,
        name: l.name,
        isDefault: l.isDefault,
        isOwned: l.userId === user.id,
        ownerName: l.userId !== user.id ? l.user.name : undefined,
        hasMovie: (l.shows?.length ?? 0) > 0,
      })),
    });
  } catch (err) {
    console.error("Show watchlist lists error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** POST — toggle show on default watchlist */
export async function POST(req: NextRequest, { params }: Props) {
  try {
    const { id: tmdbId } = await params;
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { name, poster_path, first_air_date } = await req.json();
    const tvShow = await prisma.tVShow.upsert({
      where: { tmdbId: Number(tmdbId) },
      create: { tmdbId: Number(tmdbId), name: name ?? "Unknown", posterPath: poster_path ?? null, firstAirDate: first_air_date ?? null },
      update: {},
    });

    // Ensure default watchlist exists
    let defaultList = await prisma.watchlist.findFirst({ where: { userId: user.id, isDefault: true } });
    if (!defaultList) {
      defaultList = await prisma.watchlist.create({
        data: { userId: user.id, name: "Watchlist", slug: "watchlist", isDefault: true },
      });
    }

    // Toggle on default watchlist
    const existing = await prisma.watchlistShow.findUnique({
      where: { watchlistId_tvShowId: { watchlistId: defaultList.id, tvShowId: tvShow.id } },
    });

    if (existing) {
      await prisma.watchlistShow.delete({
        where: { watchlistId_tvShowId: { watchlistId: defaultList.id, tvShowId: tvShow.id } },
      });
    } else {
      await prisma.watchlistShow.create({
        data: { watchlistId: defaultList.id, tvShowId: tvShow.id },
      });
    }

    return NextResponse.json({
      watchlisted: !existing,
    });
  } catch (err) {
    console.error("Show watchlist toggle error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
