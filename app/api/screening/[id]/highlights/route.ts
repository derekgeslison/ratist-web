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

/** POST — Analyze chat and persist highlight bursts (host only) */
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

    // Find peak activity windows (5-minute windows for production, works for testing too)
    const WINDOW_MS = 5 * 60 * 1000;
    const MAX_PER_WINDOW = 25;

    const firstTs = userMessages[0].timestamp;
    const lastTs = userMessages[userMessages.length - 1].timestamp;
    const span = lastTs - firstTs;

    interface Window { start: number; end: number; count: number; messages: ChatMessage[] }
    const windows: Window[] = [];

    if (span < WINDOW_MS) {
      // All messages fit in one window
      windows.push({ start: firstTs, end: lastTs, count: userMessages.length, messages: userMessages });
    } else {
      // Slide through in 30-second steps
      for (let start = firstTs; start <= lastTs; start += 30000) {
        const end = start + WINDOW_MS;
        const windowMsgs = userMessages.filter((m) => m.timestamp >= start && m.timestamp < end);
        if (windowMsgs.length >= 2) {
          const windowEnd = windowMsgs[windowMsgs.length - 1].timestamp;
          windows.push({ start, end: windowEnd, count: windowMsgs.length, messages: windowMsgs });
        }
      }
    }

    // Sort by activity (most messages first), take top 3 non-overlapping
    windows.sort((a, b) => b.count - a.count);
    const selected: Window[] = [];
    for (const w of windows) {
      if (selected.length >= 3) break;
      const overlaps = selected.some((s) => Math.abs(s.start - w.start) < WINDOW_MS);
      if (!overlaps) selected.push(w);
    }

    // Persist ALL messages from each window (capped at MAX_PER_WINDOW)
    const highlights = [];
    for (let groupIdx = 0; groupIdx < selected.length; groupIdx++) {
      const window = selected[groupIdx];
      const msgs = window.messages.slice(0, MAX_PER_WINDOW);
      for (const msg of msgs) {
        highlights.push({
          sessionId: id,
          userId: msg.userId,
          text: msg.text || "",
          emoji: msg.emoji || null,
          reactCount: window.count,
          windowGroup: groupIdx,
          timestamp: new Date(msg.timestamp),
        });
      }
    }

    if (highlights.length > 0) {
      await prisma.screeningChatHighlight.createMany({ data: highlights });
    }

    return NextResponse.json({ ok: true, windows: selected.length, messages: highlights.length });
  } catch (err) {
    console.error("Generate highlights error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
