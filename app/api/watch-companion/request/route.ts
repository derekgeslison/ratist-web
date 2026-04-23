import { NextRequest, NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { isSubscriptionActive } from "@/lib/subscription";
import { isCompanionEligible } from "@/lib/companion-eligibility";

export const dynamic = "force-dynamic";

/**
 * Create a generation request — used when the user has run out of self-service
 * credits for the week. Dedupes: if this user already has a pending request
 * for the same (tmdbId, mediaType, season), return the existing one.
 */
export async function POST(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to request a Watch Companion." }, { status: 401 });

  const body = await req.json().catch(() => null) as {
    tmdbId?: unknown; mediaType?: unknown; season?: unknown; rationale?: unknown;
  } | null;
  const tmdbId = typeof body?.tmdbId === "number" && body.tmdbId > 0 ? body.tmdbId : null;
  const mediaType = body?.mediaType === "movie" || body?.mediaType === "tv" ? body.mediaType : null;
  const season = typeof body?.season === "number" && body.season > 0 ? body.season : null;
  const rationale = typeof body?.rationale === "string" ? body.rationale.slice(0, 1000) : null;

  if (!tmdbId) return NextResponse.json({ error: "tmdbId required" }, { status: 400 });
  if (!mediaType) return NextResponse.json({ error: "mediaType must be 'movie' or 'tv'" }, { status: 400 });
  if (mediaType === "tv" && season === null) return NextResponse.json({ error: "season required for tv" }, { status: 400 });

  // Block requests for unreleased / still-theatrical movies too. No point
  // queueing work on a title an admin will also reject.
  const eligibility = await isCompanionEligible(mediaType, tmdbId);
  if (!eligibility.eligible) {
    return NextResponse.json({ error: eligibility.reason ?? "Not eligible" }, { status: 403 });
  }

  // Dedupe against the same user's pending requests for this exact target.
  const existing = await prisma.companionGenerationRequest.findFirst({
    where: { requesterId: user.id, tmdbId, mediaType, season: season ?? null, status: "pending" },
  });
  if (existing) {
    return NextResponse.json({ request: existing, deduped: true });
  }

  const created = await prisma.companionGenerationRequest.create({
    data: { requesterId: user.id, tmdbId, mediaType, season: season ?? null, rationale },
  });
  return NextResponse.json({ request: created });
}

/**
 * Inform the viewer of the current state for a target (used by the "not
 * available yet" page to show "already requested · X pending" or similar).
 */
export async function GET(req: NextRequest) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ request: null, queueLength: 0, credits: null });

  const { searchParams } = new URL(req.url);
  const tmdbId = Number(searchParams.get("tmdbId"));
  const mediaType = searchParams.get("mediaType") === "movie" || searchParams.get("mediaType") === "tv"
    ? searchParams.get("mediaType") as "movie" | "tv"
    : null;
  const seasonStr = searchParams.get("season");
  const season = seasonStr ? parseInt(seasonStr, 10) : null;

  if (!Number.isFinite(tmdbId) || tmdbId < 1 || !mediaType) {
    return NextResponse.json({ error: "Invalid target" }, { status: 400 });
  }

  // Credits snapshot — the UI uses this to decide whether to show "Generate
  // it yourself" or "Request from an admin".
  const userRecord = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      isAdmin: true, aiDisabled: true,
      subscriptionTier: true, subscriptionStatus: true, subscriptionExpiry: true,
    },
  });
  const cap = userRecord?.isAdmin ? Infinity : (userRecord && isSubscriptionActive(userRecord) ? 5 : 2);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const used = await prisma.aiUsageLog.count({
    where: { userId: user.id, feature: "watch_companion_generate", createdAt: { gte: weekAgo } },
  });

  const [mine, queueLength] = await Promise.all([
    prisma.companionGenerationRequest.findFirst({
      where: { requesterId: user.id, tmdbId, mediaType, season: season ?? null, status: "pending" },
    }),
    prisma.companionGenerationRequest.count({
      where: { tmdbId, mediaType, season: season ?? null, status: "pending" },
    }),
  ]);

  // Eligibility is cheap to include — saves a second round trip from the
  // client before it can render the right state.
  const eligibility = await isCompanionEligible(mediaType, tmdbId);

  return NextResponse.json({
    request: mine,
    queueLength,
    eligibility,
    credits: {
      used,
      cap: Number.isFinite(cap) ? cap : null,
      remaining: Number.isFinite(cap) ? Math.max(0, (cap as number) - used) : null,
      aiDisabled: !!userRecord?.aiDisabled,
      hasPass: !!(userRecord && isSubscriptionActive(userRecord)),
      isAdmin: !!userRecord?.isAdmin,
    },
  });
}
