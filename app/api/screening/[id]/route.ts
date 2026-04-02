import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const sessionInclude = {
  host: { select: { id: true, name: true, avatarUrl: true, firebaseUid: true } },
  participants: {
    include: { user: { select: { id: true, name: true, avatarUrl: true, firebaseUid: true } } },
    orderBy: { joinedAt: "asc" as const },
  },
  predictions: {
    select: { userId: true, plotGuess: true, ratingGuess: true, createdAt: true },
  },
  polls: {
    orderBy: { createdAt: "asc" as const },
    include: { creator: { select: { id: true, name: true } } },
  },
  bookmarks: {
    orderBy: { timestamp: "asc" as const },
    include: { user: { select: { id: true, name: true } } },
  },
};

/** GET — Get session details */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const session = await prisma.screeningSession.findUnique({
      where: { id },
      include: sessionInclude,
    });

    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Must be a participant
    const isParticipant = session.participants.some((p) => p.userId === user.id);
    if (!isParticipant) return NextResponse.json({ error: "Not a participant" }, { status: 403 });

    // Hide predictions if session is not in POST_WATCH or COMPLETE
    if (session.status !== "POST_WATCH" && session.status !== "COMPLETE") {
      // Only show the current user's own prediction
      session.predictions = session.predictions.filter((p) => p.userId === user.id);
    }

    return NextResponse.json(session);
  } catch (err) {
    console.error("Get screening error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** PATCH — Update session (set movie, change status) */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const session = await prisma.screeningSession.findUnique({
      where: { id },
      include: { participants: true },
    });

    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const isHost = session.hostId === user.id;
    const isParticipant = session.participants.some((p) => p.userId === user.id);
    if (!isParticipant) return NextResponse.json({ error: "Not a participant" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const data: Record<string, unknown> = {};

    // Setting the movie (host or anyone in lobby)
    if ((body.movieId !== undefined || body.tmdbId !== undefined || body.movieTitle !== undefined) && session.status === "LOBBY") {
      if (body.movieId !== undefined) data.movieId = body.movieId || null;
      if (body.tmdbId !== undefined) data.tmdbId = body.tmdbId ?? null;
      if (body.movieTitle !== undefined) data.movieTitle = body.movieTitle ?? null;
      if (body.posterPath !== undefined) data.posterPath = body.posterPath ?? null;
    }

    // Status transitions
    if (body.status) {
      const { status } = body;
      if (status === "COUNTDOWN" && isHost && session.status === "LOBBY") {
        data.status = "COUNTDOWN";
      } else if (status === "WATCHING" && isHost && session.status === "COUNTDOWN") {
        data.status = "WATCHING";
        data.startedAt = new Date();
      } else if (status === "POST_WATCH" && isHost) {
        data.status = "POST_WATCH";
      } else if (status === "COMPLETE" && isHost) {
        data.status = "COMPLETE";
        data.finishedAt = new Date();
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No valid updates" }, { status: 400 });
    }

    const updated = await prisma.screeningSession.update({
      where: { id },
      data,
      include: sessionInclude,
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error("Update screening error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** DELETE — Cancel session (host only) */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const session = await prisma.screeningSession.findUnique({ where: { id } });

    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (session.hostId !== user.id) return NextResponse.json({ error: "Host only" }, { status: 403 });

    await prisma.screeningSession.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Delete screening error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
