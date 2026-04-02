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

    // Delete any old highlights and regenerate (supports re-testing and schema changes)
    await prisma.screeningChatHighlight.deleteMany({ where: { sessionId: id } });

    const { messages, polls } = await req.json() as { messages: ChatMessage[]; polls?: { question: string; options: string[]; votes: Record<string, number>; createdAt: string; creator: { name: string } }[] };
    if (!messages || messages.length === 0) return NextResponse.json({ ok: true, message: "No messages" });

    // Build poll lookup by approximate timestamp for interleaving
    const pollsByTime = new Map<number, { question: string; options: string[]; votes: Record<string, number>; creator: string }>();
    if (polls) {
      for (const p of polls) {
        const ts = new Date(p.createdAt).getTime();
        pollsByTime.set(ts, { question: p.question, options: p.options, votes: p.votes, creator: p.creator.name });
      }
    }

    // Filter out system messages
    const userMessages = messages.filter((m) => !m.system && m.userId !== "system");
    if (userMessages.length < 3) return NextResponse.json({ ok: true, message: "Not enough messages" });

    const MAX_PER_WINDOW = 25;
    const GAP_THRESHOLD_MS = 60 * 1000; // 60 seconds of silence = new conversation

    // Gap-based detection: split messages into conversation bursts
    // A new burst starts when there's a 60+ second gap between messages
    interface Window { start: number; end: number; count: number; messages: ChatMessage[] }
    const bursts: Window[] = [];
    let currentBurst: ChatMessage[] = [userMessages[0]];

    for (let i = 1; i < userMessages.length; i++) {
      const gap = userMessages[i].timestamp - userMessages[i - 1].timestamp;
      if (gap > GAP_THRESHOLD_MS) {
        // End current burst, start new one
        if (currentBurst.length >= 2) {
          bursts.push({
            start: currentBurst[0].timestamp,
            end: currentBurst[currentBurst.length - 1].timestamp,
            count: currentBurst.length,
            messages: currentBurst,
          });
        }
        currentBurst = [userMessages[i]];
      } else {
        currentBurst.push(userMessages[i]);
      }
    }
    // Don't forget the last burst
    if (currentBurst.length >= 2) {
      bursts.push({
        start: currentBurst[0].timestamp,
        end: currentBurst[currentBurst.length - 1].timestamp,
        count: currentBurst.length,
        messages: currentBurst,
      });
    }

    // Sort by activity (most messages first), take top 3
    bursts.sort((a, b) => b.count - a.count);
    const selected = bursts.slice(0, 3);
    // Re-sort selected by time for display order
    selected.sort((a, b) => a.start - b.start);

    // Persist ALL messages + polls from each window (capped at MAX_PER_WINDOW)
    const highlights = [];
    for (let groupIdx = 0; groupIdx < selected.length; groupIdx++) {
      const window = selected[groupIdx];

      // Find polls that fall within this window's time range
      const windowStart = window.start;
      const windowEnd = window.end;
      const windowPolls: { timestamp: number; text: string }[] = [];
      for (const [ts, poll] of pollsByTime.entries()) {
        if (ts >= windowStart && ts <= windowEnd) {
          const totalVotes = Object.keys(poll.votes).length;
          const optionResults = (poll.options as string[]).map((opt, i) => {
            const count = Object.values(poll.votes).filter((v) => v === i).length;
            return `${opt}: ${count}`;
          }).join(", ");
          windowPolls.push({
            timestamp: ts,
            text: `[Poll] ${poll.question} (${optionResults}) — ${totalVotes} votes`,
          });
        }
      }

      // Combine messages and polls, sort by timestamp, cap
      const allItems: { userId: string; text: string; emoji: string | null; timestamp: number }[] = [];
      for (const msg of window.messages) {
        allItems.push({ userId: msg.userId, text: msg.text || "", emoji: msg.emoji || null, timestamp: msg.timestamp });
      }
      for (const poll of windowPolls) {
        allItems.push({ userId: "system", text: poll.text, emoji: null, timestamp: poll.timestamp });
      }
      allItems.sort((a, b) => a.timestamp - b.timestamp);
      const capped = allItems.slice(0, MAX_PER_WINDOW);

      for (const item of capped) {
        // Skip system entries (polls) — they'd violate the foreign key constraint
        // Poll data is already visible in the session's polls section
        if (item.userId === "system") continue;
        highlights.push({
          sessionId: id,
          userId: item.userId,
          text: item.text,
          emoji: item.emoji || null,
          reactCount: window.count,
          windowGroup: groupIdx,
          timestamp: new Date(item.timestamp),
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
