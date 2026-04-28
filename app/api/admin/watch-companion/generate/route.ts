import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";
import { generateCompanionStream, type ProgressEvent } from "@/lib/ai/watch-companion-generate";
import { logAiUsage } from "@/lib/ai/rate-limit";
import { decideAiringTrigger, AIRING_BUFFER_DAYS } from "@/lib/companion-airing";
import { notifyCompanionRequesters } from "@/lib/watch-companion-notify";

export const dynamic = "force-dynamic";
// Five sequential Sonnet calls + TMDB + Wikipedia + Prisma writes can still
// run 2–4 minutes on a full season. 300s is Vercel Pro's ceiling.
export const maxDuration = 300;

async function requireAdmin(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(auth.slice(7)).catch(() => null);
  if (!decoded) return null;
  const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
  if (!user?.isAdmin) return null;
  return user;
}

function sseLine(evt: ProgressEvent): string {
  return `data: ${JSON.stringify(evt)}\n\n`;
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin(req);
  if (!user) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });

  const body = await req.json().catch(() => null) as { tmdbId?: unknown; mediaType?: unknown; season?: unknown } | null;
  const tmdbId = typeof body?.tmdbId === "number" && body.tmdbId > 0 ? body.tmdbId : null;
  const mediaType = body?.mediaType === "movie" || body?.mediaType === "tv" ? body.mediaType : null;
  const season = typeof body?.season === "number" && body.season > 0 ? body.season : null;

  if (!tmdbId) return new Response(JSON.stringify({ error: "tmdbId required" }), { status: 400 });
  if (!mediaType) return new Response(JSON.stringify({ error: "mediaType must be 'movie' or 'tv'" }), { status: 400 });
  if (mediaType === "tv" && season === null) return new Response(JSON.stringify({ error: "season required for tv" }), { status: 400 });

  // Airing detection — admin path mirrors the public path. Even admins can't
  // generate an episode whose recap/transcript info isn't online yet (the AI
  // would just hallucinate), so the 2-day buffer applies here too.
  let airingMode: { eligibleEpisodes: number[] } | undefined;
  if (mediaType === "tv" && season !== null) {
    const decision = await decideAiringTrigger(tmdbId, season);
    if (decision.kind === "airing_too_early") {
      return new Response(JSON.stringify({
        error: `Season ${season} is currently airing but no episodes have cleared the ${AIRING_BUFFER_DAYS}-day buffer yet.`,
        airingTooEarly: true,
      }), { status: 409 });
    }
    if (decision.kind === "airing_with_eligible") {
      airingMode = { eligibleEpisodes: decision.status.eligibleEpisodes };
    }
  }

  const userId = user.id;

  // Stream the generator as Server-Sent Events. The admin UI parses each
  // `data: {json}\n\n` line to drive the 5-step progress checklist.
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (evt: ProgressEvent) => {
        controller.enqueue(encoder.encode(sseLine(evt)));
      };

      try {
        for await (const evt of generateCompanionStream({
          tmdbId,
          mediaType,
          season: mediaType === "tv" ? season! : undefined,
          airingMode,
          generatedByUserId: userId,
        })) {
          send(evt);
          if (evt.kind === "error") {
            controller.close();
            return;
          }
          if (evt.kind === "complete") {
            // Log usage AFTER success; match the old route's behavior.
            try { await logAiUsage(userId, "watch_companion_generate"); } catch { /* non-fatal */ }
            // If this generation was triggered by (or fulfills) one or
            // more open user requests, auto-publish the companion and
            // notify the requesters. Admins running a request through
            // the generator expect users to see the result, not have
            // it sit in `draft` waiting on a separate publish click —
            // that gap was why request notifications were silent.
            try {
              const companionId = evt.result.companionId;
              const requestMatch = await prisma.companionGenerationRequest.findFirst({
                where: {
                  tmdbId,
                  mediaType,
                  // Movies have no season, TV requests can be season-less
                  // (matches any) or season-specific (must match).
                  ...(mediaType === "tv"
                    ? { OR: [{ season: null }, { season }] }
                    : {}),
                  status: { in: ["pending", "approved"] },
                  notifiedAt: null,
                },
                select: { id: true },
              });
              if (requestMatch) {
                // Only auto-publish if the companion actually has
                // content. A successful "complete" event with zero
                // characters means the generation hit a degenerate
                // state — publishing it would ship an empty cast
                // tab to the user who requested it.
                const charCount = await prisma.companionCharacter.count({
                  where: { companionId },
                });
                if (charCount > 0) {
                  await prisma.watchCompanion.update({
                    where: { id: companionId },
                    data: { status: "published", publishedAt: new Date() },
                  });
                  await notifyCompanionRequesters(companionId, userId);
                } else {
                  console.warn(`[companion ${companionId}] auto-publish skipped — 0 characters; leaving as draft for admin review`);
                }
              }
            } catch (err) {
              console.error("Auto-publish/notify on generate failed (non-fatal):", err);
            }
            controller.close();
            return;
          }
        }
        controller.close();
      } catch (err) {
        const message = err instanceof Anthropic.APIError
          ? `AI error (${err.status}): ${err.message}`
          : err instanceof Error
          ? err.message
          : String(err);
        console.error("Watch Companion — generation stream error:", err);
        try { send({ kind: "error", message }); } catch { /* already closed */ }
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // Disable buffering so events arrive in real time on Vercel + nginx.
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
