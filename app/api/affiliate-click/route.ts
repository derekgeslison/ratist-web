import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// POST /api/affiliate-click — record one outbound click on an affiliate
// link. Open to anyone (anonymous clicks count too). The frontend fires
// this via fetch with keepalive:true so it survives the navigation that
// follows immediately. Failures are silently dropped — a missed click
// is a missed data point, not an error worth surfacing.

const ALLOWED_PROVIDERS = new Set([
  "netflix", "amazon", "disney", "hulu", "apple_tv", "max", "paramount", "peacock",
  "starz", "showtime", "amc_plus", "britbox", "criterion", "mubi", "shudder",
  "fandango", "spotify", "rent_buy", "other",
]);

const ALLOWED_MEDIA = new Set(["movie", "tv"]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null) as {
      provider?: unknown;
      targetUrl?: unknown;
      mediaType?: unknown;
      tmdbId?: unknown;
      referrerPath?: unknown;
    } | null;

    const provider = typeof body?.provider === "string" ? body.provider.toLowerCase() : null;
    const targetUrl = typeof body?.targetUrl === "string" ? body.targetUrl.slice(0, 2048) : null;
    if (!provider || !targetUrl) {
      return NextResponse.json({ error: "provider and targetUrl required" }, { status: 400 });
    }
    // Allowlist providers so a typo or a malicious flood doesn't pollute
    // the report with garbage values that show up as separate buckets.
    // Unknown values bucket as "other" rather than reject — better to
    // record the click than lose it.
    const normProvider = ALLOWED_PROVIDERS.has(provider) ? provider : "other";

    const mediaType = typeof body?.mediaType === "string" && ALLOWED_MEDIA.has(body.mediaType)
      ? body.mediaType : null;
    const tmdbId = typeof body?.tmdbId === "number" && body.tmdbId > 0 ? Math.floor(body.tmdbId) : null;
    const referrerPath = typeof body?.referrerPath === "string"
      ? body.referrerPath.slice(0, 512) : null;

    // Auth is optional — anonymous clicks count. Decode the bearer if
    // present so we can attribute to a userId, but don't fail the
    // tracking call if it's missing/invalid.
    let userId: string | null = null;
    const authz = req.headers.get("authorization");
    if (authz?.startsWith("Bearer ")) {
      try {
        const decoded = await adminAuth.verifyIdToken(authz.slice(7));
        const u = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid }, select: { id: true } });
        if (u) userId = u.id;
      } catch { /* anonymous it is */ }
    }

    await prisma.affiliateClick.create({
      data: {
        provider: normProvider,
        targetUrl,
        userId,
        mediaType,
        tmdbId,
        referrerPath,
      },
    });

    // 204 — frontend doesn't need a response and the navigation has
    // probably already started.
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("Affiliate click track error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
