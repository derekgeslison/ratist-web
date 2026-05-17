import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { generateReviewDigest, isDigestStale } from "@/lib/ai/review-digest";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mediaType = searchParams.get("mediaType");
  const tmdbIdStr = searchParams.get("tmdbId");

  if (mediaType !== "movie" && mediaType !== "tv") {
    return NextResponse.json({ error: "Invalid mediaType" }, { status: 400 });
  }
  const tmdbId = tmdbIdStr ? parseInt(tmdbIdStr, 10) : NaN;
  if (!Number.isFinite(tmdbId)) {
    return NextResponse.json({ error: "Invalid tmdbId" }, { status: 400 });
  }

  // Look up the internal id so we can count/fetch reviews
  let internalId: string | null = null;
  let title = "";
  if (mediaType === "movie") {
    const m = await prisma.movie.findUnique({ where: { tmdbId }, select: { id: true, title: true } });
    if (!m) return NextResponse.json({ digest: null, reviewCount: 0 });
    internalId = m.id;
    title = m.title;
  } else {
    const s = await prisma.tVShow.findUnique({ where: { tmdbId }, select: { id: true, name: true } });
    if (!s) return NextResponse.json({ digest: null, reviewCount: 0 });
    internalId = s.id;
    title = s.name;
  }

  // Count reviews whose text is substantive enough to bother
  // summarizing. Previously we counted any non-null reviewText, but
  // that let 10 ratings of "loved it" / "ok" trigger a digest gen
  // even though the sample filter would discard them all (line below
  // applies a min-length floor when actually selecting samples) and
  // return null anyway — wasting Anthropic tokens AND showing nothing.
  // Mirroring the sample-filter floor (10 chars) here means a digest
  // only triggers when there's a real chance the result will be
  // meaningful. Same floor is applied via raw SQL on either model.
  const MIN_COMMENT_CHARS = 10;
  const currentCountRows = mediaType === "movie"
    ? await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count
        FROM movie_ratings
        WHERE movie_id = ${internalId}
          AND excluded = false
          AND review_text IS NOT NULL
          AND LENGTH(TRIM(review_text)) >= ${MIN_COMMENT_CHARS}
      `
    : await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count
        FROM tv_show_ratings
        WHERE tv_show_id = ${internalId}
          AND excluded = false
          AND rating_scope = 'series'
          AND review_text IS NOT NULL
          AND LENGTH(TRIM(review_text)) >= ${MIN_COMMENT_CHARS}
      `;
  const currentCount = Number(currentCountRows[0]?.count ?? 0);

  // Floor below which we don't bother summarizing — a digest of 1-2
  // reviews reads like a misleading consensus pulled from one
  // person's opinion. Was 0 during early testing; bumped to 10 now
  // that the feature is live. The stepping system in
  // isDigestStale() (≥3 review delta AND ≥20% growth) handles
  // post-floor refresh cadence so 10 → 12 → 14 keeps regenerating
  // at meaningful checkpoints without burning tokens on every vote.
  // The count above already filters for substantive comments
  // (≥ MIN_COMMENT_CHARS), so this threshold is "10 reviews with
  // substantive comments", not "10 reviews total".
  const MIN_REVIEWS_FOR_DIGEST = 10;
  if (currentCount < MIN_REVIEWS_FOR_DIGEST) {
    return NextResponse.json({ digest: null, reviewCount: currentCount });
  }

  const cached = await prisma.reviewDigest.findUnique({
    where: { mediaType_tmdbId: { mediaType, tmdbId } },
  });

  const needsGeneration = !cached || isDigestStale(cached.reviewCount, currentCount);
  if (!needsGeneration && cached) {
    return NextResponse.json({
      digest: cached.digest,
      reviewCount: cached.reviewCount,
      generatedAt: cached.generatedAt.toISOString(),
    });
  }

  // Regenerate — fetch a cross-section of reviews, prefer those with
  // substantive text. ratistRating filter excludes drafts (text saved
  // before all required fields filled) so the digest doesn't pull
  // from incomplete entries.
  const reviews = mediaType === "movie"
    ? await prisma.movieRating.findMany({
        where: { movieId: internalId, excluded: false, reviewText: { not: null }, ratistRating: { not: null } },
        select: { ratistRating: true, reviewText: true },
        orderBy: { createdAt: "desc" },
        take: 40,
      })
    : await prisma.tVShowRating.findMany({
        where: { tvShowId: internalId, excluded: false, ratingScope: "series", reviewText: { not: null }, ratistRating: { not: null } },
        select: { ratistRating: true, reviewText: true },
        orderBy: { createdAt: "desc" },
        take: 40,
      });

  const samples = reviews
    .filter((r) => r.reviewText && r.reviewText.trim().length >= 10)
    .slice(0, 20)
    .map((r) => ({ rating: r.ratistRating, text: r.reviewText ?? "" }));

  if (samples.length === 0) {
    // Reviews exist but none have meaningful text — return what we have (possibly null)
    return NextResponse.json({
      digest: cached?.digest ?? null,
      reviewCount: cached?.reviewCount ?? 0,
      generatedAt: cached?.generatedAt?.toISOString() ?? null,
    });
  }

  try {
    const digest = await generateReviewDigest(title, samples);
    const saved = await prisma.reviewDigest.upsert({
      where: { mediaType_tmdbId: { mediaType, tmdbId } },
      create: { mediaType, tmdbId, digest, reviewCount: currentCount },
      update: { digest, reviewCount: currentCount, generatedAt: new Date() },
    });
    return NextResponse.json({
      digest: saved.digest,
      reviewCount: saved.reviewCount,
      generatedAt: saved.generatedAt.toISOString(),
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.error(`Review digest — Anthropic error ${err.status}:`, err.message);
    } else {
      console.error("Review digest error:", err);
    }
    // Fall back to cached value if we have one, otherwise hide the feature
    if (cached) {
      return NextResponse.json({
        digest: cached.digest,
        reviewCount: cached.reviewCount,
        generatedAt: cached.generatedAt.toISOString(),
      });
    }
    return NextResponse.json({ digest: null, reviewCount: currentCount });
  }
}
