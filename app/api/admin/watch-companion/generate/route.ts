import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { generateCompanion } from "@/lib/ai/watch-companion-generate";
import { logAiUsage } from "@/lib/ai/rate-limit";

export const dynamic = "force-dynamic";
// Generation can take 30–60s for a full season (grounding fetches + Claude
// call + DB writes). Bump the route's time budget accordingly.
export const maxDuration = 120;

async function requireAdmin(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  if (!decoded) return null;
  const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
  if (!user?.isAdmin) return null;
  return user;
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null) as { tmdbId?: unknown; mediaType?: unknown; season?: unknown } | null;
  const tmdbId = typeof body?.tmdbId === "number" && body.tmdbId > 0 ? body.tmdbId : null;
  const mediaType = body?.mediaType === "movie" || body?.mediaType === "tv" ? body.mediaType : null;
  const season = typeof body?.season === "number" && body.season > 0 ? body.season : null;

  if (!tmdbId) return NextResponse.json({ error: "tmdbId required" }, { status: 400 });
  if (!mediaType) return NextResponse.json({ error: "mediaType must be 'movie' or 'tv'" }, { status: 400 });
  if (mediaType === "tv" && season === null) return NextResponse.json({ error: "season required for tv" }, { status: 400 });

  try {
    const result = await generateCompanion({
      tmdbId,
      mediaType,
      season: mediaType === "tv" ? season! : undefined,
      generatedByUserId: user.id,
    });
    await logAiUsage(user.id, "watch_companion_generate");
    return NextResponse.json({ result });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      console.error("Watch Companion — Anthropic auth failed:", err.message);
      return NextResponse.json({ error: "AI service isn't configured — check ANTHROPIC_API_KEY." }, { status: 500 });
    }
    if (err instanceof Anthropic.APIError) {
      console.error(`Watch Companion — Anthropic API error ${err.status}:`, err.message);
      return NextResponse.json({ error: `AI error (${err.status}): ${err.message}` }, { status: 500 });
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error("Watch Companion — unexpected error:", message, err);
    return NextResponse.json({ error: `Generation failed: ${message}` }, { status: 500 });
  }
}
