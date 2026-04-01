import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: tmdbId } = await params;
    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const movie = await prisma.movie.findUnique({ where: { tmdbId: Number(tmdbId) } });
    if (!movie) return NextResponse.json({ error: "Movie not found" }, { status: 404 });

    const { watchedDate, notes } = await req.json();
    const parsedDate = watchedDate ? new Date(`${watchedDate}T12:00:00`) : new Date();

    const entry = await prisma.userWatchLog.create({
      data: {
        userId: user.id,
        movieId: movie.id,
        watchedDate: parsedDate,
        notes: notes?.trim() || null,
        isRewatch: true,
      },
    });

    return NextResponse.json({ entry });
  } catch (err) {
    console.error("Rewatch error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
