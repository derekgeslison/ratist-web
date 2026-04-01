import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

interface Props {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: Props) {
  try {
    const { id: tmdbId } = await params;
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { title, poster_path, release_date } = await req.json();
    const movie = await prisma.movie.upsert({
      where: { tmdbId: Number(tmdbId) },
      create: { tmdbId: Number(tmdbId), title: title ?? "Unknown", posterPath: poster_path ?? null, releaseDate: release_date ?? null },
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
    const existing = await prisma.watchlistMovie.findUnique({
      where: { watchlistId_movieId: { watchlistId: defaultList.id, movieId: movie.id } },
    });

    if (existing) {
      await prisma.watchlistMovie.delete({
        where: { watchlistId_movieId: { watchlistId: defaultList.id, movieId: movie.id } },
      });
      return NextResponse.json({ watchlisted: false });
    } else {
      await prisma.watchlistMovie.create({
        data: { watchlistId: defaultList.id, movieId: movie.id },
      });

      // Return user's other lists so the UI can show the "add to list" popup
      const otherLists = await prisma.watchlist.findMany({
        where: { userId: user.id, isDefault: false },
        select: {
          id: true, name: true,
          movies: { where: { movieId: movie.id }, select: { id: true }, take: 1 },
        },
        orderBy: { createdAt: "asc" },
      });

      return NextResponse.json({
        watchlisted: true,
        otherLists: otherLists.map((l) => ({
          id: l.id,
          name: l.name,
          hasMovie: l.movies.length > 0,
        })),
      });
    }
  } catch (err) {
    console.error("Watchlist toggle error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
