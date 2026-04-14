import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getShowDetails } from "@/lib/tmdb";
import ReviewCard from "@/components/ReviewCard";
import FollowingReviews from "@/components/FollowingReviews";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sort?: string; scope?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const show = await getShowDetails(Number(id));
    return { title: `Reviews: ${show.name}` };
  } catch {
    return { title: "Reviews" };
  }
}

export default async function ShowReviewsPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { sort = "recent", scope = "all" } = await searchParams;

  let showName = "Show";
  try {
    const show = await getShowDetails(Number(id));
    showName = show.name;
  } catch { /* continue */ }

  const dbShow = await prisma.tVShow.findUnique({
    where: { tmdbId: Number(id) },
    select: { id: true },
  });

  if (!dbShow) notFound();

  const orderBy = sort === "top"
    ? [{ ratistRating: "desc" as const }]
    : sort === "liked"
      ? [{ createdAt: "desc" as const }] // we'll sort by like count in JS
      : [{ createdAt: "desc" as const }];

  // Filter by review type if "critics" sort is selected
  const typeFilter = sort === "critics" ? { reviewType: "critic" } : {};

  // Scope filter
  const scopeFilter =
    scope === "series"
      ? { ratingScope: "series" }
      : scope !== "all" && !isNaN(Number(scope))
        ? { ratingScope: "season", seasonNumber: Number(scope) }
        : {};

  const rawReviews = await prisma.tVShowRating.findMany({
    where: {
      tvShowId: dbShow.id,
      ...typeFilter,
      ...scopeFilter,
      OR: [
        { reviewText: { not: null } },
        { ratistRating: { not: null } },
      ],
    },
    select: {
      id: true,
      reviewText: true,
      ratistRating: true,
      overallRating: true,
      storyScore: true,
      styleScore: true,
      emotiveScore: true,
      actingScore: true,
      entertainScore: true,
      reviewType: true,
      fieldComments: true,
      categoryComments: true,
      hasSpoilers: true,
      commentsDisabled: true,
      createdAt: true,
      ratingScope: true,
      seasonNumber: true,
      user: { select: { id: true, firebaseUid: true, name: true, avatarUrl: true } },
    },
    orderBy,
  });

  // Fetch comment + like counts from unified models
  const reviewIds = rawReviews.map((r) => r.id);
  const [commentCounts, likeCounts] = await Promise.all([
    prisma.comment.groupBy({
      by: ["targetId"],
      where: { targetType: "review", targetId: { in: reviewIds } },
      _count: { id: true },
    }),
    prisma.postLike.groupBy({
      by: ["targetId"],
      where: { targetType: "review", targetId: { in: reviewIds } },
      _count: { targetId: true },
    }),
  ]);
  const commentMap = new Map(commentCounts.map((c) => [c.targetId, c._count.id]));
  const likeMap = new Map(likeCounts.map((l) => [l.targetId, l._count.targetId]));
  const reviews = rawReviews.map((r) => ({
    ...r,
    commentCount: commentMap.get(r.id) ?? 0,
    likeCount: likeMap.get(r.id) ?? 0,
  }));

  // For "most liked" sort, re-sort by like count
  const sortedReviews = sort === "liked"
    ? [...reviews].sort((a, b) => b.likeCount - a.likeCount)
    : reviews;

  // We need all season numbers across ALL reviews (not just filtered), so fetch separately
  const allScopeNumbers = await prisma.tVShowRating.findMany({
    where: {
      tvShowId: dbShow.id,
      ratingScope: "season",
      OR: [
        { reviewText: { not: null } },
        { ratistRating: { not: null } },
      ],
    },
    select: { seasonNumber: true },
    distinct: ["seasonNumber"],
    orderBy: { seasonNumber: "asc" },
  });
  const seasonFilterNumbers = allScopeNumbers.map((s) => s.seasonNumber);

  // Check if there are any series-level reviews
  const hasSeriesReviews = await prisma.tVShowRating.count({
    where: {
      tvShowId: dbShow.id,
      ratingScope: "series",
      OR: [
        { reviewText: { not: null } },
        { ratistRating: { not: null } },
      ],
    },
  });

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link
        href={`/shows/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground-muted)] hover:text-white transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" /> Back to {showName}
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Community Reviews</h1>
          <p className="text-sm text-[var(--foreground-muted)] mt-1">{reviews.length} review{reviews.length !== 1 ? "s" : ""} for {showName}</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {(["recent", "top", "liked", "critics", "following"] as const).map((s) => (
            <Link
              key={s}
              href={`/shows/${id}/reviews?sort=${s}&scope=${scope}`}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                sort === s
                  ? "bg-[var(--ratist-red)] border-[var(--ratist-red)] text-white"
                  : "bg-[var(--surface-2)] border-[var(--border)] text-[var(--foreground-muted)] hover:text-white"
              }`}
            >
              {s === "recent" ? "Recent" : s === "top" ? "Top Rated" : s === "liked" ? "Most Liked" : s === "critics" ? "Critics" : "Following"}
            </Link>
          ))}
        </div>
      </div>

      {/* Scope filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Link
          href={`/shows/${id}/reviews?sort=${sort}&scope=all`}
          className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
            scope === "all"
              ? "border-[var(--ratist-red)] bg-[var(--ratist-red)]/10 text-white"
              : "border-[var(--border)] text-[var(--foreground-muted)] hover:border-[var(--foreground-muted)]"
          }`}
        >
          All
        </Link>
        {hasSeriesReviews > 0 && (
          <Link
            href={`/shows/${id}/reviews?sort=${sort}&scope=series`}
            className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
              scope === "series"
                ? "border-[var(--ratist-red)] bg-[var(--ratist-red)]/10 text-white"
                : "border-[var(--border)] text-[var(--foreground-muted)] hover:border-[var(--foreground-muted)]"
            }`}
          >
            Series
          </Link>
        )}
        {seasonFilterNumbers.map((sn) => (
          <Link
            key={sn}
            href={`/shows/${id}/reviews?sort=${sort}&scope=${sn}`}
            className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
              scope === String(sn)
                ? "border-[var(--ratist-red)] bg-[var(--ratist-red)]/10 text-white"
                : "border-[var(--border)] text-[var(--foreground-muted)] hover:border-[var(--foreground-muted)]"
            }`}
          >
            Season {sn}
          </Link>
        ))}
      </div>

      {sort === "following" ? (
        <FollowingReviews showTmdbId={Number(id)} />
      ) : reviews.length === 0 ? (
        <div className="text-center py-16 text-[var(--foreground-muted)]">
          <p className="mb-2">No reviews yet.</p>
          <Link href={`/shows/${id}/rate`} className="text-sm text-[var(--ratist-red)] hover:underline">
            Be the first to write a review &rarr;
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedReviews.map((r) => (
            <div key={r.id}>
              <div className="mb-1">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  r.ratingScope === "series"
                    ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                    : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                }`}>
                  {r.ratingScope === "series" ? "Series" : `Season ${r.seasonNumber}`}
                </span>
              </div>
              <ReviewCard
                review={{
                  id: r.id,
                  reviewText: r.reviewText,
                  ratistRating: r.ratistRating,
                  overallRating: r.overallRating,
                  storyScore: r.storyScore,
                  styleScore: r.styleScore,
                  emotiveScore: r.emotiveScore,
                  actingScore: r.actingScore,
                  entertainScore: r.entertainScore,
                  reviewType: r.reviewType,
                  fieldComments: r.fieldComments as Record<string, string> | null,
                  categoryComments: r.categoryComments as Record<string, string> | null,
                  hasSpoilers: r.hasSpoilers,
                  commentsDisabled: r.commentsDisabled,
                  createdAt: r.createdAt.toISOString(),
                  commentCount: r.commentCount,
                  likeCount: r.likeCount,
                  likedByMe: false,
                  user: r.user,
                }}
                showTmdbId={Number(id)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
