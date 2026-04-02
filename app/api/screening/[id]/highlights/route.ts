import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface ChatMessage {
  userId: string;
  userName: string;
  text: string;
  emoji?: string;
  timestamp: number;
  system?: boolean;
}

/** POST — Analyze chat and persist highlights (host only, called when entering compare phase) */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const session = await prisma.screeningSession.findUnique({
      where: { id },
      select: { hostId: true },
    });
    if (!session || session.hostId !== user.id) {
      return NextResponse.json({ error: "Host only" }, { status: 403 });
    }

    // Check if highlights already exist
    const existing = await prisma.screeningChatHighlight.count({ where: { sessionId: id } });
    if (existing > 0) return NextResponse.json({ ok: true, message: "Already generated" });

    const { messages } = await req.json() as { messages: ChatMessage[] };
    if (!messages || messages.length === 0) return NextResponse.json({ ok: true, message: "No messages" });

    // Filter out system messages
    const userMessages = messages.filter((m) => !m.system && m.userId !== "system");
    if (userMessages.length < 3) return NextResponse.json({ ok: true, message: "Not enough messages" });

    // Find peak activity windows (3-minute windows)
    const WINDOW_MS = 3 * 60 * 1000;
    const windows: { start: number; count: number; messages: ChatMessage[] }[] = [];

    // Slide through messages in 30-second steps
    const firstTs = userMessages[0].timestamp;
    const lastTs = userMessages[userMessages.length - 1].timestamp;
    for (let start = firstTs; start < lastTs - WINDOW_MS / 2; start += 30000) {
      const end = start + WINDOW_MS;
      const windowMsgs = userMessages.filter((m) => m.timestamp >= start && m.timestamp < end);
      if (windowMsgs.length >= 2) {
        windows.push({ start, count: windowMsgs.length, messages: windowMsgs });
      }
    }

    // Sort by activity (most messages first), take top 3 non-overlapping
    windows.sort((a, b) => b.count - a.count);
    const selected: typeof windows = [];
    for (const w of windows) {
      if (selected.length >= 3) break;
      // Check overlap with already selected
      const overlaps = selected.some((s) => Math.abs(s.start - w.start) < WINDOW_MS);
      if (!overlaps) selected.push(w);
    }

    // Persist top messages from each window
    const highlights = [];
    for (const window of selected) {
      // Pick up to 3 most interesting messages (text messages preferred over emojis)
      const sorted = window.messages
        .sort((a, b) => (b.text?.length ?? 0) - (a.text?.length ?? 0))
        .slice(0, 3);

      for (const msg of sorted) {
        highlights.push({
          sessionId: id,
          userId: msg.userId,
          text: msg.text || "",
          emoji: msg.emoji || null,
          reactCount: window.count,
          timestamp: new Date(msg.timestamp),
        });
      }
    }

    if (highlights.length > 0) {
      await prisma.screeningChatHighlight.createMany({ data: highlights });
    }

    return NextResponse.json({ ok: true, count: highlights.length });
  } catch (err) {
    console.error("Generate highlights error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
