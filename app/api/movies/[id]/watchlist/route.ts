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

    const existing = await prisma.userWatchlistMovie.findUnique({
      where: { userId_movieId: { userId: user.id, movieId: movie.id } },
    });

    if (existing) {
      await prisma.userWatchlistMovie.delete({
        where: { userId_movieId: { userId: user.id, movieId: movie.id } },
      });
      return NextResponse.json({ watchlisted: false });
    } else {
      await prisma.userWatchlistMovie.create({
        data: { userId: user.id, movieId: movie.id },
      });
      return NextResponse.json({ watchlisted: true });
    }
  } catch (err) {
    console.error("Watchlist toggle error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
