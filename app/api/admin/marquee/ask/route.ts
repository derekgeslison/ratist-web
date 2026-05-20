import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthedUser } from "@/lib/auth-helpers";
import { askMarquee } from "@/lib/marquee/ask";
import { synthesizeSegment } from "@/lib/marquee/tts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { isAdmin: true } });
  if (!dbUser?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({} as { question?: string; speak?: boolean }));
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const speak = body.speak !== false; // default true
  if (!question) return NextResponse.json({ error: "question required" }, { status: 400 });
  if (question.length > 500) return NextResponse.json({ error: "question too long (max 500 chars)" }, { status: 400 });

  const result = await askMarquee(question);
  let audioBase64: string | null = null;
  if (speak && result.answer) {
    try {
      const audio = await synthesizeSegment(result.answer);
      audioBase64 = audio.audioBase64;
    } catch (err) {
      // Don't fail the whole response if TTS chokes — give them the text.
      console.warn("[Marquee.ask] TTS failed:", err);
    }
  }

  return NextResponse.json({
    answer: result.answer,
    toolCalls: result.toolCalls,
    audioBase64,
  });
}
