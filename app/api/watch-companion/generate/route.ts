import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { generateCompanionStream, type ProgressEvent } from "@/lib/ai/watch-companion-generate";
import { checkWatchCompanionRateLimit, logAiUsage } from "@/lib/ai/rate-limit";
import { notifyCompanionRequesters } from "@/lib/watch-companion-notify";

export const dynamic = "force-dynamic";
// Same ceiling as the admin route — Vercel Pro max.
export const maxDuration = 300;

function sseLine(evt: ProgressEvent | { kind: "error"; message: string }): string {
  return `data: ${JSON.stringify(evt)}\n\n`;
}

/**
 * Public-facing companion generation. Same streaming pipeline as the admin
 * endpoint, but gates on the per-user weekly cap (2 free / 5 Backstage Pass,
 * admins unlimited — see checkWatchCompanionRateLimit). Free users out of
 * credits should hit the /api/watch-companion/request endpoint instead.
 */
export async function POST(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) return new Response(JSON.stringify({ error: "Sign in to generate a Watch Companion." }), { status: 401 });

  // Fetch fields the rate limiter needs.
  const userRecord = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true, isAdmin: true, aiDisabled: true,
      subscriptionTier: true, subscriptionStatus: true, subscriptionExpiry: true,
    },
  });
  if (!userRecord) return new Response(JSON.stringify({ error: "User not found" }), { status: 404 });

  const rateLimitError = await checkWatchCompanionRateLimit(userRecord);
  if (rateLimitError) {
    return new Response(JSON.stringify({ error: rateLimitError, rateLimited: true }), { status: 429 });
  }

  const body = await req.json().catch(() => null) as { tmdbId?: unknown; mediaType?: unknown; season?: unknown } | null;
  const tmdbId = typeof body?.tmdbId === "number" && body.tmdbId > 0 ? body.tmdbId : null;
  const mediaType = body?.mediaType === "movie" || body?.mediaType === "tv" ? body.mediaType : null;
  const season = typeof body?.season === "number" && body.season > 0 ? body.season : null;

  if (!tmdbId) return new Response(JSON.stringify({ error: "tmdbId required" }), { status: 400 });
  if (!mediaType) return new Response(JSON.stringify({ error: "mediaType must be 'movie' or 'tv'" }), { status: 400 });
  if (mediaType === "tv" && season === null) return new Response(JSON.stringify({ error: "season required for tv" }), { status: 400 });

  const userId = userRecord.id;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (evt: ProgressEvent | { kind: "error"; message: string }) => {
        controller.enqueue(encoder.encode(sseLine(evt)));
      };

      try {
        for await (const evt of generateCompanionStream({
          tmdbId,
          mediaType,
          season: mediaType === "tv" ? season! : undefined,
          generatedByUserId: userId,
        })) {
          send(evt);
          if (evt.kind === "error") {
            controller.close();
            return;
          }
          if (evt.kind === "complete") {
            try { await logAiUsage(userId, "watch_companion_generate"); } catch { /* non-fatal */ }
            // Auto-publish user-triggered companions — admin review is
            // reserved for admin-triggered runs. Users who triggered their
            // own generation have effectively committed to it landing.
            try {
              const current = await prisma.watchCompanion.findUnique({
                where: { id: evt.result.companionId },
                select: { status: true },
              });
              const wasAlreadyPublished = current?.status === "published";
              await prisma.watchCompanion.update({
                where: { id: evt.result.companionId },
                data: { status: "published", publishedAt: new Date() },
              });
              // Fan out notifications to anyone waiting on this companion
              // (only on the first publish — re-gens don't re-notify).
              if (!wasAlreadyPublished) {
                await notifyCompanionRequesters(evt.result.companionId, userId);
              }
            } catch { /* non-fatal — admin can publish later */ }
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
        console.error("Watch Companion (user) — generation stream error:", err);
        try { send({ kind: "error", message }); } catch { /* already closed */ }
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
