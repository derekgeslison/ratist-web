import { NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { sanitizeAiError } from "@/lib/ai/sanitize-error";
import { prisma } from "@/lib/prisma";
import { generateCompanionStream, type ProgressEvent } from "@/lib/ai/watch-companion-generate";
import { checkWatchCompanionRateLimit, logAiUsage } from "@/lib/ai/rate-limit";
import { notifyCompanionRequesters } from "@/lib/watch-companion-notify";
import { isCompanionEligible } from "@/lib/companion-eligibility";
import { decideAiringTrigger, AIRING_BUFFER_DAYS } from "@/lib/companion-airing";

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

  // Per-user concurrency lock — at most one in-flight Watch Companion
  // generation per user. Conditional updateMany is atomic at the row
  // level, so two parallel requests racing for the lock can't both win.
  // Stale locks older than 10 min are eligible for re-acquisition
  // (covers crashed gens, browser-closed mid-stream — gens have a
  // 5-min Vercel ceiling, so 10 min is a safe TTL).
  const LOCK_TTL_MS = 10 * 60 * 1000;
  const lockCutoff = new Date(Date.now() - LOCK_TTL_MS);
  const acquired = await prisma.user.updateMany({
    where: {
      id: userRecord.id,
      OR: [
        { companionGenStartedAt: null },
        { companionGenStartedAt: { lt: lockCutoff } },
      ],
    },
    data: { companionGenStartedAt: new Date() },
  });
  if (acquired.count === 0) {
    return new Response(
      JSON.stringify({
        error: "You already have a Watch Companion generation in progress. Wait for it to finish before starting another.",
        inFlight: true,
      }),
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => null) as { tmdbId?: unknown; mediaType?: unknown; season?: unknown } | null;
  const tmdbId = typeof body?.tmdbId === "number" && body.tmdbId > 0 ? body.tmdbId : null;
  const mediaType = body?.mediaType === "movie" || body?.mediaType === "tv" ? body.mediaType : null;
  const season = typeof body?.season === "number" && body.season > 0 ? body.season : null;

  if (!tmdbId) return new Response(JSON.stringify({ error: "tmdbId required" }), { status: 400 });
  if (!mediaType) return new Response(JSON.stringify({ error: "mediaType must be 'movie' or 'tv'" }), { status: 400 });
  if (mediaType === "tv" && season === null) return new Response(JSON.stringify({ error: "season required for tv" }), { status: 400 });

  // Block unreleased / still-theatrical movies. Admins bypass.
  if (!userRecord.isAdmin) {
    const eligibility = await isCompanionEligible(mediaType, tmdbId);
    if (!eligibility.eligible) {
      return new Response(JSON.stringify({ error: eligibility.reason ?? "Not eligible" }), { status: 403 });
    }
  }

  // Airing detection. For TV: if the season's last episode + 2 day buffer
  // is still in the future, we're in airing territory. We refuse to
  // generate when no episodes have cleared the buffer yet (the AI has
  // nothing to work with) but pass airingMode through when at least one
  // episode is eligible.
  let airingMode: { eligibleEpisodes: number[] } | undefined;
  if (mediaType === "tv" && season !== null) {
    const decision = await decideAiringTrigger(tmdbId, season);
    if (decision.kind === "airing_too_early") {
      return new Response(JSON.stringify({
        error: `Season ${season} is currently airing but no episodes have cleared the ${AIRING_BUFFER_DAYS}-day buffer yet. Episode companions become available ~${AIRING_BUFFER_DAYS} days after each episode airs — try again soon.`,
        airingTooEarly: true,
      }), { status: 409 });
    }
    if (decision.kind === "airing_with_eligible") {
      airingMode = { eligibleEpisodes: decision.status.eligibleEpisodes };
    }
  }

  const userId = userRecord.id;

  // Release the per-user concurrency lock. Called from every exit path
  // — success, error event from generator, exception, browser disconnect.
  // Best-effort: a failed release leaves the lock to expire via the
  // 10-min TTL, which still beats holding it forever.
  const releaseLock = async () => {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { companionGenStartedAt: null },
      });
    } catch { /* non-fatal — TTL will reclaim */ }
  };

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
          airingMode,
          generatedByUserId: userId,
        })) {
          // Warnings are admin-facing diagnostics (e.g., "OpenSubtitles
          // quota exhausted, falling back to runtime estimates"). Regular
          // users don't have the context to act on them, so we drop them
          // from the public stream — the admin route still surfaces them.
          if (evt.kind === "warning") continue;
          send(evt);
          if (evt.kind === "error") {
            await releaseLock();
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
            await releaseLock();
            controller.close();
            return;
          }
        }
        await releaseLock();
        controller.close();
      } catch (err) {
        const { body: errBody } = sanitizeAiError(err, "watch-companion");
        try { send({ kind: "error", message: errBody.error }); } catch { /* already closed */ }
        await releaseLock();
        try { controller.close(); } catch { /* already closed */ }
      }
    },
    async cancel() {
      // Browser disconnected mid-stream — release the lock so the user
      // isn't stuck waiting for the 10-min TTL before trying again.
      await releaseLock();
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
