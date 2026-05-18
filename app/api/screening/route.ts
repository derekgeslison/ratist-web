import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { generateInviteCode } from "@/lib/screening";
import { addParticipantToRtdb } from "@/lib/screening-rtdb";

export const dynamic = "force-dynamic";

/** POST — Create a new screening session */
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // No-concurrent-rooms gate. A user can't host or join more than
    // one active screening session at a time — prevents both abuse
    // (chained badge-grind sessions, divided attention) and the
    // accidental "I forgot I had another room open" case. "Active"
    // = any status other than COMPLETE.
    const existingActive = await prisma.screeningSession.findFirst({
      where: {
        status: { not: "COMPLETE" },
        OR: [
          { hostId: user.id },
          { participants: { some: { userId: user.id } } },
        ],
      },
      select: { id: true, movieTitle: true, hostId: true },
    });
    if (existingActive) {
      const role = existingActive.hostId === user.id ? "hosting" : "in";
      const label = existingActive.movieTitle ?? "an untitled session";
      return NextResponse.json({
        error: `You're already ${role} another screening room (${label}). ${role === "hosting" ? "End or cancel" : "Leave"} it before starting a new one.`,
        conflictingSessionId: existingActive.id,
      }, { status: 409 });
    }

    const body = await req.json().catch(() => ({}));
    const { movieId, tmdbId, movieTitle, posterPath, mediaType } = body;

    // Generate a unique invite code
    let inviteCode = generateInviteCode();
    let attempts = 0;
    while (attempts < 10) {
      const existing = await prisma.screeningSession.findUnique({ where: { inviteCode } });
      if (!existing) break;
      inviteCode = generateInviteCode();
      attempts++;
    }

    const session = await prisma.screeningSession.create({
      data: {
        hostId: user.id,
        movieId: movieId ?? null,
        tmdbId: tmdbId ?? null,
        movieTitle: movieTitle ?? null,
        posterPath: posterPath ?? null,
        mediaType: mediaType === "tv" ? "tv" : "movie",
        inviteCode,
        participants: {
          create: { userId: user.id },
        },
      },
      include: {
        participants: { include: { user: { select: { id: true, name: true, avatarUrl: true, firebaseUid: true } } } },
      },
    });

    // Mirror host membership into RTDB so the database.rules.json gate
    // identifies them as a participant. Logs + swallows errors so a
    // transient RTDB issue doesn't break session creation.
    await addParticipantToRtdb(session.id, user.firebaseUid);

    return NextResponse.json(session, { status: 201 });
  } catch (err) {
    console.error("Create screening error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** GET — List user's active and recent sessions */
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const sessions = await prisma.screeningSession.findMany({
      where: {
        participants: { some: { userId: user.id, hidden: false } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        host: { select: { id: true, name: true, avatarUrl: true, firebaseUid: true } },
        participants: { include: { user: { select: { id: true, name: true, avatarUrl: true, firebaseUid: true } } } },
      },
    });

    return NextResponse.json(sessions);
  } catch (err) {
    console.error("List screenings error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
