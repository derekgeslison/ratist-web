import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

interface Props { params: Promise<{ id: string }> }

/** POST — add a movie to this watchlist */
export async function POST(req: NextRequest, { params }: Props) {
  try {
    const { id: watchlistId } = await params;
    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(auth.slice(7));
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Check access: owner or editor collaborator
    const watchlist = await prisma.watchlist.findUnique({
      where: { id: watchlistId },
      include: { collaborators: { where: { userId: user.id } } },
    });
    if (!watchlist) return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
    const isOwner = watchlist.userId === user.id;
    const isEditor = watchlist.collaborators.some((c) => c.role === "editor");
    if (!isOwner && !isEditor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { tmdbId, title, posterPath, releaseDate } = await req.json();
    if (!tmdbId) return NextResponse.json({ error: "tmdbId required" }, { status: 400 });

    // Ensure movie exists in DB
    const movie = await prisma.movie.upsert({
      where: { tmdbId: Number(tmdbId) },
      create: { tmdbId: Number(tmdbId), title: title ?? "Unknown", posterPath: posterPath ?? null, releaseDate: releaseDate ?? null },
      update: {},
    });

    // Add to watchlist (ignore if already there)
    await prisma.watchlistMovie.upsert({
      where: { watchlistId_movieId: { watchlistId, movieId: movie.id } },
      create: { watchlistId, movieId: movie.id },
      update: {},
    });

    return NextResponse.json({ added: true });
  } catch (err) {
    console.error("Watchlist add movie error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
