import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { checkBadges } from "@/lib/badges";
import { purgeSessionFromRtdb } from "@/lib/screening-rtdb";
import { autoCompleteIfExpired } from "@/lib/screening-auto-complete";

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
  ratings: {
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
  },
  chatHighlights: {
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

    // Self-healing time-limit check. If the 4hr wall-clock or 25min
    // post-watch caps have elapsed, this flips the session to
    // COMPLETE and re-fetches so the response reflects the new
    // status. Cheap when nothing's expired (one timestamp compare).
    const { flipped } = await autoCompleteIfExpired({
      id: session.id,
      status: session.status,
      startedAt: session.startedAt,
      finishedAt: session.finishedAt,
    });
    if (flipped) {
      const fresh = await prisma.screeningSession.findUnique({ where: { id }, include: sessionInclude });
      if (fresh) return NextResponse.json(fresh);
    }

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

    // Setting the movie/show (host or anyone in lobby)
    if ((body.movieId !== undefined || body.tmdbId !== undefined || body.movieTitle !== undefined) && session.status === "LOBBY") {
      if (body.movieId !== undefined) data.movieId = body.movieId || null;
      if (body.tmdbId !== undefined) data.tmdbId = body.tmdbId ?? null;
      if (body.movieTitle !== undefined) data.movieTitle = body.movieTitle ?? null;
      if (body.posterPath !== undefined) data.posterPath = body.posterPath ?? null;
      if (body.mediaType !== undefined) data.mediaType = body.mediaType === "tv" ? "tv" : "movie";
    }

    // Status transitions
    if (body.status) {
      const { status } = body;
      if (status === "COUNTDOWN" && isHost && session.status === "LOBBY") {
        // Min-2-participants gate. Blocks solo "host + immediately
        // start" abuse — the screening room is built around a shared
        // watch so a single-person session has no real product use,
        // and removing it as a fallback also closes a path to badge
        // grinding (host + leave-self + 1hr alone). The badge check
        // does its own "stayed through end" guard, but blocking the
        // start cuts off the loop earlier and keeps the UI honest.
        if (session.participants.length < 2) {
          return NextResponse.json({
            error: "You need at least 2 participants to start a screening room. Share your invite link to bring someone in.",
            needsMoreParticipants: true,
          }, { status: 400 });
        }
        data.status = "COUNTDOWN";
      } else if (status === "WATCHING" && isHost && session.status === "COUNTDOWN") {
        data.status = "WATCHING";
        data.startedAt = new Date();
      } else if (status === "POST_WATCH" && isHost) {
        data.status = "POST_WATCH";
        if (!session.finishedAt) data.finishedAt = new Date();
      } else if (status === "COMPLETE" && isHost) {
        data.status = "COMPLETE";
        if (!session.finishedAt) data.finishedAt = new Date();
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

    // Screening badges (social-butterfly / screening-host / pack-leader)
    // all key on status === 'COMPLETE'. The badge check was firing in
    // /finish at the POST_WATCH transition, but the SQL filter
    // requires COMPLETE so that pass always returned zero hits. Re-run
    // the check here when the session actually flips to COMPLETE so
    // every participant gets evaluated against the now-completed
    // session row.
    if (data.status === "COMPLETE") {
      for (const p of updated.participants) {
        checkBadges(p.userId, "screening_end").catch(() => {});
      }
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error("Update screening error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** DELETE — Remove session from view (any participant) or cancel (host, active sessions) */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const session = await prisma.screeningSession.findUnique({
      where: { id },
      include: { participants: true },
    });

    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Active sessions: host can cancel (full delete)
    if (session.status !== "COMPLETE" && session.hostId === user.id) {
      await prisma.screeningSession.delete({ where: { id } });
      // Purge all RTDB state for this session (chat, polls, participants).
      await purgeSessionFromRtdb(id);
      return NextResponse.json({ ok: true });
    }

    // Completed sessions: any participant can hide from their view
    const participant = session.participants.find((p) => p.userId === user.id);
    if (!participant) return NextResponse.json({ error: "Not a participant" }, { status: 403 });

    await prisma.screeningParticipant.update({
      where: { sessionId_userId: { sessionId: id, userId: user.id } },
      data: { hidden: true },
    });

    // Check if ALL participants have hidden — if so, fully delete
    const visibleCount = await prisma.screeningParticipant.count({
      where: { sessionId: id, hidden: false },
    });
    if (visibleCount === 0) {
      await prisma.screeningSession.delete({ where: { id } });
      // Last participant hid the session — purge RTDB state too.
      await purgeSessionFromRtdb(id);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Delete screening error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
