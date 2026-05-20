import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthedUser } from "@/lib/auth-helpers";
import { getAllMarqueeData } from "@/lib/marquee/aggregators";
import { generateMarqueeBrief } from "@/lib/marquee/brief";
import { synthesizeAll } from "@/lib/marquee/tts";

export const dynamic = "force-dynamic";
// Aggregate + Sonnet + 10 parallel TTS calls. Comfortably under 30s in
// practice but the maxDuration headroom prevents one slow TTS call from
// dropping the response.
export const maxDuration = 60;

// 12-hour cache TTL. Brief generation costs ~$0.07 in AI calls; without
// caching, a re-open of the admin page would burn that again. 12hr is
// short enough that morning + afternoon visits each get their own brief
// reflecting the day's evolving state.
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const CACHE_ID = "latest";

export async function POST(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { isAdmin: true } });
  if (!dbUser?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({} as { force?: boolean }));
  const force = body.force === true;

  // Cache lookup (skipped when force=true via the Regenerate button).
  // Also auto-busts the cache when the stored payload is from an older
  // schema version that's missing the `tiles` field — prevents the page
  // from rendering against an incompatible shape after we evolve the
  // brief structure.
  if (!force) {
    const cached = await prisma.marqueeBriefCache.findUnique({ where: { id: CACHE_ID } });
    const payload = cached?.payload as (Record<string, unknown> | null);
    const hasCurrentSchema = payload != null && Array.isArray(payload.tiles) && Array.isArray(payload.selectedSections);
    if (cached && hasCurrentSchema && Date.now() - cached.generatedAt.getTime() < CACHE_TTL_MS) {
      return NextResponse.json({
        ...(payload as Record<string, unknown>),
        cached: true,
        cacheAgeMin: Math.floor((Date.now() - cached.generatedAt.getTime()) / 60000),
      });
    }
  }

  const data = await getAllMarqueeData();
  const brief = await generateMarqueeBrief(data);
  const audio = await synthesizeAll(brief.segments);

  const payload = {
    segments: brief.segments.map((s, i) => ({
      section: s.section,
      prose: s.prose,
      audioBase64: audio[i]?.audioBase64 ?? null,
      estimatedDurationSec: audio[i]?.estimatedDurationSec ?? null,
    })),
    tiles: brief.tiles,
    selectedSections: brief.selectedSections,
    data: brief.data,
    generatedAt: new Date().toISOString(),
  };

  // Upsert so repeated forces overwrite the single "latest" row.
  await prisma.marqueeBriefCache.upsert({
    where: { id: CACHE_ID },
    create: { id: CACHE_ID, payload: payload as object, generatedAt: new Date() },
    update: { payload: payload as object, generatedAt: new Date() },
  });

  return NextResponse.json({ ...payload, cached: false, cacheAgeMin: 0 });
}
