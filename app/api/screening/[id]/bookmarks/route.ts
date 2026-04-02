import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** POST — Create a bookmark */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const participant = await prisma.screeningParticipant.findUnique({
      where: { sessionId_userId: { sessionId: id, userId: user.id } },
    });
    if (!participant) return NextResponse.json({ error: "Not a participant" }, { status: 403 });

    const { timestamp, note } = await req.json();
    if (!timestamp) return NextResponse.json({ error: "Timestamp required" }, { status: 400 });

    const bookmark = await prisma.screeningBookmark.create({
      data: {
        sessionId: id,
        userId: user.id,
        timestamp,
        note: note ?? null,
      },
      include: { user: { select: { id: true, name: true } } },
    });

    return NextResponse.json(bookmark, { status: 201 });
  } catch (err) {
    console.error("Create bookmark error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** GET — List bookmarks */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const bookmarks = await prisma.screeningBookmark.findMany({
      where: { sessionId: id },
      orderBy: { timestamp: "asc" },
      include: { user: { select: { id: true, name: true } } },
    });

    return NextResponse.json(bookmarks);
  } catch (err) {
    console.error("List bookmarks error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
