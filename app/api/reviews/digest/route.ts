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

  // Count reviews with non-empty text
  const currentCount = mediaType === "movie"
    ? await prisma.movieRating.count({
        where: { movieId: internalId, excluded: false, reviewText: { not: null } },
      })
    : await prisma.tVShowRating.count({
        where: { tvShowId: internalId, excluded: false, ratingScope: "series", reviewText: { not: null } },
      });

  if (currentCount === 0) {
    return NextResponse.json({ digest: null, reviewCount: 0 });
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

  // Regenerate — fetch a cross-section of reviews, prefer those with substantive text
  const reviews = mediaType === "movie"
    ? await prisma.movieRating.findMany({
        where: { movieId: internalId, excluded: false, reviewText: { not: null } },
        select: { ratistRating: true, reviewText: true },
        orderBy: { createdAt: "desc" },
        take: 40,
      })
    : await prisma.tVShowRating.findMany({
        where: { tvShowId: internalId, excluded: false, ratingScope: "series", reviewText: { not: null } },
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
