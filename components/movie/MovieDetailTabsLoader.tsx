// Server component that fetches the DB-heavy data behind MovieDetailTabs
// (reviews + comment/like counts, forum/news/blog discussions, awards).
// Lifted out of app/movies/[id]/page.tsx so the poster + meta row +
// JSON-LD render immediately while these queries stream in behind a
// Suspense boundary.

import { prisma } from "@/lib/prisma";
import { getMovieAwards } from "@/lib/awards";
import MovieDetailTabs from "@/components/MovieDetailTabs";
import type { TMDBMovie, TMDBCastMember, TMDBCrewMember, TMDBImage, TMDBWatchProvider } from "@/lib/tmdb";

type ReviewRow = {
  id: string;
  reviewText: string | null;
  ratistRating: number | null;
  overallRating: number | null;
  reviewType: string;
  hasSpoilers: boolean;
  commentsDisabled: boolean;
  user: { id: string; firebaseUid: string; name: string; avatarUrl: string | null };
  createdAt: Date;
  likeCount: number;
  commentCount: number;
};
// linkType matches MovieDetailTabs' Discussion interface; "blog" entries
// reuse the "news" rendering path (no separate badge today). Original
// page.tsx did the same.
type DiscussionRow = { id: string; title: string; slug: string; threadType: string; authorName: string; postCount: number; viewCount: number; createdAt: string; linkType: "forum" | "news"; linkHref: string };

interface Props {
  movie: TMDBMovie;
  movieRowId: string | undefined;
  trailerKey: string | null;
  cast: TMDBCastMember[];
  crew: TMDBCrewMember[];
  images: TMDBImage[];
  recommendations: TMDBMovie[];
  streaming: TMDBWatchProvider[] | null;
  rent: TMDBWatchProvider[] | null;
  boxOfficeRanks?: import("@/lib/box-office-queries").MovieRankBadges;
}

export default async function MovieDetailTabsLoader({
  movie,
  movieRowId,
  trailerKey,
  cast,
  crew,
  images,
  recommendations,
  streaming,
  rent,
  boxOfficeRanks,
}: Props) {
  const [reviews, discussions, awards] = await Promise.all([
    (async (): Promise<ReviewRow[]> => {
      if (!movieRowId) return [];
      try {
        const rawReviews = await prisma.movieRating.findMany({
          where: {
            movieId: movieRowId,
            reviewText: { not: null },
            // Exclude drafts. ratistRating is null on drafts.
            ratistRating: { not: null },
          },
          select: {
            id: true,
            reviewText: true,
            ratistRating: true,
            overallRating: true,
            reviewType: true,
            hasSpoilers: true,
            commentsDisabled: true,
            createdAt: true,
            user: { select: { id: true, firebaseUid: true, name: true, avatarUrl: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        });
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
        return rawReviews.map((r) => ({
          ...r,
          commentCount: commentMap.get(r.id) ?? 0,
          likeCount: likeMap.get(r.id) ?? 0,
        }));
      } catch {
        return [];
      }
    })(),

    (async (): Promise<DiscussionRow[]> => {
      try {
        const [linkedThreads, linkedNews, linkedBlog] = await Promise.all([
          prisma.forumThread.findMany({
            where: { media: { some: { tmdbId: movie.id, mediaType: "movie" } } },
            select: {
              id: true, title: true, slug: true, threadType: true, viewCount: true, createdAt: true,
              author: { select: { name: true } },
              _count: { select: { posts: true } },
            },
            orderBy: { updatedAt: "desc" },
            take: 10,
          }),
          prisma.newsItem.findMany({
            where: { published: true, publishedAt: { lte: new Date() }, media: { some: { tmdbId: movie.id, mediaType: "movie" } } },
            select: { id: true, title: true, slug: true, viewCount: true, publishedAt: true, showAuthor: true, author: { select: { name: true } } },
            orderBy: { publishedAt: "desc" },
            take: 5,
          }),
          prisma.blogPost.findMany({
            where: { published: true, publishedAt: { lte: new Date() }, media: { some: { tmdbId: movie.id, mediaType: "movie" } } },
            select: { id: true, title: true, slug: true, type: true, viewCount: true, publishedAt: true, createdAt: true, showAuthor: true, author: { select: { name: true } } },
            orderBy: { publishedAt: "desc" },
            take: 5,
          }),
        ]);
        const forumDiscussions: DiscussionRow[] = linkedThreads.map((t) => ({
          id: t.id, title: t.title, slug: t.slug, threadType: t.threadType,
          authorName: t.author.name, postCount: t._count.posts, viewCount: t.viewCount,
          createdAt: t.createdAt.toISOString(), linkType: "forum", linkHref: `/forum/t/${t.slug}`,
        }));
        const newsDiscussions: DiscussionRow[] = linkedNews.map((n) => ({
          id: n.id, title: n.title, slug: n.slug ?? "", threadType: "news",
          authorName: n.showAuthor !== false ? (n.author?.name ?? "The Ratist") : "The Ratist", postCount: 0, viewCount: n.viewCount,
          createdAt: (n.publishedAt ?? new Date()).toISOString(), linkType: "news", linkHref: `/news/${n.slug}`,
        }));
        // Blog rows reuse linkType: "news" — the renderer only distinguishes
        // forum vs not-forum today. threadType still carries the post-kind
        // for the badge text ("two-thumbs", "movie-map", "blog").
        const blogDiscussions: DiscussionRow[] = linkedBlog.map((b) => {
          const basePath = b.type === "PUNCH_AND_JUDY" ? "/two-thumbs" : b.type === "MOVIE_MAP" ? "/movie-maps" : "/blog";
          const threadType = b.type === "PUNCH_AND_JUDY" ? "two-thumbs" : b.type === "MOVIE_MAP" ? "movie-map" : "blog";
          return {
            id: b.id, title: b.title, slug: b.slug, threadType,
            authorName: b.showAuthor !== false ? (b.author?.name ?? "The Ratist") : "The Ratist", postCount: 0, viewCount: b.viewCount,
            createdAt: b.createdAt.toISOString(), linkType: "news", linkHref: `${basePath}/${b.slug}`,
          };
        });
        return [...newsDiscussions, ...blogDiscussions, ...forumDiscussions]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      } catch {
        return [];
      }
    })(),

    movieRowId ? getMovieAwards(movieRowId).catch(() => [] as Awaited<ReturnType<typeof getMovieAwards>>) : Promise.resolve([] as Awaited<ReturnType<typeof getMovieAwards>>),
  ]);

  return (
    <MovieDetailTabs
      movie={movie}
      trailerKey={trailerKey}
      cast={cast}
      crew={crew}
      images={images}
      recommendations={recommendations}
      streaming={streaming}
      rent={rent}
      reviews={reviews.map((r) => ({
        id: r.id,
        reviewText: r.reviewText ?? "",
        ratistRating: r.ratistRating,
        overallRating: r.overallRating,
        reviewType: r.reviewType,
        hasSpoilers: r.hasSpoilers,
        commentsDisabled: r.commentsDisabled,
        commentCount: r.commentCount,
        likeCount: r.likeCount,
        user: r.user,
        createdAt: r.createdAt.toISOString(),
      }))}
      discussions={discussions}
      awards={awards}
      tmdbId={movie.id}
      boxOfficeRanks={boxOfficeRanks}
    />
  );
}
